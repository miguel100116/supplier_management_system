// Event-driven batching with a maximum delay so a busy stream cannot starve updates.
export function createDebouncedTask(run: () => void, delay: number, maxWait: number) {
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(quietTimer);
    clearTimeout(deadline);
    quietTimer = deadline = undefined;
  };
  const flush = () => {
    cancel();
    run();
  };
  return {
    schedule() {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(flush, delay);
      deadline ??= setTimeout(flush, maxWait);
    },
    cancel,
  };
}
