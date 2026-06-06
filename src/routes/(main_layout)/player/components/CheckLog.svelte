<script>
  // Right pane: the persistent mode toggle (Just Roll vs Check) and the session
  // stream — GM fiction, GM prompt cards, and roll cards (pending / unevaluated /
  // resolved). Never shows bare pass/fail; resolved checks become narrative bands.
  import { getContext } from 'svelte';
  import DiceDisplay from './DiceDisplay.svelte';
  const check = getContext('check');

  // Auto-scroll the log to the newest entry — but only when the player is already
  // pinned to the bottom, so a new check doesn't yank them away from history they're
  // scrolled up reading.
  let streamEl;
  let pinned = true;
  const NEAR_BOTTOM = 48;

  function onScroll() {
    if (!streamEl) return;
    pinned = streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight <= NEAR_BOTTOM;
  }

  $effect(() => {
    check.stream.length; // re-run whenever an entry is added
    if (pinned && streamEl) streamEl.scrollTop = streamEl.scrollHeight;
  });

  const STATE_META = {
    pending: { cls: 'pending', label: '● With the GM' },
    unevaluated: { cls: 'uneval', label: 'Unevaluated' },
    resolved: { cls: 'resolved', label: 'Resolved' },
  };
  const stateLabel = (item) =>
    item.state === 'unevaluated' && item.ejected ? 'Ejected' : STATE_META[item.state].label;
</script>

<section class="pane right">
  <div class="pane-head"><span class="pane-title">Session Log</span><span class="pane-title" style="color:var(--ink-faint)">SE 1.331</span></div>

  <div class="mode-bar">
    <div class="mode-label">Roll Mode</div>
    <button type="button" class="toggle {check.mode === 'check' ? 'check' : ''}" onclick={() => check.flipMode()}>
      <div class="toggle-slider"></div>
      <div class="toggle-opt just">Just Roll</div>
      <div class="toggle-opt chk">Check</div>
    </button>
    <div class="mode-hint {check.mode === 'just' ? 'just' : ''}">
      {#if check.mode === 'check'}
        <b>Check</b> — a committed roll. Sent to the GM and held until they narrate the outcome. One per skill at a time.
      {:else}
        <b>Just Roll</b> — throw the dice for the feel of it. Nothing is sent to the GM. Results don't count.
      {/if}
    </div>
  </div>

  <div class="stream" bind:this={streamEl} onscroll={onScroll}>
    {#each check.stream as item (item.id)}
      {#if item.kind === 'fiction'}
        <div class="fiction">
          <span class="gm">{item.who}</span>
          {#if item.band}<span class="resolved-band {item.band.cls}">{item.band.label}</span>{/if}
          {item.text}
        </div>

      {:else if item.kind === 'prompt'}
        <div class="card gmreq">
          <div class="card-top"><span class="card-kind">✦ GM requests a check</span></div>
          <div class="card-fic">{item.fiction} {#if item.hint}<span style="color:var(--ink-faint)">{item.hint}</span>{/if}</div>
          {#if item.committed}
            <div class="card-skills"><span class="committed-tag">▸ {item.committed} committed</span></div>
          {:else}
            <div class="card-skills">
              {#each item.skills as s}
                <button type="button" class="sbtn" onclick={() => check.gmCommit(item.id, s)}>{s}</button>
              {/each}
              <button type="button" class="sbtn other" onclick={() => {}}>other…</button>
            </div>
          {/if}
        </div>

      {:else if item.kind === 'roll'}
        <div class="roll" class:pending={item.state === 'pending'} class:unevaluated={item.state === 'unevaluated'}>
          <div class="roll-top">
            <span class="roll-skill">{item.skill}</span>
            <span class="roll-state {STATE_META[item.state].cls}">{stateLabel(item)}</span>
          </div>

          <DiceDisplay d15={item.d15} luck={item.luck} />

          {#if item.cosmic}
            <div class="dice-chain cosmic-line">✦ Cosmic re-roll: previous {item.cosmic.prev} vs new {item.cosmic.next} → keeping <b>{item.cosmic.kept}</b></div>
          {/if}

          {#if item.state === 'pending'}
            <div class="roll-actions">
              {#if check.tokens > 0 && !item.cosmicUsed}
                <button type="button" class="abtn cosmic" onclick={() => check.cosmicReroll(item.id, item.skill)}>Cosmic Re-roll · keep highest</button>
              {/if}
              <button type="button" class="abtn discard" onclick={() => check.requestDiscard(item.skill)}>Re-roll (discard)</button>
            </div>
          {/if}

          {#if item.note}<div class="pending-note">{item.note}</div>{/if}
        </div>
      {/if}
    {/each}
  </div>
</section>
