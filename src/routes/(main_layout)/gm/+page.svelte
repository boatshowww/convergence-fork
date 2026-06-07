<script>
  // Game Master view host. Resolves the game + the user's seat, confirms the seat
  // role is Game Master (Option A: role-determined view), and renders GmView.
  // Broadcast sync (players' live attempts) is wired in the next step.
  import { getContext, onMount } from 'svelte';
  import { page } from '$app/state';
  import { makeCheckNet } from '@lib/check/net.js';
  import GmView from './GmView.svelte';
  import { GmCheck } from './gmCheck.svelte.js';

  const store = getContext('store');
  const gm = new GmCheck();
  let net = null;

  let status = $state('loading'); // loading | ready | error
  let statusMsg = $state('');
  let gameName = $state('');
  let gameId = $state(null);
  let hasCharacter = $state(false); // GM also has a character here -> offer player view

  onMount(() => {
    gameId = page.url.searchParams.get('game_id');
    if (!gameId) { status = 'error'; statusMsg = 'No game specified.'; return; }

    (async () => {
      try {
        await store.checkAuth?.();
        await store.load_game(gameId, true);
        await store.subscribeRealtime(gameId);
        await store.data.game.load_players();

        const seat = store.data.players.find((p) => p.user_id === store.user?.id);
        const isGM = seat?.role?.name === 'Game Master' || store.data.game?.user_id === store.user?.id;
        if (!isGM) {
          status = 'error';
          statusMsg = `Your role in this game is "${seat?.role?.name ?? 'unknown'}". The GM view is for the Game Master.`;
          return;
        }
        hasCharacter = (seat?.characters ?? []).length > 0;
        gameName = store.data.game?.name ?? 'Game';

        // wire the broadcast channel: receive players' attempts into the queue
        net = makeCheckNet(store, (event, data) => {
          if (event === 'check:attempt') gm.applyAttempt(data);
          else if (event === 'check:attempt-updated') gm.applyAttemptUpdated(data);
          else if (event === 'check:attempt-ejected') gm.applyAttemptEjected(data);
        });
        gm.attach(net);

        status = 'ready';
      } catch (e) {
        status = 'error';
        statusMsg = String(e?.message ?? e);
      }
    })();

    return () => { net?.dispose(); store.clearGameData?.(); };
  });
</script>

<GmView {status} {statusMsg} {gameName} {gameId} {hasCharacter} {gm} />
