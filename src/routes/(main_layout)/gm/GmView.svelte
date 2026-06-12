<script>
  // Game Master interface, wired to a GmCheck controller (`gm`) over the per-game
  // broadcast channel. Stage checks with per-skill DCs (kept secret/local), watch
  // players' committed rolls arrive, set/confirm the DC, and resolve — the band is
  // implicit (total vs DC); the GM supplies the narration.
  import { getPath } from '@utils/navigation';
  import RadarCanvas from '@lib/radar/RadarCanvas.svelte';
  import { SHIP_ARCHETYPES, archetypeEntityProps } from '@lib/radar/archetypes.js';

  let { status = 'loading', statusMsg = '', gameName = 'Game', gameId = null, hasCharacter = false, gm, radar = null, seats = [] } = $props();

  // tactical scene authoring
  let sceneName = $state('Engagement');
  let shipSeatId = $state('');
  let bogeyArchetype = $state('pirate-sloop');
  function addShip() {
    const seat = seats.find((s) => String(s.id) === String(shipSeatId));
    radar.addEntity({ kind: 'ship', name: seat?.label ?? 'Ship', ownerSeatId: seat?.id ?? null, vx: 40, vy: 0 });
  }
  function addBogey() {
    const props = archetypeEntityProps(bogeyArchetype);
    radar.addEntity({ kind: 'bogey', vx: -50, vy: 20, ...props });
  }

  // staging form
  let fiction = $state('');
  let skillRows = $state([{ name: '', dc: '' }]);
  const addSkillRow = () => skillRows.push({ name: '', dc: '' });
  function removeSkillRow(i) { skillRows.splice(i, 1); if (skillRows.length === 0) skillRows.push({ name: '', dc: '' }); }
  function stage() {
    const gate = gm.stageGate(fiction, skillRows);
    if (gate) { fiction = ''; skillRows = [{ name: '', dc: '' }]; }
  }
</script>

