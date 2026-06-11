/**
 * RadarController — shared runes state for the tactical radar, role-aware.
 *
 * GM role: authoritative scene owner. Authors the engagement (entities, velocities),
 * enables it (broadcasts a full snapshot), edits live (scene-update), answers
 * players' sync-requests with fresh snapshots, and autosaves every mutation to
 * localStorage (`radar:scene:<gameId>`) so a GM refresh restores the scene.
 *
 * Player role: receives snapshots/updates and renders; its viewer entity is the
 * ship whose ownerSeatId matches the player's seat.
 *
 * Broadcast events (over the existing check/net channel):
 *   GM→all:    radar:scene-start {snapshot} · radar:scene-update {entity}|{removedId}
 *              · radar:scene-end {}
 *   player→GM: radar:sync-request {}
 * (P3 adds plot/turn events; P5 adds radar:fog.)
 */
import { createEngagement, createEntity, snapshotEngagement } from './model.js';
import { evaluateManeuver, resolveTurn } from './maneuver.js';

const storageKey = (gameId) => `radar:scene:${gameId}`;

export class RadarController {
  engagement = $state(null);
  selectedId = $state(null);
  /** GM palette interaction mode: 'move' (drag position) | 'vector' (drag velocity) */
  gmMode = $state('move');
  /**
   * Player plot-course state machine (mockup flow):
   * null | { stage:'target'|'exit'|'confirm', entityId, hover:{x,y}|null,
   *          target:{x,y}|null, maneuver: evaluateManeuver() result | null }
   */
  plotState = $state(null);
  /** Player: my confirmed plot this turn. */
  myPlot = $state(null);
  /** GM: confirmed plots received this turn, entityId -> plot. */
  plots = $state({});

  constructor({ role, gameId = null, seatId = null }) {
    this.role = role; // 'gm' | 'player'
    this.gameId = gameId;
    this.seatId = seatId;
    this.net = null;
    this._listeners = new Set();
    if (role === 'gm') this._restore();
  }

  attach(net) {
    this.net = net;
    if (this.role === 'player') net.send('radar:sync-request', {});
  }

  /** Host's makeCheckNet callback routes radar:* events here. */
  onEvent(event, data) {
    if (this.role === 'player') {
      if (event === 'radar:scene-start') this._applySnapshot(data.snapshot);
      else if (event === 'radar:scene-update') this._applyUpdate(data);
      else if (event === 'radar:scene-end') { this.engagement = null; this._notify(); }
      else if (event === 'radar:turn-result') this._applyTurnResult(data);
    } else if (this.role === 'gm') {
      if (event === 'radar:sync-request') this._broadcastSnapshot();
      else if (event === 'radar:plot') { this.plots[data.entityId] = data.plot; this._notify(); }
    }
  }

  // ---------- Phaser bridge ----------
  bridge() {
    return {
      getEngagement: () => this.engagement,
      getViewerEntityId: () => this.viewerEntityId,
      onSelect: (id) => this._handleSelect(id),
      subscribe: (fn) => { this._listeners.add(fn); return () => this._listeners.delete(fn); },
      getPlotState: () => this.plotState,
      getPlots: () => {
        // plots to draw: GM sees all confirmed; a player sees their own
        if (this.role === 'gm') return Object.entries(this.plots).map(([entityId, plot]) => ({ entityId, plot }));
        return this.myPlot ? [{ entityId: this.myPlot.entityId, plot: this.myPlot.plot }] : [];
      },
      gm: this.role === 'gm' ? {
        getMode: () => this.gmMode,
        onDragMove: (id, x, y) => this.updateEntity(id, { x, y }, { silent: true }),
        onDragVector: (id, vx, vy) => this.updateEntity(id, { vx, vy }, { silent: true }),
        onDragEnd: (id) => this._afterMutation(this.engagement?.entities.find((e) => e.id === id)),
      } : null,
      player: this.role === 'player' ? {
        isPlotting: () => Boolean(this.plotState),
        onPlotHover: (x, y) => this.hoverPlot(x, y),
        onPlotClick: (x, y) => this.clickPlot(x, y),
      } : null,
    };
  }

  _handleSelect(id) {
    this.selectedId = id;
    // Player: tapping your own ship during planning starts plotting a course.
    // (P4 turns this into the full action menu; Plot Course remains the default.)
    if (this.role === 'player' && id && id === this.viewerEntityId
        && this.engagement?.phase === 'planning' && !this.plotState && !this.myPlot) {
      this.beginPlot(id);
    }
  }

  // ---------- player: plot-course state machine (mockup flow) ----------
  beginPlot(entityId) {
    this.plotState = { stage: 'target', entityId, hover: null, target: null, maneuver: null };
    this._notify();
  }

  _plotEntity() {
    return this.engagement?.entities.find((e) => e.id === this.plotState?.entityId) ?? null;
  }

  hoverPlot(x, y) {
    const ps = this.plotState;
    const e = this._plotEntity();
    if (!ps || !e) return;
    ps.hover = { x, y };
    if (ps.stage === 'target') ps.maneuver = evaluateManeuver(e, { x, y });
    else if (ps.stage === 'exit') ps.maneuver = evaluateManeuver(e, ps.target, { x: x - ps.target.x, y: y - ps.target.y });
    this._notify();
  }

  clickPlot(x, y) {
    const ps = this.plotState;
    const e = this._plotEntity();
    if (!ps || !e) return;
    if (ps.stage === 'target') {
      const m = evaluateManeuver(e, { x, y });
      if (!m.valid) return; // can't lock an unreachable point
      ps.target = { x, y };
      ps.maneuver = m;
      ps.stage = 'exit';
    } else if (ps.stage === 'exit') {
      ps.maneuver = evaluateManeuver(e, ps.target, { x: x - ps.target.x, y: y - ps.target.y });
      if (!ps.maneuver.valid) return;
      ps.stage = 'confirm'; // overlay shows Confirm Maneuver? yes/no
    }
    this._notify();
  }

