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

const storageKey = (gameId) => `radar:scene:${gameId}`;

export class RadarController {
  engagement = $state(null);
  selectedId = $state(null);
  /** GM palette interaction mode: 'move' (drag position) | 'vector' (drag velocity) */
  gmMode = $state('move');

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
    } else if (this.role === 'gm') {
      if (event === 'radar:sync-request') this._broadcastSnapshot();
    }
  }

  // ---------- Phaser bridge ----------
  bridge() {
    return {
      getEngagement: () => this.engagement,
      getViewerEntityId: () => this.viewerEntityId,
      onSelect: (id) => { this.selectedId = id; },
      subscribe: (fn) => { this._listeners.add(fn); return () => this._listeners.delete(fn); },
      gm: this.role === 'gm' ? {
        getMode: () => this.gmMode,
        onDragMove: (id, x, y) => this.updateEntity(id, { x, y }, { silent: true }),
        onDragVector: (id, vx, vy) => this.updateEntity(id, { vx, vy }, { silent: true }),
        onDragEnd: (id) => this._afterMutation(this.engagement?.entities.find((e) => e.id === id)),
      } : null,
    };
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
