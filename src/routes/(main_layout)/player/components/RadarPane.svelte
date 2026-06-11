<script>
  // Center pane: the tactical radar. Pane chrome matches the other player panes;
  // the Phaser canvas fills the body. When a RadarController is supplied, a HUD
  // overlay drives the plot-course flow (mockup: select point -> new velocity /
  // G / fuel readout -> confirm -> exit trajectory -> confirm maneuver).
  import RadarCanvas from '@lib/radar/RadarCanvas.svelte';

  let { bridge, radar = null, title = 'Tactical', subtitle = '' } = $props();

  let ps = $derived(radar?.plotState ?? null);
  let m = $derived(ps?.maneuver ?? null);
  let fmt = (n, d = 0) => (n == null ? '—' : n.toFixed(d));
</script>

<section class="pane">
  <div class="pane-head">
    <span class="pane-title">Navi-Console · {title}</span>
    <span class="pane-title" style="color:var(--ink-faint)">
      {#if radar?.engagement}Turn {radar.engagement.turn} · {radar.engagement.phase}{:else}{subtitle}{/if}
    </span>
  </div>
  <div class="radar-body">
    <RadarCanvas {bridge} />

    {#if radar}
      {#if ps}
        <div class="hud">
          <div class="hud-stage">
            {#if ps.stage === 'target'}Plot course — select a point within bounds
            {:else if ps.stage === 'exit'}Select exit trajectory
            {:else}Confirm maneuver?{/if}
          </div>
          {#if m}
            <div class="hud-nums {m.valid ? '' : 'invalid'}">
              <span>{fmt(m.newSpeed)} km/s</span>
              <span>{fmt(m.gForce, 1)} G</span>
              <span>FC: {fmt(m.fuelCost, 1)}%</span>
              {#if !m.valid}<span class="warn">out of envelope</span>{/if}
            </div>
          {/if}
          <div class="hud-actions">
            {#if ps.stage === 'confirm'}
              <button type="button" class="hbtn go" onclick={() => radar.confirmPlot()}>Confirm</button>
            {/if}
            <button type="button" class="hbtn" onclick={() => radar.cancelPlot()}>Cancel</button>
          </div>
        </div>
      {:else if radar.myPlot}
        <div class="hud locked">
          <div class="hud-stage">Maneuver locked — awaiting turn execution</div>
          <div class="hud-actions">
            <button type="button" class="hbtn" onclick={() => { radar.myPlot = null; radar.beginPlot(radar.viewerEntityId); }}>Re-plot</button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</section>

<style>
  .radar-body {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .hud {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 14px;
    border: 1px solid var(--gold);
    border-radius: 4px;
    background: rgba(7, 13, 18, 0.88);
    backdrop-filter: blur(4px);
    white-space: nowrap;
  }
  .hud.locked { border-color: var(--teal-dim); }
  .hud-stage {
    font-family: 'Chakra Petch', sans-serif;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .hud.locked .hud-stage { color: var(--teal); }
  .hud-nums {
    display: flex;
    gap: 12px;
    font-family: 'Chakra Petch', sans-serif;
    font-size: 13px;
    color: var(--ink);
  }
  .hud-nums.invalid { color: var(--fail); }
  .hud-nums .warn {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    align-self: center;
  }
  .hud-actions { display: flex; gap: 8px; }
  .hbtn {
    font-family: 'Chakra Petch', sans-serif;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 6px 12px;
    border: 1px solid var(--edge-bright);
    border-radius: 3px;
    background: transparent;
    color: var(--ink-dim);
    cursor: pointer;
  }
  .hbtn:hover { color: var(--ink); border-color: var(--ink-dim); }
  .hbtn.go { border-color: var(--gold); color: var(--gold-bright); background: rgba(232, 182, 103, 0.12); }
  .hbtn.go:hover { background: rgba(232, 182, 103, 0.25); }
</style>
