/**
 * Anthropic pricing for cost-cents accounting on assistant_usage rows.
 *
 * Rates are per million tokens, in USD. The cost-cents column in
 * assistant_usage stores integer cents — converting at write time means the
 * admin dashboard can sum without floats.
 *
 * Update RATES when Anthropic changes pricing or when we change models.
 * The pricing-by-model lookup is intentionally inlined here (not env-var'd)
 * so a config change to the model in lib/assistant/config.ts forces a
 * matching pricing update in code review.
 */

interface ModelRates {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M tokens read from the prompt cache (typically input × 0.1). */
  cacheRead: number;
  /** USD per 1M tokens written to the prompt cache (typically input × 1.25). */
  cacheWrite: number;
}

const RATES: Record<string, ModelRates> = {
  // Sonnet 4.6 — current default for BarnPilot.
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  // Opus 4.6 — fallback if someone overrides ASSISTANT_MODEL.
  "claude-opus-4-6": {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
};

const FALLBACK_RATES = RATES["claude-sonnet-4-6"];

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * Convert token counts into integer cents for the assistant_usage row.
 * Rounds up so we never under-bill the meter.
 */
export function calculateCostCents(
  model: string,
  usage: TokenUsage,
): number {
  const rates = RATES[model] ?? FALLBACK_RATES;
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;

  const dollars =
    (input * rates.input +
      output * rates.output +
      cacheRead * rates.cacheRead +
      cacheWrite * rates.cacheWrite) /
    1_000_000;

  return Math.ceil(dollars * 100);
}
