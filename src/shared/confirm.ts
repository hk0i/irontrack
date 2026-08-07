// Only the confirm-then-bail guard is shared between delete flows across
// the app (DashboardScreen.removeRoutine, WorkoutHistoryScreen.deleteEntry)
// — what happens after confirming (a full reload vs. local array pruning)
// differs enough per call site that it stays the caller's job.
export async function confirmThenDelete(message: string, action: () => Promise<void>): Promise<void> {
  if (!confirm(message)) return;
  await action();
}
