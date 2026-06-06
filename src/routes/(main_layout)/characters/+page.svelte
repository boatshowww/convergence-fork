<script>
  // My Characters hub. Characters are user-owned and game-independent: create one
  // any time, see which game (if any) it's currently in, and assign/remove it.
  import '@styles/app.css';
  import { getPath } from '@utils/navigation';
  import { getContext, onMount } from 'svelte';
  import logger from '@utils/logger';
  import CharacterCreation from '../game/components/CharacterCreation.svelte';

  const store = getContext('store');

  let characters = $state([]);
  let myGames = $state([]); // games I'm a member of (for "add to game")
  let loading = $state(true);
  let busyId = $state(null);
  let ccRef;

  async function refresh() {
    loading = true;
    await store.checkAuth?.();
    if (!store.user?.id) { characters = []; myGames = []; loading = false; return; }
    characters = await store.load_my_characters();
    const { data } = await store.supabase
      .from('player')
      .select('game:game_id(id, name), role:role_id(name)')
      .eq('user_id', store.user.id);
    myGames = (data ?? [])
      .filter((s) => s.game)
      .map((s) => ({ id: s.game.id, name: s.game.name, role: s.role?.name ?? 'Player' }));
    loading = false;
  }

  onMount(refresh);

  async function addToGame(character, gameId) {
    if (!gameId) return;
    busyId = character.id;
    try { await store.assign_character_to_game(character.id, Number(gameId)); await refresh(); }
    catch (e) { logger.error('app', 'assign failed', e); }
    finally { busyId = null; }
  }

  async function removeFromGame(character) {
    busyId = character.id;
    try { await store.remove_character_from_game(character.id); await refresh(); }
    catch (e) { logger.error('app', 'remove failed', e); }
    finally { busyId = null; }
  }
</script>

<div class="container">
  <div style="display:flex; align-items:center; gap:12px;">
    <h2>My Characters</h2>
    <button class="btn btn-primary" style="margin-left:auto;" onclick={() => ccRef.initiateCharacterCreation()}>+ New Character</button>
  </div>

  {#if loading}
    <h3>Loading…</h3>
  {:else if characters.length === 0}
    <div style="text-align:center; padding: 2rem 0;">
      <h3>No characters yet.</h3>
      <p>Create one — you can build it now and bring it into a game later.</p>
    </div>
  {:else}
    <ul class="char-list">
      {#each characters as c}
        <li class="char-row">
          <div class="char-main">
            <span class="char-name">{c.name || 'Unnamed'}</span>
            {#if c.game}
              <span class="in-game">in {c.game.name}</span>
            {:else}
              <span class="free">available</span>
            {/if}
          </div>
          <div class="char-actions">
            {#if c.game}
              <button class="btn" disabled={busyId === c.id} onclick={() => removeFromGame(c)}>Remove from game</button>
            {:else if myGames.length > 0}
              <select disabled={busyId === c.id} onchange={(e) => addToGame(c, e.currentTarget.value)}>
                <option value="">Add to a game…</option>
                {#each myGames as g}<option value={g.id}>{g.name} ({g.role})</option>{/each}
              </select>
            {:else}
              <a href={getPath('/games')} class="muted-link">Create or join a game first →</a>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<CharacterCreation bind:this={ccRef} onCreated={refresh} />

<style>
  .container { padding: 20px; }
  .char-list { list-style: none; padding: 0; margin-top: 12px; }
  .char-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #333; }
  .char-main { display: flex; align-items: baseline; gap: 10px; flex: 1; }
  .char-name { font-size: 1.3rem; color: #f5f5f5; }
  .in-game { font-size: 0.85rem; color: #e8b667; }
  .free { font-size: 0.85rem; color: #3fd0c9; }
  .char-actions { display: flex; align-items: center; gap: 8px; }
  .char-actions select { padding: 6px 8px; }
  .muted-link { font-size: 0.85rem; color: #6f8d97; }
</style>
