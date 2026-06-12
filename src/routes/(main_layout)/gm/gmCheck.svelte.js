/**
 * Game Master check controller.
 *
 * The GM stages checks (with per-skill DCs that stay on this client — only the
 * skill names are broadcast), receives players' committed attempts into a live
 * queue, and resolves them. The outcome band is implicit: derived from the rolled
 * total vs the DC (see src/lib/check/bands.js). The DC is set at stage time, or
 * entered on the fly when a player initiates a check the GM didn't stage.
 *
 * Wires to the per-game broadcast channel via makeCheckNet (set with attach()).
 */
import { deriveBand } from '@lib/check/bands.js';

let seq = 0;
const uid = (p) => `${p}${++seq}`;

export class GmCheck {
  gates = $state([]); // [{ gateId, fiction, skills: [{ name, dc }] }] — DCs are secret/local
  queue = $state([]); // incoming player attempts awaiting resolution
  log = $state([]);   // resolved/dismissed history (most recent first)

  net = null;
  attach(net) { this.net = net; }
  _emit(event, data) { this.net?.send(event, data); }

  // ---- staging -----------------------------------------------------------------
  /** @param {string} fiction @param {Array<{name:string, dc:any}>} skillRows */
  stageGate(fiction, skillRows) {
    const skills = (skillRows ?? []).filter((s) => s.name && s.name.trim())
      .map((s) => ({ name: s.name.trim(), dc: s.dc === '' || s.dc == null ? null : Number(s.dc) }));
    if (skills.length === 0) return null;
    const gateId = uid('g');
    const gate = { gateId, fiction: (fiction ?? '').trim() || 'Make a check.', skills };
    this.gates.push(gate);
    // broadcast only the player-facing parts — DCs stay here
    this._emit('check:gate-staged', { gateId, fiction: gate.fiction, skills: skills.map((s) => s.name) });
    return gate;
  }

  cancelGate(gateId) {
    const i = this.gates.findIndex((g) => g.gateId === gateId);
    if (i !== -1) this.gates.splice(i, 1);
    this._emit('check:gate-cancelled', { gateId });
  }

  _dcFor(gateId, skill) {
    const row = this.gates.find((g) => g.gateId === gateId)?.skills.find((s) => s.name === skill);
    return row && row.dc != null ? Number(row.dc) : null;
  }

  // ---- incoming player attempts ------------------------------------------------
  applyAttempt(d) {
    if (this.queue.some((q) => q.attemptId === d.attemptId)) return;
    this.queue.push({
      attemptId: d.attemptId, gateId: d.gateId ?? null,
      playerId: d.playerId, characterName: d.characterName ?? 'Player',
      skill: d.skill, total: d.total, crit: !!d.crit, fail: !!d.fail,
      radar: d.radar ?? null, // radar combat action context (target, geometry)
      // DC pre-fill priority: staged gate -> radar geometry suggestion -> blank
      dc: this._dcFor(d.gateId, d.skill) ?? d.radar?.suggestedDc ?? '',
      narration: '',
    });
  }
  applyAttemptUpdated(d) {
    const q = this.queue.find((x) => x.attemptId === d.attemptId);
    if (q) q.total = d.total;
  }
  applyAttemptEjected(d) {
    const i = this.queue.findIndex((x) => x.attemptId === d.attemptId);
    if (i !== -1) this.queue.splice(i, 1);
  }

  // ---- resolution --------------------------------------------------------------
  /** The implicit band for a queue row, or null if no DC is set yet. */
  bandFor(q) {
    if (q.dc === '' || q.dc == null) return null;
    return deriveBand(Number(q.total), Number(q.dc), { crit: q.crit, fail: q.fail });
  }

  resolve(attemptId) {
    const q = this.queue.find((x) => x.attemptId === attemptId);
    if (!q) return;
    const band = this.bandFor(q);
    if (!band) return; // needs a DC first
    const text = q.narration?.trim() || band.label;
    this._emit('check:resolved', { attemptId, skill: q.skill, bandLabel: band.label, bandCls: band.cls, bandText: text });
    this.log.unshift({ characterName: q.characterName, skill: q.skill, total: q.total, dc: q.dc, band: band.label, kind: 'resolved' });
    this.queue = this.queue.filter((x) => x.attemptId !== attemptId);
  }

  dismiss(attemptId) {
    const q = this.queue.find((x) => x.attemptId === attemptId);
    this._emit('check:attempt-dismissed', { attemptId });
    if (q) this.log.unshift({ characterName: q.characterName, skill: q.skill, total: q.total, band: 'dismissed', kind: 'dismissed' });
    this.queue = this.queue.filter((x) => x.attemptId !== attemptId);
  }

  grantToken(playerId) { this._emit('check:token-granted', { playerId }); }
}
