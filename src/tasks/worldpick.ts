// A random world for each Workshop attempt, never the one already on the wall (when there is a choice).
export function pickAttemptWorld<T extends { id: string }>(list: readonly T[], currentId: string | undefined, rnd: () => number): T | null {
  const choices = list.length > 1 ? list.filter((w) => w.id !== currentId) : [...list];
  if (!choices.length) return null;
  return choices[Math.min(choices.length - 1, Math.floor(rnd() * choices.length))];
}
