<script>
  import { getContext } from 'svelte';
  import { goto } from '$app/navigation';
  import { getPath } from '@utils/navigation';

  let store = getContext('store');

  let password = $state('');
  let confirmPassword = $state('');
  let isLoading = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');

  async function handleReset(event) {
    event.preventDefault();
    errorMessage = '';

    if (password !== confirmPassword) {
      errorMessage = 'Passwords do not match';
      return;
    }

    isLoading = true;
    try {
      const { error } = await store.supabase.auth.updateUser({ password });
      if (error) throw error;
      successMessage = 'Password updated successfully. Redirecting...';
      setTimeout(() => goto(getPath('/games')), 2000);
    } catch (error) {
      errorMessage = error.message;
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="auth-container">
  <div class="auth-header">
    <h2>Reset Password</h2>
  </div>

  <form class="form" on:submit={handleReset}>
    <div class="form-group">
      <label for="password">New Password</label>
      <input
        type="password"
        id="password"
        placeholder="Enter new password"
        bind:value={password}
        required
      />
    </div>

    <div class="form-group">
      <label for="confirm-password">Confirm Password</label>
      <input
        type="password"
        id="confirm-password"
        placeholder="Confirm new password"
        bind:value={confirmPassword}
        required
      />
    </div>

    <button type="submit" class="btn btn-primary" disabled={isLoading}>
      {isLoading ? 'Updating...' : 'Update Password'}
    </button>

    {#if errorMessage}
      <div class="error-message">{errorMessage}</div>
    {/if}

    {#if successMessage}
      <div class="success-message">{successMessage}</div>
    {/if}
  </form>
</div>

<style>
</style>
