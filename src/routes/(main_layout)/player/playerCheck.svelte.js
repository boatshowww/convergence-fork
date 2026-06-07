/**
 * Player Check controller (LOCAL-ONLY slice — Step 2 of the Player Check Interface).
 *
 * Holds the full check lifecycle as Svelte 5 runes state and exposes the actions
 * the three panes call. This is the broadcast scaffold's "brain": Step 3 will swap
 * the GM-side methods (gmStage / gmResolveOldest / grantToken) and the player-side
 * emits to run over the per-game broadcast channel instead of local memory.
 *
 * Design rules enforced here (see docs/Architecture/Mockups/PLAYER_CHECK_UX.md):
 *  - Hidden DC: the player UI never renders a DC. The GM's secret bands live in
 *    BANDS below and are only consulted at resolve time (the GM action) — the
 *    player object only ever ends up with the resolved band TEXT.
 *  - GM narrates first: a committed roll sits in `pending` until gmResolveOldest().
 *  - Two opposite re-rolls: cosmicReroll (funded, keep-highest) vs discard
 *    (unfunded, EJECTS from the queue).
 *  - One pending check per skill.
 */
import { rollD15, rollLuck } from '@lib/dice.js';

/** GM-authored narrative bands (the "secret" the player never sees as numbers). */
const BANDS = [
  { min: 21, cls: 'band-crit', label: 'Critical', text: 'You read it cold: a molecular-scale specimen container. Dormant cells — but the genetic signature is wrong. This is no ordinary cargo. A coded manifest pings against your augment: Secunda.' },
  { min: 16, cls: 'band-success', label: 'Success', text: "A reinforced, refrigerated laboratory specimen container. Whatever's inside is being kept alive at a molecular scale." },
  { min: 11, cls: 'band-partial', label: 'Partial', text: "The box has its own power cell — it's maintaining some internal condition. Cold, sealed, deliberate. Beyond that, you can't crack its purpose." },
  { min: 0, cls: 'band-fail', label: 'No read', text: "A grey box. Heavy. Humming. It tells you nothing it doesn't want to." },
];

/** Game rule: a player can hold at most this many cosmic tokens (no stacking beyond the cap). */
export const MAX_COSMIC_TOKENS = 2;

/** Skills the GM flags on the staged prompt (their secret per-skill DCs are not modeled in this slice). */
const PROMPT_SKILLS = ['Intuition', 'Education', 'Hacking'];

/** Mock crew member so the slice runs without the character-creation flow or a DB. */
const MOCK_CHARACTER = {
  name: 'Vesh Kaur',
  sub: 'Human · Scoundrel / Moonlighter',
  tags: ['Ship Rat', 'Andromeda'],
  luck: 3,
  stats: [
    { l: 'Int', v: 6 }, { l: 'Dex', v: 7 }, { l: 'Str', v: 5 }, { l: 'Cha', v: 8 },
    { l: 'Int·u', v: 6 }, { l: 'Con', v: 5 }, { l: 'Luck', v: 3, luck: true }, { l: 'Wis', v: 5 },
  ],
  skills: [
    { name: 'Persuasion', stat: 'Cha', lv: 6 }, { name: 'Deception', stat: 'Cha', lv: 5 },
    { name: 'Intuition', stat: 'Int·u', lv: 4 }, { name: 'Bartering', stat: 'Cha', lv: 5 },
    { name: 'Stealth', stat: 'Dex', lv: 4 }, { name: 'Hacking', stat: 'Int', lv: 3 },
    { name: 'Education', stat: 'Int', lv: 4 }, { name: 'Perception', stat: 'Int·u', lv: 5 },
    { name: 'Pistols', stat: 'Dex', lv: 3 }, { name: 'First Aid', stat: 'Int·u', lv: 2 },
    { name: 'Performance', stat: 'Cha', lv: 4 }, { name: 'Evasion', stat: 'Dex', lv: 5 },
  ],
};

let seq = 0;
const uid = (prefix) => `${prefix}${++seq}`;

