<script>
  // Renders the d15 (with crit/fail state + explosion chain) and the background
  // luck die. Pure presentation of a roll's { d15, luck } objects from dice.js.
  let { d15, luck } = $props();

  let firstFace = $derived(d15.chain[0]);
  let d15Class = $derived(d15.crit ? 'crit' : d15.fail ? 'fail' : '');
  let totalSuffix = $derived(d15.fail ? ' · critical fail' : d15.crit ? ' · critical' : '');
  let luckText = $derived(
    luck.cosmic
      ? 'COSMIC MOMENT — luck reached 30'
      : `luck die · ${luck.base}${luck.base !== luck.sum ? ` (+${luck.sum - luck.base})` : ''}`
  );
</script>

<div class="dice">
  <div class="d15 {d15Class}"><div class="d15-shape"></div><div class="d15-num">{firstFace}</div></div>
  <div class="dice-info">
    <div class="dice-total">total <b>{d15.total}</b>{totalSuffix}</div>
    {#if d15.chain.length > 1}
      <div class="dice-chain">✦ crit chain: {d15.chain.join(' → ')} = {d15.total}</div>
    {/if}
    <div class="luck {luck.cosmic ? 'cosmic' : ''}">
      <div class="luck-die">d30</div><span class="luck-txt">{luckText}</span>
    </div>
  </div>
</div>
