<script>
  // Left pane: identity, stats, cosmic token dock, and the tappable skill sheet.
  // Skills highlight when GM-flagged and show a breathing dot when a check for
  // that skill is in flight (pending).
  import { getContext } from 'svelte';
  const check = getContext('check');
  // reactive: character is swapped from mock -> real after the game loads
  let c = $derived(check.character);
</script>

<section class="pane">
  <div class="pane-head"><span class="pane-title">Crew Member</span><span class="pane-title" style="color:var(--teal)">●</span></div>

  <div class="char-id">
    <div class="char-name">{c.name}</div>
    <div class="char-sub">{c.sub}</div>
    <div class="char-meta">{#each c.tags as tag}<span class="tag">{tag}</span>{/each}</div>
  </div>

  <div class="stats-row">
    {#each c.stats as s}
      <div class="stat {s.luck ? 'luck' : ''}"><div class="stat-v">{s.v}</div><div class="stat-l">{s.l}</div></div>
    {/each}
  </div>

  <div class="token-dock {check.tokens <= 0 ? 'empty' : ''}">
    <span class="token-star">✦</span><span class="token-txt">Cosmic Token</span><span class="token-n">{check.tokens}</span>
  </div>

  <div class="skills-head">Skills · tap to roll</div>
  <div class="skills">
    {#each c.skills as s}
      <button
        type="button"
        class="skill {check.isFlagged(s.name) ? 'flagged' : ''} {check.isPending(s.name) ? 'pending-mark' : ''}"
        onclick={() => check.tapSkill(s.name)}
      >
        <div class="skill-lv">{s.lv}</div>
        <div class="skill-name">{s.name}</div>
        <div class="skill-stat">{s.stat}</div>
      </button>
    {/each}
  </div>
</section>
