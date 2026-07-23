type CelebrationListener = (title: string) => void;

const listeners = new Set<CelebrationListener>();

export function showTaskCelebration(title: string) {
  for (const listener of listeners) listener(title);
}

export function subscribeToTaskCelebration(listener: CelebrationListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
