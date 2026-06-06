<script>
  // Center pane: the cosmic map. Tappable nodes originate checks (spec §8), keeping
  // the fiction spatially linked to the act of rolling. Map taps are committal →
  // they route through check.mapCheck (auto-switch to Check mode).
  import { getContext } from 'svelte';
  const check = getContext('check');
</script>

<section class="pane">
  <div class="pane-head"><span class="pane-title">Navi-Console</span><span class="pane-title" style="color:var(--ink-faint)">Hullusta · Refinery District</span></div>

  <div class="map">
    <div class="blackhole">
      <div class="bh-disk"></div><div class="bh-disk two"></div><div class="bh-core"></div>
    </div>

    <button type="button" class="map-node n1" onclick={() => check.mapCheck('Perception')}>
      <span class="dot"></span>Watcher in the crowd
    </button>
    <button type="button" class="map-node n2" onclick={() => check.mapCheck('Intuition')}>
      <span class="dot"></span>Sealed container
    </button>

    <div class="map-label"><div class="ml-1">Aeterna Perditor</div><div class="ml-2">The Lodestone</div></div>
  </div>
</section>
