/**
 * The tactical radar Phaser scene.
 *
 * Pure Phaser (no Svelte imports). The host supplies a `bridge`:
 *   {
 *     getEngagement(): engagement | null   // current scene state (model.js shape)
 *     getViewerEntityId(): string | null   // the entity this client is centered on
 *     onSelect(entityId | null): void      // entity tapped (null = empty space)
 *     subscribe(fn): unsubscribe           // notify on state changes -> scene redraws
 *   }
 *
 * Phaser is dynamically imported by RadarCanvas, so this exports a factory that
 * receives the Phaser namespace and returns the Scene class.
 */
import { DRAW_DISTANCE_KM, RING_SPACING_KM, TURN_SECONDS, speedOf } from '../model.js';
import { navigableRadius, plotBounds } from '../maneuver.js';

// Aeterna palette (matches the app CSS vars)
export const COLORS = {
  void: 0x070d12,
  ring: 0x1d3644,
  ringBright: 0x2b5468,
  own: 0x3fd0c9,   // teal — the viewer's ship
  ship: 0x9ad7e8,  // other friendly ships
  bogey: 0xe8b667, // gold — unknown/hostile
  debris: 0x6f8d97,
  label: 0xcfe6ec,
  dim: 0x456069,
};

export function makeRadarScene(Phaser) {
  return class RadarScene extends Phaser.Scene {
    constructor(bridge) {
      super({ key: 'radar' });
      this.bridge = bridge;
      this.unsub = null;
      this.selectedId = null;
    }

    create() {
      this.cameras.main.setBackgroundColor(COLORS.void);

      // layers (draw order)
      this.gRings = this.add.graphics();
      this.gVectors = this.add.graphics();
      this.gPlot = this.add.graphics();
      this.gEntities = this.add.graphics();
      this.gSelection = this.add.graphics();
      this.labels = this.add.group();

      this.fitCamera();
      this.redraw();

      this.unsub = this.bridge.subscribe?.(() => this.redraw());

      // entity picking: nearest entity within tap radius (world km)
      this.dragId = null;
      this.input.on('pointerdown', (pointer) => {
        const eng = this.bridge.getEngagement();
        if (!eng) return;
        const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        // plot mode captures clicks (target point, then exit trajectory)
        if (this.bridge.player?.isPlotting()) {
          this.bridge.player.onPlotClick(wp.x, wp.y);
          return;
        }
        const pickR = 28 / this.cameras.main.zoom; // ~28 px in world units
        let best = null, bestD = pickR;
        for (const e of eng.entities) {
          const d = Math.hypot(e.x - wp.x, e.y - wp.y);
          if (d < bestD) { best = e; bestD = d; }
        }
        this.selectedId = best?.id ?? null;
        this.bridge.onSelect?.(this.selectedId);
        if (this.bridge.gm && best) this.dragId = best.id; // GM: start drag on the picked entity
        this.drawSelection();
      });

      // GM drag: move the entity (mode 'move') or set its velocity vector (mode
      // 'vector' — the arrow tip is where it will be in one turn, so dragging the
      // drift point feels natural).
      this.input.on('pointermove', (pointer) => {
        // plot mode: live preview follows the cursor
        if (this.bridge.player?.isPlotting()) {
          const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
          this.bridge.player.onPlotHover(wp.x, wp.y);
          return;
        }
        if (!this.dragId || !this.bridge.gm || !pointer.isDown) return;
        const eng = this.bridge.getEngagement();
        const e = eng?.entities.find((x) => x.id === this.dragId);
        if (!e) return;
        const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        if (this.bridge.gm.getMode() === 'vector') {
          this.bridge.gm.onDragVector(e.id, (wp.x - e.x) / TURN_SECONDS, (wp.y - e.y) / TURN_SECONDS);
        } else {
          this.bridge.gm.onDragMove(e.id, wp.x, wp.y);
        }
      });
      this.input.on('pointerup', () => {
        if (this.dragId && this.bridge.gm) this.bridge.gm.onDragEnd(this.dragId);
        this.dragId = null;
      });

      this.scale.on('resize', () => { this.fitCamera(); this.redraw(); });
      this.events.on('shutdown', () => this.unsub?.());
    }

    viewer() {
      const eng = this.bridge.getEngagement();
      const id = this.bridge.getViewerEntityId?.();
      return eng?.entities.find((e) => e.id === id) ?? null;
    }

    /** Center on the viewer ship (or origin) and zoom so the draw distance fits. */
    fitCamera() {
      const cam = this.cameras.main;
      const v = this.viewer();
      const { width, height } = this.scale.gameSize;
      cam.setZoom(Math.min(width, height) / (2 * DRAW_DISTANCE_KM * 1.06));
      cam.centerOn(v?.x ?? 0, v?.y ?? 0);
    }

    redraw() {
      const eng = this.bridge.getEngagement();
      this.gRings.clear(); this.gVectors.clear(); this.gEntities.clear(); this.gPlot.clear();
      this.labels.clear(true, true);
      if (!eng) { this.drawSelection(); return; }

      const v = this.viewer();
      const cx = v?.x ?? 0, cy = v?.y ?? 0;
      this.fitCamera();

      // range rings around the viewer + draw-distance edge
      for (let r = RING_SPACING_KM; r < DRAW_DISTANCE_KM; r += RING_SPACING_KM) {
        this.gRings.lineStyle(1 / this.cameras.main.zoom, COLORS.ring, 0.5);
        this.gRings.strokeCircle(cx, cy, r);
      }
      this.gRings.lineStyle(2 / this.cameras.main.zoom, COLORS.ringBright, 0.9);
      this.gRings.strokeCircle(cx, cy, DRAW_DISTANCE_KM);

      // viewer's navigable-radius inner circle (mockup: 690 km at 46 km/s)
      if (v) {
        this.gRings.lineStyle(1.5 / this.cameras.main.zoom, COLORS.own, 0.55);
        this.gRings.strokeCircle(v.x, v.y, navigableRadius(v));
      }

      for (const e of eng.entities) this.drawEntity(e, v);
      this.drawPlots(eng);
      this.drawPlotting();
      this.drawSelection();
    }

    /** Confirmed plots (player: own; GM: everyone's) — dashed path + exit arrow. */
    drawPlots(eng) {
      const zoom = this.cameras.main.zoom;
      const px = (n) => n / zoom;
      for (const { entityId, plot } of this.bridge.getPlots?.() ?? []) {
        const e = eng.entities.find((x) => x.id === entityId);
        if (!e || !plot) continue;
        this.dashedLine(this.gPlot, e.x, e.y, plot.target.x, plot.target.y, px(10), COLORS.own, 0.8, px(1.5));
        this.gPlot.fillStyle(COLORS.own, 0.9);
        this.gPlot.fillCircle(plot.target.x, plot.target.y, px(4));
        const ex = plot.target.x + plot.newVel.vx * TURN_SECONDS;
        const ey = plot.target.y + plot.newVel.vy * TURN_SECONDS;
        this.arrow(this.gPlot, plot.target.x, plot.target.y, ex, ey, COLORS.own, 0.5, px(1.2));
      }
    }

    /** Live plot-course interaction: bounds, hover ghost, locked target, exit vector. */
    drawPlotting() {
      const ps = this.bridge.getPlotState?.();
      if (!ps) return;
      const eng = this.bridge.getEngagement();
      const e = eng?.entities.find((x) => x.id === ps.entityId);
      if (!e) return;
      const zoom = this.cameras.main.zoom;
      const px = (n) => n / zoom;
      const valid = ps.maneuver?.valid;
      const color = valid === false ? 0xd05a4f : COLORS.own;

      // selectable bounds for this turn (mockup: "guidelines ... for trajectory change")
      const b = plotBounds(e);
      this.gPlot.lineStyle(px(1.2), COLORS.ringBright, 0.8);
      this.gPlot.strokeCircle(b.cx, b.cy, b.radius);

      if (ps.stage === 'target' && ps.hover) {
        this.dashedLine(this.gPlot, e.x, e.y, ps.hover.x, ps.hover.y, px(10), color, 0.8, px(1.5));
        this.gPlot.lineStyle(px(1.5), color, 0.9);
        this.gPlot.strokeCircle(ps.hover.x, ps.hover.y, px(6));
      }
      if (ps.stage !== 'target' && ps.target) {
        this.dashedLine(this.gPlot, e.x, e.y, ps.target.x, ps.target.y, px(10), COLORS.own, 0.9, px(1.5));
        this.gPlot.fillStyle(COLORS.own, 1);
        this.gPlot.fillCircle(ps.target.x, ps.target.y, px(5));
        // exit trajectory: from the locked target toward the hover (or confirmed dir)
        const dir = ps.stage === 'exit' && ps.hover ? ps.hover : (ps.maneuver ? {
          x: ps.target.x + ps.maneuver.newVel.vx * TURN_SECONDS,
          y: ps.target.y + ps.maneuver.newVel.vy * TURN_SECONDS,
        } : null);
        if (dir) this.arrow(this.gPlot, ps.target.x, ps.target.y, dir.x, dir.y, color, 0.9, px(1.5));
      }
    }

    dashedLine(g, x1, y1, x2, y2, dash, color, alpha, width) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 1) return;
      const n = Math.max(1, Math.floor(len / (dash * 2)));
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      g.lineStyle(width, color, alpha);
      for (let i = 0; i < n; i++) {
        const s = i * dash * 2;
        g.lineBetween(x1 + ux * s, y1 + uy * s, x1 + ux * Math.min(s + dash, len), y1 + uy * Math.min(s + dash, len));
      }
    }

    arrow(g, x1, y1, x2, y2, color, alpha, width) {
      g.lineStyle(width, color, alpha);
      g.lineBetween(x1, y1, x2, y2);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const ah = 8 / this.cameras.main.zoom;
      g.lineBetween(x2, y2, x2 - ah * Math.cos(ang - 0.4), y2 - ah * Math.sin(ang - 0.4));
      g.lineBetween(x2, y2, x2 - ah * Math.cos(ang + 0.4), y2 - ah * Math.sin(ang + 0.4));
    }

    entityColor(e, v) {
      if (v && e.id === v.id) return COLORS.own;
      return COLORS[e.kind] ?? COLORS.debris;
    }

    drawEntity(e, v) {
      const zoom = this.cameras.main.zoom;
      const px = (n) => n / zoom; // convert screen px to world units
      const color = this.entityColor(e, v);
      const g = this.gEntities;
      const speed = speedOf(e);

      // velocity vector: where it will be in one turn, with arrowhead
      if (speed > 0.01) {
        const tx = e.x + e.vx * TURN_SECONDS, ty = e.y + e.vy * TURN_SECONDS;
        this.gVectors.lineStyle(px(1.5), color, 0.8);
        this.gVectors.lineBetween(e.x, e.y, tx, ty);
        const ang = Math.atan2(ty - e.y, tx - e.x);
        const ah = px(8);
        this.gVectors.lineBetween(tx, ty, tx - ah * Math.cos(ang - 0.4), ty - ah * Math.sin(ang - 0.4));
        this.gVectors.lineBetween(tx, ty, tx - ah * Math.cos(ang + 0.4), ty - ah * Math.sin(ang + 0.4));
      }

      // marker
      g.fillStyle(color, 1);
      g.lineStyle(px(1.5), color, 1);
      if (e.kind === 'debris') {
        g.fillCircle(e.x, e.y, px(4));
      } else if (e.kind === 'bogey') {
        const s = px(9); // diamond
        g.beginPath();
        g.moveTo(e.x, e.y - s); g.lineTo(e.x + s, e.y); g.lineTo(e.x, e.y + s); g.lineTo(e.x - s, e.y);
        g.closePath(); g.strokePath();
      } else {
        // ship: triangle pointing along heading
        const ang = speed > 0.01 ? Math.atan2(e.vy, e.vx) : -Math.PI / 2;
        const s = px(11);
        const pts = [
          { x: e.x + s * Math.cos(ang), y: e.y + s * Math.sin(ang) },
          { x: e.x + s * 0.7 * Math.cos(ang + 2.5), y: e.y + s * 0.7 * Math.sin(ang + 2.5) },
          { x: e.x + s * 0.7 * Math.cos(ang - 2.5), y: e.y + s * 0.7 * Math.sin(ang - 2.5) },
        ];
        g.fillPoints(pts, true);
      }

      // label: name + speed
      const zoomScale = 1 / zoom;
      const label = this.add.text(e.x + px(12), e.y + px(8),
        `${e.name}${speed > 0.01 ? `\n${Math.round(speed)} km/s` : ''}`,
        { fontFamily: 'Chakra Petch, sans-serif', fontSize: '13px', color: '#cfe6ec', align: 'left' });
      label.setScale(zoomScale).setAlpha(0.9).setOrigin(0, 0);
      this.labels.add(label);
    }

    drawSelection() {
      this.gSelection.clear();
      if (!this.selectedId) return;
      const eng = this.bridge.getEngagement();
      const e = eng?.entities.find((x) => x.id === this.selectedId);
      if (!e) return;
      const zoom = this.cameras.main.zoom;
      this.gSelection.lineStyle(2 / zoom, COLORS.own, 0.9);
      this.gSelection.strokeCircle(e.x, e.y, 18 / zoom);
    }
  };
}
