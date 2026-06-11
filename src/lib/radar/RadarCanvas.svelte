<script>
  // Mounts the Phaser tactical radar into a pane. Phaser is imported dynamically
  // (client-only; keeps it out of SSR/prerender and out of every page's bundle).
  // The host supplies the `bridge` (see phaser/RadarScene.js for the contract).
  import { onMount } from 'svelte';
  import { makeRadarScene } from './phaser/RadarScene.js';

  let { bridge } = $props();

  let host; // container div
  let game = null;

  onMount(() => {
    let destroyed = false;
    let ro = null;

    (async () => {
      const Phaser = (await import('phaser')).default;
      if (destroyed) return;

      const RadarScene = makeRadarScene(Phaser);
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host,
        width: host.clientWidth || 640,
        height: host.clientHeight || 480,
        backgroundColor: '#070d12',
        scene: new RadarScene(bridge),
        scale: { mode: Phaser.Scale.NONE },
        banner: false,
      });

      ro = new ResizeObserver(() => {
        if (game && host.clientWidth > 0 && host.clientHeight > 0) {
          game.scale.resize(host.clientWidth, host.clientHeight);
        }
      });
      ro.observe(host);
    })();

    return () => {
      destroyed = true;
      ro?.disconnect();
      game?.destroy(true);
      game = null;
    };
  });
</script>

<div class="radar-host" bind:this={host}></div>

<style>
  .radar-host {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .radar-host :global(canvas) {
    display: block;
  }
</style>
