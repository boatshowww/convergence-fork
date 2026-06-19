/**
 * Fog of war for the tactical radar — GM-painted reveal strokes (pure data + geometry,
 * no Svelte/Phaser).
 *
 * The fog lives on `engagement.fog = { enabled, strokes }` (created by model.js). A
 * stroke is a brush path: `{ id, r, pts:[{x,y}] }`. The REVEALED region is the union
 * of radius-`r` circles along every stroke's points. Players render only what falls
 * inside a revealed circle (their own ship is always visible); the GM paints the
 * strokes and sees everything faintly, plus the players' coverage footprint.
 *
 * v1 is GM-authored & additive (auto-vision around player ships is a later phase).
 * Serializable → it rides inside the engagement snapshot (broadcast `scene-start`) and
 * the GM's localStorage autosave with no special handling.
 */
export const DEFAULT_BRUSH_KM = 600;

let seq = 0;
const sid = () => `fog${Date.now().toString(36)}${(++seq).toString(36)}`;

export function createFog() {
  return { enabled: false, strokes: [] };
}

/** Ensure an engagement has a fog object (older snapshots / safety). */
export function ensureFog(eng) {
  if (eng && !eng.fog) eng.fog = createFog();
  return eng?.fog ?? null;
}

/** Begin a new stroke at (x,y) with brush radius r; returns the stroke. */
export function startStroke(fog, x, y, r = DEFAULT_BRUSH_KM) {
  const stroke = { id: sid(), r, pts: [{ x, y }] };
  fog.strokes.push(stroke);
  return stroke;
}

/** Extend the latest stroke, throttling points to ~¼-brush spacing. */
export function extendStroke(fog, x, y) {
  const s = fog.strokes[fog.strokes.length - 1];
  if (!s) return;
  const last = s.pts[s.pts.length - 1];
  if (Math.hypot(x - last.x, y - last.y) >= s.r * 0.25) s.pts.push({ x, y });
}

/** Drop the most recent stroke (undo). */
export function undoStroke(fog) {
  fog.strokes.pop();
}

export function clearFog(fog) {
  fog.strokes = [];
}

/** A one-shot reveal blob (seeding a demo, or a future sensor ping). */
export function revealCircle(fog, x, y, r = DEFAULT_BRUSH_KM) {
  fog.strokes.push({ id: sid(), r, pts: [{ x, y }] });
}

/** Is world point (x,y) within any revealed circle? (disabled fog ⇒ all revealed). */
export function isRevealed(fog, x, y) {
  if (!fog || !fog.enabled) return true;
  for (const s of fog.strokes) {
    const r2 = s.r * s.r;
    for (const p of s.pts) {
      const dx = x - p.x, dy = y - p.y;
      if (dx * dx + dy * dy <= r2) return true;
    }
  }
  return false;
}