  cancelPlot() { this.plotState = null; this._notify(); }

  confirmPlot() {
    const ps = this.plotState;
    if (!ps || ps.stage !== 'confirm' || !ps.maneuver?.valid) return;
    const plot = {
      target: ps.maneuver.target,
      newVel: ps.maneuver.newVel,
      newSpeed: ps.maneuver.newSpeed,
      gForce: ps.maneuver.gForce,
      fuelCost: ps.maneuver.fuelCost,
    };
    this.myPlot = { entityId: ps.entityId, plot };
    this.plotState = null;
    this.net?.send('radar:plot', { entityId: ps.entityId, plot });
    this._notify();
  }

  // ---------- GM: WEGO turn execution ----------
  get readiness() {
    if (this.role !== 'gm' || !this.engagement) return [];
    return this.engagement.entities
      .filter((e) => e.kind === 'ship' && e.ownerSeatId != null)
      .map((e) => ({ id: e.id, name: e.name, ready: Boolean(this.plots[e.id]) }));
  }

  executeTurn() {
    if (this.role !== 'gm' || !this.engagement || this.engagement.status !== 'active') return;
    this.engagement.entities = resolveTurn(this.engagement.entities, this.plots);
    this.engagement.turn += 1;
    this.plots = {};
    this._save(); this._notify();
    this.net?.send('radar:turn-result', {
      turn: this.engagement.turn,
      entities: snapshotEngagement(this.engagement).entities,
    });
  }

  _applyTurnResult({ turn, entities }) {
    if (!this.engagement) return;
    this.engagement.entities = entities;
    this.engagement.turn = turn;
    this.myPlot = null;
    this.plotState = null;
    this._notify();
  }

  get viewerEntityId() {
    if (this.role !== 'player' || !this.engagement) return null;
    return this.engagement.entities.find((e) => e.ownerSeatId === this.seatId)?.id ?? null;
  }

  get selectedEntity() {
    return this.engagement?.entities.find((e) => e.id === this.selectedId) ?? null;
  }

  _notify() { this._listeners.forEach((fn) => fn()); }

  // ---------- GM: authoring ----------
  newScene({ kind = 'ship', name = 'Engagement' } = {}) {
    this.engagement = createEngagement({ kind, name });
    this.selectedId = null;
    this._afterMutation();
  }

  addEntity(props = {}) {
    if (!this.engagement) this.newScene();
    // spawn offset so stacked adds don't overlap at origin
    const n = this.engagement.entities.length;
    const entity = createEntity({ x: (n % 5) * 400 - 800, y: Math.floor(n / 5) * 400 - 400, ...props });
    this.engagement.entities.push(entity);
    this.selectedId = entity.id;
    this._afterMutation(entity);
    return entity;
  }

  updateEntity(id, patch, { silent = false } = {}) {
    const e = this.engagement?.entities.find((x) => x.id === id);
    if (!e) return;
    Object.assign(e, patch);
    if (silent) this._notify(); // live drag: redraw locally, broadcast on drag end
    else this._afterMutation(e);
  }

  removeEntity(id) {
    if (!this.engagement) return;
    this.engagement.entities = this.engagement.entities.filter((e) => e.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    this._save(); this._notify();
    if (this.engagement.status === 'active') this.net?.send('radar:scene-update', { removedId: id });
  }

  enable() {
    if (!this.engagement) return;
    this.engagement.status = 'active';
    this._save(); this._notify();
    this._broadcastSnapshot();
  }

  end() {
    if (!this.engagement) return;
    this.engagement.status = 'ended';
    this.net?.send('radar:scene-end', {});
    this.engagement = null;
    this._save(); this._notify();
  }

  _afterMutation(entity = null) {
    this._save();
    this._notify();
    if (this.engagement?.status === 'active' && entity) {
      this.net?.send('radar:scene-update', { entity: { ...entity } });
    }
  }

  _broadcastSnapshot() {
    if (this.role !== 'gm' || this.engagement?.status !== 'active') return;
    this.net?.send('radar:scene-start', { snapshot: snapshotEngagement(this.engagement) });
  }

  // ---------- player: applying ----------
  _applySnapshot(snapshot) {
    if (!snapshot || snapshot.status !== 'active') return;
    this.engagement = snapshot;
    this._notify();
  }

  _applyUpdate({ entity, removedId }) {
    if (!this.engagement) return;
    if (removedId) {
      this.engagement.entities = this.engagement.entities.filter((e) => e.id !== removedId);
    } else if (entity) {
      const i = this.engagement.entities.findIndex((e) => e.id === entity.id);
      if (i === -1) this.engagement.entities.push(entity);
      else this.engagement.entities[i] = { ...this.engagement.entities[i], ...entity };
    }
    this._notify();
  }

  // ---------- GM persistence (localStorage; survives GM refresh) ----------
  _save() {
    if (this.role !== 'gm' || !this.gameId || typeof localStorage === 'undefined') return;
    try {
      if (this.engagement) localStorage.setItem(storageKey(this.gameId), JSON.stringify(snapshotEngagement(this.engagement)));
      else localStorage.removeItem(storageKey(this.gameId));
    } catch { /* storage full/unavailable — non-fatal */ }
  }

  _restore() {
    if (!this.gameId || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey(this.gameId));
      if (raw) this.engagement = JSON.parse(raw);
    } catch { /* corrupt — start fresh */ }
  }
}
