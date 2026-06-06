<script>
  //Styles
  import '@styles/app.css';
  //Utility
  import { getPath } from '@utils/navigation';
  import { onMount } from 'svelte';
  import { getContext } from 'svelte';
  import logger from '@utils/logger';
  //Components
  import Modal from '@components/Modal.svelte';

  logger.debug('app', 'Games page script start');

  let store = getContext('store');

  // The user's seats across all games (membership), each with its game + role.
  // Drives role-aware entry: a Player seat -> /player, a Game Master seat -> /gm.
  let seats = $state([]);
  let seatsLoading = $state(true);

  async function loadSeats() {
    seatsLoading = true;
    await store.checkAuth?.();
    if (!store.user?.id) { seats = []; seatsLoading = false; return; }
    const { data, error } = await store.supabase
      .from('player')
      .select('id, game:game_id(id, name), role:role_id(name)')
      .eq('user_id', store.user.id);
    if (error) { logger.error('app', 'Failed to load seats', error); seats = []; }
    else {
      seats = (data ?? [])
        .filter((s) => s.game)
        .map((s) => ({
          playerId: s.id,
          gameId: s.game.id,
          gameName: s.game.name,
          role: s.role?.name ?? 'Player',
          isGM: (s.role?.name ?? '') === 'Game Master',
        }))
        .sort((a, b) => a.gameName.localeCompare(b.gameName));
    }
    seatsLoading = false;
  }

  function entryPath(seat) {
    return getPath(`${seat.isGM ? '/gm' : '/player'}?game_id=${seat.gameId}`);
  }

  onMount(() => {
    logger.debug('app', 'Games page mounted');
    loadSeats();
  });

  // Create game modal
  let gameModal;
  let gameName = $state('');
  let errors = $state({ name: '' });

  function validateForm() {
    errors = { name: '' };
    if (!gameName.trim()) { errors.name = 'Game name is required'; return false; }
    return true;
  }

  async function handleCreateGame(e) {
    e.preventDefault();
    if (validateForm()) {
      await store.create_game({ name: gameName, user_id: store.user.id });
      gameName = '';
      gameModal.close();
      await loadSeats(); // reflect the new game (creator's seat handling is a known gap)
    }
  }

  function handleCancel() {
    gameName = '';
    errors = { name: '' };
  }
</script>

<div class="container">
  <div style="display:flex; align-items:center;">
    <h2>Games</h2>
    <button class="btn btn-primary" style="margin-left: auto;" onclick={() => gameModal.open()}>+ Create</button>
  </div>

  {#if seatsLoading}
    <h3>Loading…</h3>
  {:else if seats.length > 0}
    <ul class="games" style="font-size: 1.3rem; list-style: none; padding: 0;">
      {#each seats as seat}
        <li style="margin: 10px 0; display: flex; align-items: center; gap: 12px;">
          <a href={entryPath(seat)}>{seat.gameName}</a>
          <span class="role-badge {seat.isGM ? 'gm' : 'player'}">{seat.role}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <div style="text-align: center;">
      <h3>You're not in any games yet.</h3>
      <p>Create one to get started (you'll be its Game Master).</p>
    </div>
  {/if}
</div>

<Modal
  bind:this={gameModal}
  title="Create New Game"
  type="confirm_cancel"
  confirmText="Create"
  closeable={true}
  onClose={handleCancel}
  onConfirm={handleCreateGame}
>
  <form class="modal-form" onsubmit={handleCreateGame}>
    <div class="form-group">
      <label for="game-name">Game Name</label>
      <input
        type="text"
        id="game-name"
        placeholder="Enter game name"
        bind:value={gameName}
        class={errors.name ? 'error' : ''}
      />
      {#if errors.name}
        <div class="error-message">{errors.name}</div>
      {/if}
    </div>
  </form>
</Modal>

<style>
  .container { padding: 20px; }
  .games a { text-decoration: none; }
  .role-badge {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 3px;
    border: 1px solid currentColor;
  }
  .role-badge.gm { color: #e8b667; }
  .role-badge.player { color: #3fd0c9; }
</style>
