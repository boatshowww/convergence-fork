<script>
  // Player Check Interface (standalone slice).
  // Ports the prototype (docs/Architecture/Mockups/player-interface.html) to Svelte.
  // The check lifecycle is still driven by local runes state (PlayerCheck) + the GM
  // Sim bar; Step 3 of the build plan moves that onto the per-game broadcast channel.
  //
  // Data association: with ?game_id=<id> the page resolves YOUR player seat in that
  // game, confirms the seat's role is Player (Option A: role-determined view), and
  // feeds your real character into the sheet. Without a game_id it stays a local
  // sandbox on a mock character.
  import { getContext, setContext, onMount } from 'svelte';
  import { page } from '$app/state';
  import { getPath } from '@utils/navigation';
  import { makeCheckNet } from '@lib/check/net.js';
  import { PlayerCheck } from './playerCheck.svelte.js';
  import { makeDemoRadar } from '@lib/radar/demo.js';
  import { RadarController } from '@lib/radar/radarState.svelte.js';
  import CharacterSheet from './components/CharacterSheet.svelte';
  import StarMap from './components/StarMap.svelte';
  import RadarPane from './components/RadarPane.svelte';
  import CheckLog from './components/CheckLog.svelte';

  const store = getContext('store');
  const check = new PlayerCheck();
  setContext('check', check);
  let net = null;

  // Mock sandbox: a demo ship engagement so the radar (and the full plot-course
  // flow) runs without a GM/DB. In a real game the radar appears when the GM
  // enables an engagement.
  const demoRadar = makeDemoRadar();
  let radar = $state(null);

  // Radar combat actions roll through the existing check system (one pending
  // check per skill still applies — a second attempt triggers the discard guard).
  function radarAction(a) {
    if (check.pending[a.skill]) check.requestDiscard(a.skill);
    else check.doRoll(a.skill, 'check', { radar: a });
  }
  demoRadar.onAction = radarAction;

  let status = $state('mock'); // mock | loading | ready | error | no-character
  let statusMsg = $state('');
  let gameId = $state(null);
  let isGM = $state(false); // also the GM here? -> offer a "switch to GM view" link

  onMount(() => {
    gameId = page.url.searchParams.get('game_id');
    if (!gameId) return; // no game context -> local sandbox with the mock character

    status = 'loading';
    (async () => {
      try {
        await store.checkAuth?.(); // ensure the session/user is resolved before seat lookup
        await store.load_game(gameId, true);
        await store.subscribeRealtime(gameId);
        await Promise.all([store.load_skills?.(), store.load_stats?.()]);
        await store.data.game.load_players();

        // The player view is gated on HAVING A CHARACTER in this game (not on seat
        // role) so a GM who brought their own character can also play here.
        const seat = store.data.players.find((p) => p.user_id === store.user?.id);
        isGM = seat?.role?.name === 'Game Master' || store.data.game?.user_id === store.user?.id;
        const characters = seat?.characters ?? [];
        const character = characters.find((c) => c.is_primary) ?? characters[0];
        if (!character) {
          status = 'no-character';
          statusMsg = isGM
            ? "You haven't brought a character to this game. Add one from My Characters to play, or switch to GM view."
            : 'You have no character in this game. Add one from My Characters, or join with an invite code.';
          return;
        }

        check.character = buildCharacterVM(character);
        check.ready = true;
        // persist the cosmic-token economy on this character row (survives refresh)
        check.tokens = character.cosmic_tokens ?? 0;
        check.persistTokens = (n) => store.save_cosmic_tokens(character.id, n);

        // radar: receive GM-authored engagements (viewer = the ship owned by our seat)
        radar = new RadarController({ role: 'player', gameId, seatId: seat.id });
        radar.onAction = radarAction;

        // wire the broadcast channel: emit our attempts, apply the GM's events
        net = makeCheckNet(store, (event, data) => {
          if (event === 'check:gate-staged') check.applyGateStaged(data);
          else if (event === 'check:gate-cancelled') check.applyGateCancelled(data);
          else if (event === 'check:resolved') check.applyResolved(data);
          else if (event === 'check:attempt-dismissed') check.applyDismissed(data);
          else if (event === 'check:token-granted' && data.playerId === seat.id) check.grantToken();
          else if (event.startsWith('radar:')) radar.onEvent(event, data);
        });
        check.attach(net, { playerId: seat.id, characterName: character.name });
        radar.attach(net);

        status = 'ready';
      } catch (e) {
        status = 'error';
        statusMsg = String(e?.message ?? e);
      }
    })();

    return () => { net?.dispose(); store.clearGameData?.(); };
  });

  // Map a real character row (with createCharacter helpers) to the sheet's view-model.
  function buildCharacterVM(ch) {
    const statName = (id) => store.data.stats?.find((s) => s.id === id)?.name ?? '';
    let skills = [];
    try {
      skills = (ch.getSkills?.() ?? []).map((s) => ({
        name: s.name,
        stat: statName(s.skill?.stat_id).slice(0, 4),
        lv: s.level ?? 0,
      }));
    } catch {
      skills = [];
    }
    return {
      name: ch.name,
      sub: [ch.race?.name, ch.subclass?.name].filter(Boolean).join(' · ') || ch.background || 'Unaffiliated',
      tags: [],
      luck: ch.luck ?? 0,
      stats: [
        { l: 'Int', v: ch.intelligence }, { l: 'Dex', v: ch.dexterity }, { l: 'Str', v: ch.strength },
        { l: 'Cha', v: ch.charisma }, { l: 'Intu', v: ch.intuition }, { l: 'Luck', v: ch.luck, luck: true },
        { l: 'Con', v: ch.constitution },
      ],
      skills,
    };
  }
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Spectral:ital,wght@0,400;0,500;0,600;1,400&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="player-scope">
  {#if status === 'loading'}
    <div class="pc-msg">Loading game…</div>
  {:else if status === 'error' || status === 'no-character'}
    <div class="pc-msg">
      {statusMsg}
      {#if isGM && gameId}<br /><a class="pc-switch" href={getPath('/gm?game_id=' + gameId)}>⇄ Switch to GM view</a>{/if}
    </div>
  {:else}
  {#if isGM && gameId}<a class="pc-switch floating" href={getPath('/gm?game_id=' + gameId)}>⇄ GM view</a>{/if}
  <div class="app">
    <CharacterSheet />
    {#if status === 'mock'}
      <RadarPane bridge={demoRadar.bridge()} radar={demoRadar} title="Tactical (demo)" subtitle="Hullusta · Refinery District" />
    {:else if radar?.engagement?.status === 'active'}
      <RadarPane bridge={radar.bridge()} {radar} title="Tactical" subtitle={radar.engagement.name} />
    {:else}
      <StarMap />
    {/if}
    <CheckLog />
  </div>

  <!-- discard confirm dialog -->
  <div class="scrim {check.dialog.open ? 'on' : ''}">
    <div class="dialog">
      <div class="dialog-head">Discard pending result?</div>
      <div class="dialog-body">
        Your <b>{check.dialog.skill}</b> roll ({check.dialog.total}) is still with the GM. Rolling again
        <b>removes it from the resolution queue entirely</b> — it will not be narrated or counted. You'll just be throwing dice.
      </div>
      <div class="dialog-acts">
        <button type="button" class="dbtn keep" onclick={() => check.cancelDiscard()}>Keep Waiting</button>
        <button type="button" class="dbtn proceed" onclick={() => check.confirmDiscard()}>Roll Anyway</button>
      </div>
    </div>
  </div>

  <!-- GM simulation bar (stand-in for the GM's separate interface; Step 3 -> broadcast) -->
  <div class="simbar">
    <span class="sim-label">GM Sim ▸</span>
    <button type="button" class="simbtn" onclick={() => check.gmStage()}>Stage a check (Intuition·Education·Hacking)</button>
    <button type="button" class="simbtn" onclick={() => check.gmResolveOldest()}>Narrate &amp; resolve oldest pending</button>
    <button type="button" class="simbtn" onclick={() => check.grantToken()}>Grant cosmic token</button>
    <span class="sim-note">— stand-ins for the GM's separate interface</span>
  </div>
  {/if}
</div>

<style>
  /* All prototype styling is contained under .player-scope so the generic class
     names (.card/.skill/.stat/.roll/.dice/...) cannot leak into the rest of the app. */
  .player-scope {
    --void: #070d12;
    --void-2: #0b141c;
    --panel: #0e1a24;
    --panel-2: #12222e;
    --edge: #1d3644;
    --edge-bright: #2b5468;
    --teal: #3fd0c9;
    --teal-dim: #1f6f74;
    --gold: #e8b667;
    --gold-bright: #ffd089;
    --ink: #cfe6ec;
    --ink-dim: #6f8d97;
    --ink-faint: #456069;
    --crit: #ffe08a;
    --fail: #d05a4f;
    --glow-teal: 0 0 24px rgba(63, 208, 201, 0.35);
    --glow-gold: 0 0 28px rgba(232, 182, 103, 0.45);
    --pc-header: 52px;

    position: relative;
    height: calc(100vh - var(--pc-header));
    overflow: hidden;
    color: var(--ink);
    font-family: 'Spectral', serif;
    background:
      radial-gradient(ellipse 60% 50% at 50% 42%, rgba(34, 90, 96, 0.22), transparent 60%),
      radial-gradient(ellipse 120% 80% at 30% 0%, rgba(40, 70, 90, 0.18), transparent 55%),
      radial-gradient(ellipse 120% 80% at 80% 100%, rgba(50, 80, 70, 0.14), transparent 55%),
      var(--void);

    &::before {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      opacity: 0.6;
      background:
        radial-gradient(2px 2px at 20% 30%, rgba(180, 220, 225, 0.5), transparent),
        radial-gradient(1px 1px at 70% 60%, rgba(180, 220, 225, 0.4), transparent),
        radial-gradient(1px 1px at 40% 80%, rgba(180, 220, 225, 0.35), transparent),
        radial-gradient(1.5px 1.5px at 85% 20%, rgba(180, 220, 225, 0.4), transparent),
        radial-gradient(1px 1px at 55% 15%, rgba(180, 220, 225, 0.3), transparent);
    }

    :global {
      * { box-sizing: border-box; margin: 0; padding: 0; }
      button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }
      .pc-msg { height: 100%; display: grid; place-items: center; text-align: center; padding: 24px; color: var(--ink-dim); font-style: italic; font-size: 15px; line-height: 1.5; }
      .pc-switch { color: var(--gold); font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; text-decoration: none; }
      .pc-switch.floating { position: fixed; top: 60px; right: 16px; z-index: 45; padding: 6px 10px; border: 1px solid var(--gold); border-radius: 3px; background: rgba(232, 182, 103, 0.1); }
      .pc-switch.floating:hover { background: rgba(232, 182, 103, 0.22); }

      .app {
        position: relative;
        z-index: 1;
        height: 100%;
        display: grid;
        grid-template-columns: 300px 1fr 360px;
        grid-template-rows: minmax(0, 1fr); /* pin the row to container height so panes can't grow to content */
        gap: 1px;
        background: var(--edge);
      }

      .pane { background: var(--panel); overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
      .pane-head {
        padding: 14px 16px 12px; border-bottom: 1px solid var(--edge);
        display: flex; align-items: center; justify-content: space-between;
        background: linear-gradient(180deg, var(--panel-2), var(--panel));
      }
      .pane-title {
        font-family: 'Chakra Petch', sans-serif; font-weight: 600; font-size: 11px;
        letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink-dim);
      }

      /* ===== LEFT: CHARACTER ===== */
      .char-id { padding: 16px; }
      .char-name { font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 20px; letter-spacing: 0.04em; color: var(--ink); }
      .char-sub { font-size: 13px; color: var(--ink-dim); font-style: italic; margin-top: 2px; }
      .char-meta { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
      .tag {
        font-family: 'Chakra Petch', sans-serif; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase;
        padding: 3px 8px; border: 1px solid var(--edge-bright); border-radius: 2px; color: var(--teal); background: rgba(63, 208, 201, 0.06);
      }
      .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--edge); margin: 0 16px; border: 1px solid var(--edge); }
      .stat { background: var(--panel-2); padding: 8px 4px; text-align: center; }
      .stat-v { font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 18px; color: var(--ink); }
      .stat-l { font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint); font-family: 'Chakra Petch', sans-serif; margin-top: 2px; }
      .stat.luck .stat-v { color: var(--gold); }

      .skills-head { padding: 18px 16px 8px; font-family: 'Chakra Petch', sans-serif; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-faint); }
      .skills { flex: 1; min-height: 0; overflow-y: auto; padding: 0 12px 64px; }
      .skills::-webkit-scrollbar { width: 6px; }
      .skills::-webkit-scrollbar-thumb { background: var(--edge-bright); border-radius: 3px; }

      .skill {
        display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
        padding: 9px 12px; margin: 3px 0; border-radius: 3px; cursor: pointer;
        border: 1px solid transparent; position: relative;
        transition: background 0.15s, border-color 0.15s, transform 0.08s;
      }
      .skill:hover { background: var(--panel-2); border-color: var(--edge); }
      .skill:active { transform: translateX(2px); }
      .skill-lv {
        font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 13px;
        width: 26px; height: 26px; display: grid; place-items: center; flex-shrink: 0;
        border: 1px solid var(--edge-bright); border-radius: 3px; color: var(--teal); background: rgba(63, 208, 201, 0.05);
      }
      .skill-name { flex: 1; font-size: 14px; color: var(--ink); }
      .skill-stat { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); font-family: 'Chakra Petch', sans-serif; }

      .skill.flagged {
        border-color: var(--gold); background: rgba(232, 182, 103, 0.08);
        box-shadow: inset 0 0 16px rgba(232, 182, 103, 0.12); animation: flagpulse 2s ease-in-out infinite;
      }
      @keyframes flagpulse { 0%, 100% { box-shadow: inset 0 0 16px rgba(232, 182, 103, 0.1); } 50% { box-shadow: inset 0 0 22px rgba(232, 182, 103, 0.22); } }
      .skill.flagged .skill-lv { border-color: var(--gold); color: var(--gold); background: rgba(232, 182, 103, 0.08); }
      .skill.pending-mark::after {
        content: ''; position: absolute; right: 10px; width: 7px; height: 7px; border-radius: 50%;
        background: var(--teal); box-shadow: var(--glow-teal); animation: breathe 1.6s ease-in-out infinite;
      }
      @keyframes breathe { 0%, 100% { opacity: 0.4; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.15); } }

      .token-dock { margin: 10px 16px 0; padding: 9px 12px; border: 1px solid var(--gold); border-radius: 4px; background: rgba(232, 182, 103, 0.06); display: flex; align-items: center; gap: 9px; }
      .token-dock.empty { border-color: var(--edge); background: transparent; opacity: 0.5; }
      .token-star { font-size: 16px; color: var(--gold); }
      .token-dock.empty .token-star { color: var(--ink-faint); }
      .token-txt { font-family: 'Chakra Petch', sans-serif; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gold); }
      .token-dock.empty .token-txt { color: var(--ink-faint); }
      .token-n { margin-left: auto; font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 16px; color: var(--gold); }
      .token-dock.empty .token-n { color: var(--ink-faint); }

      /* ===== CENTER: MAP ===== */
      .map { flex: 1; position: relative; display: grid; place-items: center; overflow: hidden; background: radial-gradient(circle at 50% 50%, rgba(20, 40, 52, 0.5), var(--void) 70%); }
      .blackhole { position: relative; width: 300px; height: 300px; display: grid; place-items: center; }
      .bh-disk {
        position: absolute; width: 300px; height: 120px; border-radius: 50%;
        background: conic-gradient(from 0deg, rgba(63, 208, 201, 0), rgba(63, 208, 201, 0.5), rgba(232, 182, 103, 0.7), rgba(63, 208, 201, 0.5), rgba(63, 208, 201, 0));
        filter: blur(8px); transform: rotateX(72deg); animation: spin 24s linear infinite;
      }
      .bh-disk.two { width: 220px; height: 90px; filter: blur(4px); animation-duration: 16s; opacity: 0.7; }
      @keyframes spin { to { transform: rotateX(72deg) rotate(360deg); } }
      .bh-core { position: absolute; width: 120px; height: 120px; border-radius: 50%; background: #02060a; box-shadow: 0 0 60px 10px rgba(0, 0, 0, 0.9), inset 0 0 30px rgba(63, 208, 201, 0.15); }
      .map-label { position: absolute; bottom: 24px; left: 24px; font-family: 'Chakra Petch', sans-serif; }
      .map-label .ml-1 { font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--ink-faint); }
      .map-label .ml-2 { font-size: 18px; letter-spacing: 0.06em; color: var(--ink); margin-top: 2px; }
      .map-node {
        position: absolute; padding: 7px 11px; border: 1px solid var(--edge-bright); border-radius: 3px;
        background: rgba(14, 26, 36, 0.85); cursor: pointer; font-family: 'Chakra Petch', sans-serif; font-size: 11px;
        letter-spacing: 0.06em; color: var(--ink-dim); transition: 0.15s; backdrop-filter: blur(4px);
      }
      .map-node:hover { border-color: var(--gold); color: var(--gold); box-shadow: var(--glow-gold); }
      .map-node.n1 { top: 22%; left: 28%; }
      .map-node.n2 { top: 64%; left: 62%; }
      .map-node .dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--teal); margin-right: 6px; vertical-align: middle; }

      /* ===== RIGHT: CHAT / TRAY ===== */
      .right { display: flex; flex-direction: column; }
      .mode-bar { padding: 12px 14px; border-bottom: 1px solid var(--edge); background: var(--panel-2); }
      .mode-label { font-family: 'Chakra Petch', sans-serif; font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: 8px; }
      .toggle { display: flex; width: 100%; background: var(--void-2); border: 1px solid var(--edge); border-radius: 4px; padding: 3px; position: relative; cursor: pointer; }
      .toggle-slider {
        position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc(50% - 3px); border-radius: 3px;
        transition: transform 0.28s cubic-bezier(0.65, 0, 0.35, 1), background 0.28s, box-shadow 0.28s;
        background: linear-gradient(180deg, var(--teal-dim), #134347); box-shadow: var(--glow-teal);
      }
      .toggle.check .toggle-slider { transform: translateX(100%); background: linear-gradient(180deg, var(--gold), #b07e2e); box-shadow: var(--glow-gold); }
      .toggle-opt {
        flex: 1; text-align: center; padding: 9px 8px; position: relative; z-index: 1;
        font-family: 'Chakra Petch', sans-serif; font-weight: 600; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
        color: var(--ink-dim); transition: color 0.2s;
      }
      .toggle:not(.check) .toggle-opt.just { color: #04141a; }
      .toggle.check .toggle-opt.chk { color: #1a1206; }
      .mode-hint { font-size: 12px; color: var(--ink-dim); font-style: italic; margin-top: 8px; min-height: 32px; line-height: 1.35; }
      .mode-hint b { color: var(--gold); font-style: normal; font-family: 'Chakra Petch', sans-serif; font-weight: 500; font-size: 11px; letter-spacing: 0.05em; }
      .mode-hint.just b { color: var(--teal); }

      .stream { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 14px 64px; display: flex; flex-direction: column; gap: 10px; }
      .stream > * { flex-shrink: 0; } /* stop log cards from compressing to fit; let them overflow & scroll */
      .stream::-webkit-scrollbar { width: 6px; }
      .stream::-webkit-scrollbar-thumb { background: var(--edge-bright); border-radius: 3px; }

      .fiction { font-size: 14px; line-height: 1.5; color: var(--ink); font-style: italic; border-left: 2px solid var(--edge-bright); padding: 4px 0 4px 12px; }
      .fiction .gm { font-style: normal; font-family: 'Chakra Petch', sans-serif; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--teal); display: block; margin-bottom: 5px; }

      .card { border: 1px solid var(--edge-bright); border-radius: 5px; background: linear-gradient(180deg, var(--panel-2), var(--panel)); overflow: hidden; animation: cardin 0.35s ease; }
      @keyframes cardin { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      .card.gmreq { border-color: var(--gold); box-shadow: 0 0 0 1px rgba(232, 182, 103, 0.15), 0 8px 24px rgba(0, 0, 0, 0.4); }
      .card-top { padding: 10px 12px; border-bottom: 1px solid var(--edge); display: flex; align-items: center; justify-content: space-between; }
      .card-kind { font-family: 'Chakra Petch', sans-serif; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; }
      .card.gmreq .card-kind { color: var(--gold); }
      .card-fic { padding: 10px 12px; font-size: 13px; line-height: 1.45; font-style: italic; color: var(--ink); }
      .card-skills { padding: 4px 12px 12px; display: flex; flex-wrap: wrap; gap: 7px; }
      .committed-tag { font-family: 'Chakra Petch', sans-serif; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--teal); }
      .sbtn { font-family: 'Chakra Petch', sans-serif; font-size: 12px; letter-spacing: 0.04em; padding: 8px 12px; border: 1px solid var(--gold); border-radius: 3px; cursor: pointer; background: rgba(232, 182, 103, 0.08); color: var(--gold-bright); transition: 0.14s; }
      .sbtn:hover { background: rgba(232, 182, 103, 0.2); box-shadow: var(--glow-gold); }
      .sbtn:active { transform: scale(0.96); }
      .sbtn.other { border-color: var(--edge-bright); color: var(--ink-dim); background: transparent; }
      .sbtn.other:hover { border-color: var(--ink-dim); background: var(--panel-2); box-shadow: none; }

      .roll { border: 1px solid var(--edge); border-radius: 5px; background: var(--panel-2); overflow: hidden; }
      .roll.pending { border-color: var(--teal-dim); box-shadow: 0 0 0 1px rgba(63, 208, 201, 0.12); }
      .roll.unevaluated { opacity: 0.55; border-style: dashed; }
      .roll-top { padding: 9px 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--edge); }
      .roll-skill { font-family: 'Chakra Petch', sans-serif; font-size: 13px; letter-spacing: 0.04em; color: var(--ink); }
      .roll-state { font-family: 'Chakra Petch', sans-serif; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; }
      .roll-state.pending { color: var(--teal); }
      .roll-state.uneval { color: var(--ink-faint); }
      .roll-state.resolved { color: var(--gold); }

      .dice { padding: 14px 12px; display: flex; align-items: center; gap: 14px; }
      .d15 { position: relative; width: 64px; height: 64px; flex-shrink: 0; display: grid; place-items: center; }
      .d15-shape { position: absolute; inset: 0; background: linear-gradient(135deg, var(--panel), var(--void-2)); border: 1px solid var(--edge-bright); transform: rotate(45deg); border-radius: 8px; }
      .d15.crit .d15-shape { border-color: var(--crit); box-shadow: 0 0 20px rgba(255, 224, 138, 0.5); }
      .d15.fail .d15-shape { border-color: var(--fail); box-shadow: 0 0 18px rgba(208, 90, 79, 0.4); }
      .d15-num { position: relative; font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 26px; color: var(--ink); }
      .d15.crit .d15-num { color: var(--crit); }
      .d15.fail .d15-num { color: var(--fail); }
      .dice-info { flex: 1; }
      .dice-total { font-family: 'Chakra Petch', sans-serif; font-size: 13px; color: var(--ink-dim); letter-spacing: 0.04em; }
      .dice-total b { color: var(--ink); font-size: 15px; }
      .dice-chain { font-size: 11px; color: var(--gold); margin-top: 3px; font-family: 'Chakra Petch', sans-serif; letter-spacing: 0.03em; }
      .dice-chain.cosmic-line { padding: 0 12px 4px; margin-top: 0; }
      .luck { display: flex; align-items: center; gap: 7px; margin-top: 7px; }
      .luck-die { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--edge-bright); display: grid; place-items: center; font-family: 'Chakra Petch', sans-serif; font-size: 9px; color: var(--ink-faint); }
      .luck.cosmic .luck-die { border-color: var(--gold); color: var(--gold); box-shadow: var(--glow-gold); animation: breathe 1.4s infinite; }
      .luck-txt { font-size: 10px; color: var(--ink-faint); letter-spacing: 0.08em; font-family: 'Chakra Petch', sans-serif; }
      .luck.cosmic .luck-txt { color: var(--gold); }

      .roll-actions { padding: 0 12px 12px; display: flex; gap: 8px; flex-wrap: wrap; }
      .abtn { font-family: 'Chakra Petch', sans-serif; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; padding: 8px 12px; border-radius: 3px; cursor: pointer; transition: 0.14s; flex: 1; text-align: center; }
      .abtn.cosmic { border: 1px solid var(--gold); background: linear-gradient(180deg, rgba(232, 182, 103, 0.18), rgba(232, 182, 103, 0.06)); color: var(--gold-bright); position: relative; }
      .abtn.cosmic:hover { box-shadow: var(--glow-gold); background: rgba(232, 182, 103, 0.28); }
      .abtn.cosmic::before { content: '✦'; margin-right: 5px; }
      .abtn.discard { border: 1px solid var(--edge); background: transparent; color: var(--ink-faint); }
      .abtn.discard:hover { border-color: var(--fail); color: var(--fail); }
      .abtn:active { transform: scale(0.97); }
      .pending-note { font-size: 11px; color: var(--ink-faint); font-style: italic; padding: 0 12px 12px; line-height: 1.4; }

      .resolved-band { font-family: 'Chakra Petch', sans-serif; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 6px; display: inline-block; padding: 3px 9px; border-radius: 2px; }
      .band-crit { color: var(--crit); border: 1px solid var(--crit); background: rgba(255, 224, 138, 0.08); }
      .band-success { color: var(--teal); border: 1px solid var(--teal-dim); background: rgba(63, 208, 201, 0.08); }
      .band-partial { color: var(--gold); border: 1px solid var(--gold); background: rgba(232, 182, 103, 0.08); }
      .band-fail { color: var(--fail); border: 1px solid var(--fail); background: rgba(208, 90, 79, 0.08); }

      /* confirm overlay */
      .scrim { position: fixed; inset: 0; background: rgba(3, 7, 11, 0.78); display: none; place-items: center; z-index: 50; backdrop-filter: blur(3px); }
      .scrim.on { display: grid; animation: fadein 0.2s; }
      @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
      .dialog { width: 340px; border: 1px solid var(--fail); border-radius: 6px; background: var(--panel); overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6); }
      .dialog-head { padding: 14px 16px; border-bottom: 1px solid var(--edge); font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--fail); }
      .dialog-body { padding: 16px; font-size: 14px; line-height: 1.5; color: var(--ink); }
      .dialog-body b { color: var(--gold); font-style: normal; }
      .dialog-acts { padding: 0 16px 16px; display: flex; gap: 10px; }
      .dbtn { flex: 1; padding: 11px; border-radius: 3px; cursor: pointer; font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; transition: 0.14s; text-align: center; }
      .dbtn.keep { border: 1px solid var(--teal-dim); background: rgba(63, 208, 201, 0.1); color: var(--teal); }
      .dbtn.keep:hover { background: rgba(63, 208, 201, 0.2); }
      .dbtn.proceed { border: 1px solid var(--fail); background: transparent; color: var(--fail); }
      .dbtn.proceed:hover { background: rgba(208, 90, 79, 0.12); }

      /* GM sim controls */
      .simbar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 40; background: rgba(7, 13, 18, 0.92); border-top: 1px solid var(--edge-bright); padding: 8px 14px; display: flex; align-items: center; gap: 10px; backdrop-filter: blur(6px); }
      .sim-label { font-family: 'Chakra Petch', sans-serif; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--gold); margin-right: 4px; }
      .simbtn { font-family: 'Chakra Petch', sans-serif; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; padding: 7px 12px; border: 1px solid var(--edge-bright); border-radius: 3px; background: var(--panel-2); color: var(--ink-dim); cursor: pointer; transition: 0.14s; }
      .simbtn:hover { border-color: var(--gold); color: var(--gold); }
      .simbtn:active { transform: scale(0.96); }
      .sim-note { font-size: 11px; color: var(--ink-faint); font-style: italic; margin-left: auto; }
    }
  }
</style>