export class PlayerCheck {
  mode = $state('just'); // 'just' | 'check'
  tokens = $state(1);
  stream = $state([]); // ordered list of fiction | prompt | roll items
  pending = $state({}); // skillName -> roll item id (one per skill)
  flagged = $state([]); // skill names the GM has flagged on an open prompt
  dialog = $state({ open: false, skill: null, total: '—' });

  // Reactive so the page can swap the mock for a real character after async load.
  character = $state(MOCK_CHARACTER);
  ready = $state(true);

  // ---- broadcast wiring (set in game mode; null on the mock route) ----
  net = null; // { send, clientId } from makeCheckNet
  me = { playerId: null, characterName: null };
  _aseq = 0;

  attach(net, me) { this.net = net; this.me = { ...this.me, ...me }; }
  _attemptId() { return `${this.net?.clientId ?? 'mock'}:${++this._aseq}`; }
  _findByAttempt(attemptId) { return this.stream.find((i) => i.attemptId === attemptId); }
  _emit(event, data) { this.net?.send(event, data); }

  constructor(character = null) {
    if (character) this.character = character;
    this.stream.push({
      id: uid('f'), kind: 'fiction', who: 'GM · Narration',
      text: 'The C\'than slides a reinforced grey box across the table. "This goes to Virgil." It hums faintly — something inside is being kept very cold, and very alive.',
    });
  }

  get luckStat() { return this.character.luck; }

  isPending(name) { return Boolean(this.pending[name]); }
  isFlagged(name) { return this.flagged.includes(name); }

  setMode(m) { this.mode = m; }
  flipMode() { this.mode = this.mode === 'just' ? 'check' : 'just'; }

  _find(id) { return this.stream.find((i) => i.id === id); }

  // ---- player-initiated rolls -------------------------------------------------
  tapSkill(name) {
    if (this.mode === 'check' && this.pending[name]) { this.requestDiscard(name); return; }
    this.doRoll(name, this.mode);
  }

  /** Map nodes are inherently committal → auto-switch to Check (spec §8, open Q). */
  mapCheck(name) {
    if (this.mode !== 'check') this.setMode('check');
    if (this.pending[name]) { this.requestDiscard(name); return; }
    this.doRoll(name, 'check');
  }

  doRoll(name, mode, opts = {}) {
    const d15 = rollD15();
    const luck = rollLuck(this.luckStat);
    if (luck.cosmic) this.grantToken();

    if (mode === 'just') {
      this.stream.push({
        id: uid('r'), kind: 'roll', source: 'player', skill: name, state: 'unevaluated',
        d15, luck, total: d15.total, cosmicUsed: false, ejected: false, cosmic: null,
        note: 'Thrown for the feel of it — not sent to the GM.',
      });
      return;
    }

    const item = {
      id: uid('c'), attemptId: this._attemptId(), gateId: opts.gateId ?? null,
      kind: 'roll', source: 'player', skill: name, state: 'pending',
      d15, luck, total: d15.total, cosmicUsed: false, ejected: false, cosmic: null, band: null,
      note: 'Waiting for the GM to narrate the outcome. The cosmic window stays open until they do.',
    };
    this.stream.push(item);
    this.pending[name] = item.id;
    // tell the GM about the committed check (DC/resolution happen on their side)
    this._emit('check:attempt', {
      attemptId: item.attemptId, gateId: item.gateId,
      playerId: this.me.playerId, characterName: this.character?.name ?? this.me.characterName ?? 'Player',
      skill: name, total: item.total, crit: d15.crit, fail: d15.fail,
    });
  }

  // ---- re-roll path A: cosmic (funded, keep-highest) --------------------------
  cosmicReroll(itemId, name) {
    if (this.tokens <= 0) return;
    const item = this._find(itemId);
    if (!item || item.state !== 'pending') return;
    this.tokens -= 1;
    const prev = item.total;
    const d15 = rollD15();
    const luck = rollLuck(this.luckStat);
    const kept = Math.max(prev, d15.total);
    item.d15 = d15;
    item.luck = luck;
    item.total = kept;
    item.cosmicUsed = true;
    item.cosmic = { prev, next: d15.total, kept };
    item.note = "Cosmos claimed. The higher of the two stands. Still awaiting the GM's word.";
    this._emit('check:attempt-updated', { attemptId: item.attemptId, total: item.total });
  }

