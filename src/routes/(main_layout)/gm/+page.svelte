<script>
  // Game Master view host. Resolves the game + the user's seat, confirms the seat
  // role is Game Master (Option A: role-determined view), and renders GmView.
  // Broadcast sync (players' live attempts) is wired in the next step.
  import { getContext, onMount } from 'svelte';
  import { page } from '$app/state';
  import GmView from './GmView.svelte';

  const store = getContext('store');

  let status = $state('loading'); // loading | ready | error
  let statusMsg = $state('');
  let gameName = $state('');

  onMount(() => {
    const gameId = page.url.searchParams.get('game_id');
    if (!gameId) { status = 'error'; statusMsg = 'No game specified.'; return; }

    (async () => {
      try {
        await store.checkAuth?.();
        await store.load_game(gameId, true);
        await store.subscribeRealtime(gameId);
        await store.data.game.load_players();

        const seat = store.data.players.find((p) => p.user_id === store.user?.id);
        if (!seat) { status = 'error'; statusMsg = 'You have no seat in this game.'; return; }
        if (seat.role?.name !== 'Game Master') {
          status = 'error';
          statusMsg = `Your role in this game is "${seat.role?.name ?? 'unknown'}". The GM view is for Game Master seats.`;
          return;
        }
        gameName = store.data.game?.name ?? 'Game';
        status = 'ready';
      } catch (e) {
        status = 'error';
        statusMsg = String(e?.message ?? e);
      }
    })();

    return () => store.clearGameData?.();
  });
</script>

<GmView {status} {statusMsg} {gameName} />
