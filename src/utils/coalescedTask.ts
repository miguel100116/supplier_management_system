// A refresh may publish only while the state it started from is still current.
export function createRefreshGuard() {
  let revision = 0;
  return {
    invalidate() { revision += 1; },
    start() {
      const startedAt = revision;
      return () => revision === startedAt;
    },
  };
}

/**
 * Runs at most one async task per key. Calls received while a task is running
 * mark that key dirty and cause one follow-up run after the active task ends.
 */
export function createCoalescedTaskRunner<Key>(
  task: (key: Key) => Promise<void>,
  shouldStop: () => boolean = () => false,
): (key: Key) => Promise<void> {
  const activeTasks = new Map<Key, Promise<void>>();
  const pendingKeys = new Set<Key>();

  return (key) => {
    const activeTask = activeTasks.get(key);
    if (activeTask) {
      pendingKeys.add(key);
      return activeTask;
    }

    const operation = Promise.resolve().then(async () => {
      try {
        do {
          pendingKeys.delete(key);
          await task(key);
        } while (!shouldStop() && pendingKeys.has(key));
      } finally {
        pendingKeys.delete(key);
        if (activeTasks.get(key) === operation) activeTasks.delete(key);
      }
    });
    activeTasks.set(key, operation);
    return operation;
  };
}
