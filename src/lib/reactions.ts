/** Shown as one-tap choices; the full picker offers every other emoji. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👎", "👏"] as const;

export type Reaction = { message_id: string; user_id: string; emoji: string };
export type ReactionSummary = { emoji: string; count: number; mine: boolean };

/** Group one message's reactions into emoji + number of people, in the order they first appeared. */
export function summarizeReactions(
  reactions: Reaction[],
  messageId: string,
  userId: string,
): ReactionSummary[] {
  const groups = new Map<string, Set<string>>();
  for (const r of reactions) {
    if (r.message_id !== messageId) continue;
    const people = groups.get(r.emoji) ?? new Set<string>();
    people.add(r.user_id);
    groups.set(r.emoji, people);
  }
  return [...groups].map(([emoji, people]) => ({ emoji, count: people.size, mine: people.has(userId) }));
}
