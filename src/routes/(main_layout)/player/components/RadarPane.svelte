<script>
  // Center pane: the tactical radar (replaces the decorative StarMap when an
  // engagement is on screen). Pane chrome matches the other player panes; the
  // Phaser canvas fills the body.
  import RadarCanvas from '@lib/radar/RadarCanvas.svelte';

  let { bridge, title = 'Tactical', subtitle = '' } = $props();
</script>

<section class="pane">
  <div class="pane-head">
    <span class="pane-title">Navi-Console · {title}</span>
    <span class="pane-title" style="color:var(--ink-faint)">{subtitle}</span>
  </div>
  <div class="radar-body">
    <RadarCanvas {bridge} />
  </div>
</section>

<style>
  .radar-body {
    position: relative;
    flex: 1;
    min-height: 0;
  }
</style>