  // ---- re-roll path B: discard (unfunded, EJECTS from queue) -------------------
  requestDiscard(name) {
    const id = this.pending[name];
    const item = id ? this._find(id) : null;
    this.dialog = { open: true, skill: name, total: item ? item.total : '—' };
  }

  cancelDiscard() { this.dialog = { open: false, skill: null, total: '—' }; }

  confirmDiscard() {
    const name = this.dialog.skill;
    const id = this.pending[name];
    if (id) {
      const item = this._find(id);
      if (item) {
        item.state = 'unevaluated';
        item.ejected = true;
        item.cosmic = null;
        item.note = "Removed from the GM's queue by re-rolling. This attempt no longer counts.";
        this._emit('check:attempt-ejected', { attemptId: item.attemptId });
      }
      delete this.pending[name];
    }
    this.cancelDiscard();
    this.doRoll(name, 'just'); // the new roll is itself just a throw
  }

  // ---- prompts: shared by the mock sim AND remote gate-staged events -----------
  _pushPrompt({ gateId, fiction, hint, skills }) {
    this.flagged = [...skills];
    this.stream.push({
      id: gateId, kind: 'prompt', source: 'gm', committed: null,
      fiction, hint: hint ?? '', skills: [...skills],
    });
  }

  /** Commit a flagged skill from a GM prompt card → always a real check (tagged with its gate). */
  gmCommit(promptId, name) {
    if (this.pending[name]) { this.requestDiscard(name); return; }
    const prompt = this._find(promptId);
    if (prompt) prompt.committed = name;
    this.flagged = [];
    this.doRoll(name, 'check', { gateId: promptId });
  }

  // mock GM sim (no game): stage a preset prompt locally
  gmStage() {
    this._pushPrompt({ gateId: uid('p'), fiction: 'You turn the box over. What can you tell about it?', hint: '(different skills read it differently)', skills: PROMPT_SKILLS });
  }

  // ---- remote GM events applied in game mode ----------------------------------
  applyGateStaged({ gateId, fiction, hint, skills }) {
    this._pushPrompt({ gateId, fiction, hint, skills: skills ?? [] });
  }
  applyGateCancelled({ gateId }) {
    const idx = this.stream.findIndex((i) => i.kind === 'prompt' && i.id === gateId);
    if (idx === -1) return;
    const skills = this.stream[idx].skills ?? [];
    this.stream.splice(idx, 1);
    this.flagged = this.flagged.filter((s) => !skills.includes(s));
  }
  applyResolved({ attemptId, skill, bandLabel, bandCls, bandText }) {
    const item = this._findByAttempt(attemptId);
    if (item && item.state === 'pending') {
      item.state = 'resolved';
      item.band = { label: bandLabel, cls: bandCls };
      delete this.pending[item.skill];
    }
    this.stream.push({
      id: uid('f'), kind: 'fiction', source: 'gm', who: 'GM · Narration',
      text: bandText, band: { label: `${skill ?? item?.skill ?? ''} · ${bandLabel}`, cls: bandCls },
    });
  }
  applyDismissed({ attemptId }) {
    const item = this._findByAttempt(attemptId);
    if (!item) return;
    item.state = 'unevaluated';
    item.ejected = true;
    item.cosmic = null;
    item.note = 'Dismissed by the GM.';
    delete this.pending[item.skill];
  }

  gmResolveOldest() {
    const names = Object.keys(this.pending);
    if (names.length === 0) {
      this.stream.push({ id: uid('f'), kind: 'fiction', who: 'GM', text: 'Nothing is queued for resolution right now.' });
      return;
    }
    const name = names[0];
    const item = this._find(this.pending[name]);
    const band = BANDS.find((b) => item.total >= b.min);
    item.state = 'resolved';
    item.band = { label: band.label, cls: band.cls };
    this.stream.push({
      id: uid('f'), kind: 'fiction', who: 'GM · Narration',
      text: band.text, band: { label: `${name} · ${band.label}`, cls: band.cls },
    });
    delete this.pending[name];
  }

  grantToken() { this.tokens = Math.min(MAX_COSMIC_TOKENS, this.tokens + 1); }
}
