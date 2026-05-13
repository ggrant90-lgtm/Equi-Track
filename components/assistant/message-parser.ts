/**
 * Extract barnpilot-card and barnpilot-followups JSON blocks from an
 * assistant message's raw text. The system prompt instructs Claude to
 * emit:
 *
 *   ```barnpilot-card
 *   { "card_type": "...", "data": { ... } }
 *   ```
 *
 *   ```barnpilot-followups
 *   { "followups": ["...", "..."] }
 *   ```
 *
 * The parser strips those blocks from the prose and returns them
 * separately so the renderer can place them in their own UI slots.
 */

export interface ParsedCard {
  card_type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export interface ParsedMessage {
  /** The prose with all fenced blocks removed. */
  text: string;
  /** Zero or more cards, in source order. */
  cards: ParsedCard[];
  /** Latest follow-up suggestions, or null if none. */
  followups: string[] | null;
}

const FENCE_RE = /```(barnpilot-card|barnpilot-followups)\s*\n([\s\S]*?)```/g;

export function parseAssistantMessage(raw: string): ParsedMessage {
  const cards: ParsedCard[] = [];
  let followups: string[] | null = null;

  const stripped = raw.replace(FENCE_RE, (_match, label: string, body: string) => {
    try {
      const parsed = JSON.parse(body.trim());
      if (label === "barnpilot-card" && parsed?.card_type) {
        cards.push({ card_type: String(parsed.card_type), data: parsed.data });
      } else if (label === "barnpilot-followups" && Array.isArray(parsed?.followups)) {
        followups = parsed.followups
          .filter((s: unknown) => typeof s === "string")
          .slice(0, 4);
      }
    } catch {
      /* swallow — leave the fence stripped from prose either way */
    }
    return "";
  });

  return {
    text: stripped.trim(),
    cards,
    followups,
  };
}