<div class="gm-scope">
  {#if status === 'loading'}
    <div class="gm-msg">Loading game…</div>
  {:else if status === 'error'}
    <div class="gm-msg">{statusMsg}</div>
  {:else}
    <div class="gm">
      <header class="gm-head">
        <span class="gm-kind">Game Master</span>
        <span class="gm-game">{gameName}</span>
        {#if hasCharacter && gameId}
          <a class="gm-switch" href={getPath('/player?game_id=' + gameId)}>⇄ Player view</a>
        {/if}
      </header>

      <!-- Tactical radar: scene authoring + (P3) turn control -->
      {#if radar}
        <section class="gm-panel">
          <h3 class="gm-panel-title">Tactical
            {#if radar.engagement}
              <span class="status-badge {radar.engagement.status}">{radar.engagement.status}</span>
            {/if}
          </h3>

          {#if !radar.engagement}
            <div class="palette-row">
              <input class="scene-name" placeholder="Scene name" bind:value={sceneName} />
              <button type="button" class="btn gold" onclick={() => radar.newScene({ kind: 'ship', name: sceneName })}>New ship engagement</button>
            </div>
            <p class="muted">Author the scene here, then enable it — players see nothing until you do.</p>
          {:else}
            <div class="palette-row">
              <select bind:value={shipSeatId}>
                <option value="">Crew ship for…</option>
                {#each seats as s}<option value={s.id}>{s.label}</option>{/each}
              </select>
              <button type="button" class="btn ghost" disabled={!shipSeatId} onclick={addShip}>+ Ship</button>
              <select bind:value={bogeyArchetype} title="Bogey archetype">
                {#each SHIP_ARCHETYPES as a}<option value={a.key}>{a.label}</option>{/each}
              </select>
              <button type="button" class="btn ghost" onclick={addBogey}>+ Bogey</button>
              <button type="button" class="btn ghost" onclick={() => radar.addEntity({ kind: 'debris', name: 'Debris', vx: 5, vy: -3 })}>+ Debris</button>
              <button type="button" class="btn ghost" onclick={() => radar.addEntity({ kind: 'object', name: 'Object', vx: 0, vy: 0 })}>+ Object</button>
              <span class="mode-toggle">
                <button type="button" class="btn sm {radar.gmMode === 'move' ? 'gold' : 'ghost'}" onclick={() => radar.gmMode = 'move'}>Move</button>
                <button type="button" class="btn sm {radar.gmMode === 'vector' ? 'gold' : 'ghost'}" onclick={() => radar.gmMode = 'vector'}>Vector</button>
              </span>
            </div>

            <div class="radar-frame">
              <RadarCanvas bridge={radar.bridge()} />
            </div>

            {#if radar.selectedEntity}
              {@const sel = radar.selectedEntity}
              <div class="palette-row sel-row">
                <input class="scene-name" value={sel.name} onchange={(e) => radar.updateEntity(sel.id, { name: e.currentTarget.value })} />
                <span class="speed-chip">{Math.round(Math.hypot(sel.vx, sel.vy))} km/s</span>
                {#if sel.kind === 'ship' || sel.kind === 'bogey'}
                  <label class="num-label">G <input type="number" class="num" value={sel.accelG} onchange={(e) => radar.updateEntity(sel.id, { accelG: Number(e.currentTarget.value) })} /></label>
                  <label class="num-label">Fuel <input type="number" class="num" value={sel.fuel} onchange={(e) => radar.updateEntity(sel.id, { fuel: Number(e.currentTarget.value) })} /></label>
                  <label class="num-label">Top <input type="number" class="num" value={sel.topSpeed ?? ''} placeholder="∞" onchange={(e) => radar.updateEntity(sel.id, { topSpeed: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })} /></label>
                  <label class="num-label">Cargo <input type="number" class="num sm" value={sel.cargoBays ?? 0} onchange={(e) => radar.updateEntity(sel.id, { cargoBays: Number(e.currentTarget.value) })} /></label>
                  <label class="num-label">Wpn <input type="number" class="num sm" value={sel.weaponPorts ?? 0} onchange={(e) => radar.updateEntity(sel.id, { weaponPorts: Number(e.currentTarget.value) })} /></label>
                {/if}
                <button type="button" class="btn ghost sm" onclick={() => radar.removeEntity(sel.id)}>Delete</button>
              </div>
            {:else}
              <p class="muted">Click a contact to select it; drag to {radar.gmMode === 'vector' ? 'set its velocity (arrow tip = next-turn position)' : 'reposition it'}.</p>
            {/if}

            <div class="palette-row">
              {#if radar.engagement.status === 'setup'}
                <button type="button" class="btn gold" onclick={() => radar.enable()}>Enable engagement</button>
              {:else}
                <span class="turn-chip">Turn {radar.engagement.turn}</span>
                {#each radar.readiness as r (r.id)}
                  <span class="ready-chip {r.ready ? 'ready' : ''}">{r.name} {r.ready ? '✓ plotted' : '· planning'}</span>
                {/each}
                <button type="button" class="btn gold" onclick={() => radar.executeTurn()}>Execute turn</button>
                <button type="button" class="btn ghost" onclick={() => radar.end()}>End engagement</button>
              {/if}
            </div>
          {/if}
        </section>
      {/if}

      <!-- Stage a check -->
      <section class="gm-panel">
        <h3 class="gm-panel-title">Stage a check</h3>
        <textarea class="fic-input" bind:value={fiction} placeholder="Prompt fiction — what are the players reacting to?"></textarea>
        {#each skillRows as row, i}
          <div class="skill-row">
            <input class="skill-name" placeholder="Skill (e.g. Hacking)" bind:value={row.name} />
            <input class="skill-dc" type="number" placeholder="DC" bind:value={row.dc} />
            <button type="button" class="x" onclick={() => removeSkillRow(i)} aria-label="remove">×</button>
          </div>
        {/each}
        <div class="stage-actions">
          <button type="button" class="btn ghost" onclick={addSkillRow}>+ skill</button>
          <button type="button" class="btn gold" onclick={stage}>Stage check</button>
        </div>
        <p class="muted">DCs stay on your screen — players only see the skill names. Leave a DC blank to set it when you resolve.</p>
      </section>

      <!-- Active staged gates -->
      {#if gm.gates.length}
        <section class="gm-panel">
          <h3 class="gm-panel-title">Staged ({gm.gates.length})</h3>
          {#each gm.gates as g (g.gateId)}
            <div class="staged">
              <div class="staged-fic">“{g.fiction}”</div>
              <div class="chips">
                {#each g.skills as s}<span class="chip">{s.name}{s.dc != null ? ` · DC ${s.dc}` : ''}</span>{/each}
              </div>
              <button type="button" class="btn ghost sm" onclick={() => gm.cancelGate(g.gateId)}>Cancel</button>
            </div>
          {/each}
        </section>
      {/if}

      <!-- Resolution queue -->
      <section class="gm-panel">
        <h3 class="gm-panel-title">Pending resolutions ({gm.queue.length})</h3>
        {#if gm.queue.length === 0}
          <p class="muted">Players' committed rolls appear here. Set/confirm the DC, narrate, and resolve.</p>
        {:else}
          {#each gm.queue as q (q.attemptId)}
            <div class="q-row">
              <div class="q-head">
                <span class="q-who">{q.characterName} · {q.skill}</span>
                <span class="q-total">rolled <b>{q.total}</b>{q.crit ? ' · nat 15' : ''}{q.fail ? ' · nat 1' : ''}</span>
              </div>
              <div class="q-controls">
                <label class="dc-label">DC <input class="dc-input" type="number" bind:value={q.dc} /></label>
                {#if gm.bandFor(q)}
                  <span class="tier {gm.bandFor(q).cls}">{gm.bandFor(q).label}</span>
                {:else}
                  <span class="tier-empty">← set a DC</span>
                {/if}
              </div>
              <textarea class="narration" bind:value={q.narration} placeholder="Narrate the outcome (sent to the player)…"></textarea>
              <div class="q-actions">
                <button type="button" class="btn gold" disabled={!gm.bandFor(q)} onclick={() => gm.resolve(q.attemptId)}>Resolve</button>
                <button type="button" class="btn ghost" onclick={() => gm.dismiss(q.attemptId)}>Dismiss</button>
                <button type="button" class="btn ghost" onclick={() => gm.grantToken(q.playerId)} title="Grant a cosmic token">Grant ✦</button>
              </div>
            </div>
          {/each}
        {/if}
      </section>

      <!-- Recent -->
      {#if gm.log.length}
        <section class="gm-panel">
          <h3 class="gm-panel-title">Recent</h3>
          {#each gm.log.slice(0, 8) as e}
            <div class="log-row {e.kind}">{e.characterName} · {e.skill} ({e.total}) → {e.band}</div>
          {/each}
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .gm-scope {
    --void: #070d12; --panel: #0e1a24; --panel-2: #12222e; --edge: #1d3644;
    --edge-bright: #2b5468; --teal: #3fd0c9; --gold: #e8b667; --gold-bright: #ffd089;
    --ink: #cfe6ec; --ink-dim: #6f8d97; --ink-faint: #456069; --crit: #ffe08a; --fail: #d05a4f;
    height: calc(100vh - 52px); overflow-y: auto; color: var(--ink);
    font-family: 'Spectral', serif; background: var(--void);
  }
  .gm-msg { height: 100%; display: grid; place-items: center; text-align: center; padding: 24px; color: var(--ink-dim); font-style: italic; }
  .gm { max-width: 860px; margin: 0 auto; padding: 22px 18px 80px; }
  .gm-head { display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid var(--edge); padding-bottom: 12px; }
  .gm-kind { font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--gold); }
  .gm-game { font-family: 'Chakra Petch', sans-serif; font-size: 18px; letter-spacing: 0.04em; color: var(--ink); }
  .gm-switch { margin-left: auto; color: var(--teal); font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; text-decoration: none; padding: 6px 10px; border: 1px solid var(--teal); border-radius: 3px; }
  .gm-switch:hover { background: rgba(63, 208, 201, 0.12); }

  .gm-panel { margin-top: 16px; border: 1px solid var(--edge); border-radius: 6px; background: linear-gradient(180deg, var(--panel-2), var(--panel)); padding: 14px 16px; }
  .gm-panel-title { font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-dim); margin-bottom: 10px; }
  .muted { font-size: 12px; color: var(--ink-faint); font-style: italic; margin-top: 8px; line-height: 1.5; }

  .fic-input { width: 100%; min-height: 54px; resize: vertical; background: var(--void-2, #0b141c); border: 1px solid var(--edge); border-radius: 4px; color: var(--ink); padding: 8px 10px; font-family: inherit; margin-bottom: 8px; }
  .skill-row { display: flex; gap: 8px; margin-bottom: 6px; align-items: center; }
  .skill-name { flex: 1; }
  .skill-dc { width: 72px; }
  .skill-row input { background: #0b141c; border: 1px solid var(--edge); border-radius: 4px; color: var(--ink); padding: 7px 9px; font-family: inherit; }
  .x { background: none; border: 1px solid var(--edge); color: var(--ink-faint); border-radius: 4px; width: 30px; height: 30px; cursor: pointer; }
  .x:hover { border-color: var(--fail); color: var(--fail); }
  .stage-actions { display: flex; gap: 8px; margin-top: 8px; }

  .btn { font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; padding: 9px 14px; border-radius: 3px; cursor: pointer; border: 1px solid var(--edge-bright); background: var(--panel-2); color: var(--ink); transition: 0.14s; }
  .btn.gold { border-color: var(--gold); color: var(--gold-bright); background: rgba(232, 182, 103, 0.1); }
  .btn.gold:hover:not(:disabled) { background: rgba(232, 182, 103, 0.22); }
  .btn.ghost { border-color: var(--edge); color: var(--ink-dim); background: transparent; }
  .btn.ghost:hover { color: var(--ink); border-color: var(--edge-bright); }
  .btn.sm { padding: 6px 10px; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .staged { border: 1px solid var(--edge); border-radius: 4px; padding: 10px; margin-bottom: 8px; }
  .staged-fic { font-style: italic; color: var(--ink); margin-bottom: 8px; }
  .chips { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 10px; }
  .chip { font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.04em; padding: 4px 10px; border: 1px solid var(--gold); border-radius: 3px; color: var(--gold-bright); background: rgba(232, 182, 103, 0.08); }

  .q-row { border: 1px solid var(--edge); border-radius: 5px; padding: 10px 12px; margin-bottom: 10px; background: var(--panel-2); }
  .q-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .q-who { font-family: 'Chakra Petch', sans-serif; font-size: 13px; letter-spacing: 0.03em; color: var(--ink); }
  .q-total { font-family: 'Chakra Petch', sans-serif; font-size: 12px; color: var(--ink-dim); }
  .q-total b { color: var(--ink); font-size: 14px; }
  .q-controls { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .dc-label { font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-dim); display: flex; align-items: center; gap: 6px; }
  .dc-input { width: 64px; background: #0b141c; border: 1px solid var(--edge-bright); border-radius: 4px; color: var(--ink); padding: 6px 8px; font-family: inherit; }
  .tier { font-family: 'Chakra Petch', sans-serif; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; padding: 3px 9px; border-radius: 2px; }
  .tier.band-crit { color: var(--crit); border: 1px solid var(--crit); background: rgba(255, 224, 138, 0.08); }
  .tier.band-success { color: var(--teal); border: 1px solid var(--teal); background: rgba(63, 208, 201, 0.08); }
  .tier.band-partial { color: var(--gold); border: 1px solid var(--gold); background: rgba(232, 182, 103, 0.08); }
  .tier.band-fail { color: var(--fail); border: 1px solid var(--fail); background: rgba(208, 90, 79, 0.08); }
  .tier-empty { font-size: 11px; color: var(--ink-faint); font-style: italic; }
  .narration { width: 100%; min-height: 44px; resize: vertical; background: #0b141c; border: 1px solid var(--edge); border-radius: 4px; color: var(--ink); padding: 7px 9px; font-family: inherit; margin-bottom: 8px; }
  .q-actions { display: flex; gap: 8px; }

  .log-row { font-size: 12px; color: var(--ink-dim); padding: 3px 0; }
  .log-row.dismissed { color: var(--ink-faint); font-style: italic; }

  /* tactical radar panel */
  .radar-frame { position: relative; height: 480px; border: 1px solid var(--edge); border-radius: 4px; overflow: hidden; margin: 10px 0; background: #070d12; }
  .palette-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
  .palette-row select, .scene-name { background: #0b141c; border: 1px solid var(--edge); border-radius: 4px; color: var(--ink); padding: 7px 9px; font-family: inherit; }
  .scene-name { flex: 0 1 220px; }
  .mode-toggle { margin-left: auto; display: flex; gap: 4px; }
  .num-label { font-family: 'Chakra Petch', sans-serif; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-dim); display: flex; align-items: center; gap: 5px; }
  .num { width: 64px; background: #0b141c; border: 1px solid var(--edge); border-radius: 4px; color: var(--ink); padding: 6px 8px; font-family: inherit; }
  .num.sm { width: 48px; }
  .status-badge { margin-left: 10px; font-size: 9px; letter-spacing: 0.14em; padding: 2px 8px; border-radius: 2px; border: 1px solid var(--edge-bright); color: var(--ink-dim); text-transform: uppercase; }
  .status-badge.active { color: var(--teal); border-color: var(--teal); }
  .status-badge.setup { color: var(--gold); border-color: var(--gold); }
  .turn-chip { font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink); }
  .ready-chip { font-family: 'Chakra Petch', sans-serif; font-size: 10px; letter-spacing: 0.06em; padding: 3px 9px; border: 1px solid var(--edge); border-radius: 2px; color: var(--ink-faint); }
  .ready-chip.ready { color: var(--teal); border-color: var(--teal-dim); }
  .speed-chip { font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.05em; color: var(--ink-dim); }
</style>
