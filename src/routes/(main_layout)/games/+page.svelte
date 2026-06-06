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
  let myCharacters = $state([]); // for "bring a character" when joining

  // join-by-code
  let joinCode = $state('');
  let joinCharacterId = $state('');
  let joinError = $state('');
  let joining = $state(false);

  async function loadSeats() {
    seatsLoading = true;
    await store.checkAuth?.();
    if (!store.user?.id) { seats = []; myCharacters = []; seatsLoading = false; return; }
    const { data, error } = await store.supabase
      .from('player')
      .select('id, game:game_id(id, name, invite_code), role:role_id(name)')
      .eq('user_id', store.user.id);
    if (error) { logger.error('app', 'Failed to load seats', error); seats = []; }
    else {
      seats = (data ?? [])
        .filter((s) => s.game)
        .map((s) => ({
          gameId: s.game.id,
          gameName: s.game.name,
          inviteCode: s.game.invite_code,
          role: s.role?.name ?? 'Player',
          isGM: (s.role?.name ?? '') === 'Game Master',
        }))
        .sort((a, b) => a.gameName.localeCompare(b.gameName));
    }
    myCharacters = await store.load_my_characters();
    seatsLoading = false;
  }

  function entryPath(seat) {
    return getPath(`${seat.isGM ? '/gm' : '/player'}?game_id=${seat.gameId}`);
  }

  let availableCharacters = $derived(myCharacters.filter((c) => !c.game));

  onMount(() => {
    logger.debug('app', 'Games page mounted');
    loadSeats();
  });

  // Create game modal — creator is seated as Game Master.
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
      await store.create_game_with_gm(gameName);
      gameName = '';
      gameModal.close();
      await loadSeats();
    }
  }

  function handleCancel() {
    gameName = '';
    errors = { name: '' };
  }

  async function handleJoin(e) {
    e.preventDefault();
    joinError = '';
    if (!joinCode.trim()) { joinError = 'Enter an invite code.'; return; }
    if (!joinCharacterId) { joinError = 'Pick a character to bring.'; return; }
    joining = true;
    try {
      await store.join_game_by_code(joinCode.trim(), Number(joinCharacterId));
      joinCode = '';
      joinCharacterId = '';
      await loadSeats();
    } catch (err) {
      joinError = err?.message ?? String(err);
    } finally {
      joining = false;
    }
  }
</script>

<div class="container">
  <div style="display:flex; align-items:center;">
    <h2>My Games</h2>
    <button class="btn btn-primary" style="margin-left: auto;" onclick={() => gameModal.open()}>+ Create</button>
  </div>

  <!-- Join a game by invite code -->
  <form class="join-panel" onsubmit={handleJoin}>
    <span class="join-title">Join a game</span>
    <input type="text" placeholder="Invite code" bind:value={joinCode} />
    {#if availableCharacters.length === 0}
      <a href={getPath('/characters')} class="muted-link">Create a free character to bring →</a>
    {:else}
      <select bind:value={joinCharacterId}>
        <option value="">Bring a character…</option>
        {#each availableCharacters as c}<option value={c.id}>{c.name || 'Unnamed'}</option>{/each}
      </select>
      <button type="submit" class="btn btn-primary" disabled={joining}>Join</button>
    {/if}
    {#if joinError}<span class="join-error">{joinError}</span>{/if}
  </form>

  {#if seatsLoading}
    <h3>Loading…</h3>
  {:else if seats.length > 0}
    <ul class="games" style="font-size: 1.3rem; list-style: none; padding: 0;">
      {#each seats as seat}
        <li style="margin: 10px 0; display: flex; align-items: center; gap: 12px;">
          <a href={entryPath(seat)}>{seat.gameName}</a>
          <span class="role-badge {seat.isGM ? 'gm' : 'player'}">{seat.role}</span>
          {#if seat.isGM && seat.inviteCode}
            <span class="invite-code" title="Share this code so others can join your game">code: {seat.inviteCode}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <div style="text-align: center;">
      <h3>You're not in any games yet.</h3>
      <p>Create one (you'll be its Game Master), or join with an invite code.</p>
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
  .invite-code { font-family: monospace; font-size: 0.8rem; color: #6f8d97; letter-spacing: 0.05em; }
  .join-panel {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin: 14px 0 8px;
    padding: 12px 14px;
    border: 1px solid #333;
    border-radius: 6px;
  }
  .join-title { font-size: 0.9rem; color: #bbb; letter-spacing: 0.04em; }
  .join-panel input, .join-panel select { padding: 7px 9px; }
  .join-error { color: #d05a4f; font-size: 0.85rem; }
  .muted-link { font-size: 0.85rem; color: #6f8d97; }
</style>
