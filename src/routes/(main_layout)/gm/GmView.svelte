<script>
  // Game Master interface (scaffold). Stage a check and resolve players' pending
  // attempts. Until broadcast wiring lands (next step) this operates locally: the
  // "Stage" control shows the staged gate, and the resolutions queue is fed by
  // players' live attempts once the broadcast channel is connected.
  let { status = 'loading', statusMsg = '', gameName = 'Game' } = $props();

  // The GM holds the secret per-skill DCs and narrative bands. In this scaffold a
  // single preset gate stands in for the GM's prompt-builder.
  const PRESET_GATE = {
    fiction: 'You turn the box over. What can you tell about it?',
    skills: ['Intuition', 'Education', 'Hacking'],
  };

  let stagedGate = $state(null);
  let pending = $state([]); // populated by player attempts once broadcast is wired

  function stage() {
    stagedGate = { ...PRESET_GATE, id: `g${Date.now()}` };
    // broadcast('check:gate-staged', …) — wired next step
  }
  function unstage() { stagedGate = null; }
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
      </header>

      <div class="gm-banner">Live player sync activates with broadcast wiring (next step). Staging and resolution controls are in place.</div>

      <div class="gm-body">
        <section class="gm-panel">
          <h3 class="gm-panel-title">Stage a check</h3>
          {#if stagedGate}
            <div class="staged">
              <div class="staged-fic">“{stagedGate.fiction}”</div>
              <div class="staged-skills">
                {#each stagedGate.skills as s}<span class="chip">{s}</span>{/each}
              </div>
              <button type="button" class="btn ghost" onclick={unstage}>Unstage</button>
            </div>
          {:else}
            <p class="muted">No check staged. The preset gate flags Intuition · Education · Hacking (each with its own secret DC).</p>
            <button type="button" class="btn gold" onclick={stage}>Stage preset check</button>
          {/if}
        </section>

        <section class="gm-panel">
          <h3 class="gm-panel-title">Pending resolutions</h3>
          {#if pending.length === 0}
            <p class="muted">No checks awaiting resolution. Players' committed rolls will appear here for you to narrate &amp; resolve.</p>
          {:else}
            <ul class="queue">
              {#each pending as a}
                <li class="q-item">
                  <span>{a.characterName} · {a.skill} ({a.total})</span>
                  <button type="button" class="btn gold sm">Resolve</button>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>
    </div>
  {/if}
</div>

<style>
  .gm-scope {
    --void: #070d12; --panel: #0e1a24; --panel-2: #12222e; --edge: #1d3644;
    --edge-bright: #2b5468; --teal: #3fd0c9; --gold: #e8b667; --gold-bright: #ffd089;
    --ink: #cfe6ec; --ink-dim: #6f8d97; --ink-faint: #456069;
    height: calc(100vh - 52px); overflow-y: auto; color: var(--ink);
    font-family: 'Spectral', serif; background: var(--void);
  }
  .gm-msg { height: 100%; display: grid; place-items: center; text-align: center; padding: 24px; color: var(--ink-dim); font-style: italic; }
  .gm { max-width: 820px; margin: 0 auto; padding: 22px 18px 60px; }
  .gm-head { display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid var(--edge); padding-bottom: 12px; }
  .gm-kind { font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--gold); }
  .gm-game { font-family: 'Chakra Petch', sans-serif; font-size: 18px; letter-spacing: 0.04em; color: var(--ink); }
  .gm-banner { margin: 14px 0; padding: 10px 12px; border: 1px dashed var(--edge-bright); border-radius: 4px; font-size: 12px; color: var(--ink-dim); font-style: italic; }
  .gm-body { display: grid; gap: 16px; }
  .gm-panel { border: 1px solid var(--edge); border-radius: 6px; background: linear-gradient(180deg, var(--panel-2), var(--panel)); padding: 14px 16px; }
  .gm-panel-title { font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-dim); margin-bottom: 10px; }
  .muted { font-size: 13px; color: var(--ink-faint); font-style: italic; margin-bottom: 12px; line-height: 1.5; }
  .staged-fic { font-style: italic; color: var(--ink); margin-bottom: 8px; }
  .staged-skills { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 12px; }
  .chip { font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.04em; padding: 4px 10px; border: 1px solid var(--gold); border-radius: 3px; color: var(--gold-bright); background: rgba(232, 182, 103, 0.08); }
  .queue { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .q-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border: 1px solid var(--edge); border-radius: 4px; }
  .btn { font-family: 'Chakra Petch', sans-serif; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; padding: 9px 14px; border-radius: 3px; cursor: pointer; border: 1px solid var(--edge-bright); background: var(--panel-2); color: var(--ink); transition: 0.14s; }
  .btn.gold { border-color: var(--gold); color: var(--gold-bright); background: rgba(232, 182, 103, 0.1); }
  .btn.gold:hover { background: rgba(232, 182, 103, 0.22); }
  .btn.ghost { border-color: var(--edge); color: var(--ink-dim); background: transparent; }
  .btn.sm { padding: 6px 10px; }
</style>
