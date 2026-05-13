/**
 * BarnPilot configuration constants.
 *
 * Server-only. Do not import from a client component (the model and pricing
 * constants are not secrets, but ANTHROPIC_API_KEY-adjacent code should stay
 * server-side as a defense-in-depth measure).
 */

/** Display name for the assistant. */
export const ASSISTANT_NAME = "BarnPilot";

/** Default chat model. Sonnet 4.6 — capable enough for data retrieval + */
/** formatting, ~60% cheaper than Opus. */
export const ASSISTANT_MODEL =
  process.env.ASSISTANT_MODEL || "claude-sonnet-4-6";

/** Endpoint key used in api_call_log for rate-limit accounting. */
export const ASSISTANT_ENDPOINT = "assistant/chat";

/** Max conversation turns sent to Claude. Older turns are dropped. */
export const MAX_HISTORY_MESSAGES = 20;

/** Max tool-use rounds per turn (safety stop for runaway loops). */
export const MAX_TOOL_ROUNDS = 5;

/** Output token caps. Higher ceiling for tool-use responses since they */
/** wrap structured cards in JSON. */
export const MAX_TOKENS_DEFAULT = 1000;
export const MAX_TOKENS_TOOL_USE = 2000;

/** Rate limits — conservative for v1, room to loosen later from telemetry. */
export const RATE_LIMITS_FREE = { hour: 5, day: 20 } as const;
export const RATE_LIMITS_PAID = { hour: 20, day: 100 } as const;
