"use client";

import type { HorseCompletenessResult } from "@/lib/engagement/horse-completeness";

/**
 * Slim completeness bar for a single horse's profile.
 *
 * Always pure render — caller passes the result of
 * computeHorseCompleteness, which is a synchronous computation that
 * the server has already run during page load.
 *
 * For the barn horse-list view, use <HorseCompletenessDot> instead —
 * same data, dot-only.
 */
export function HorseCompletenessBar({
  result,
}: {
  result: HorseCompletenessResult;
}) {
  const score = result.score;
  const color = colorFor(score);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span
          className="font-medium uppercase tracking-wide"
          style={{ color }}
        >
          Profile {score}% complete
        </span>
        {result.nextHint && score < 100 && (
          <span className="truncate text-barn-dark/55">
            Next: {result.nextHint.label} +{result.nextHint.weight}%
          </span>
        )}
      </div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "rgba(42,64,49,0.1)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${score}%`,
            background: color,
            transition: "width 600ms ease-out",
          }}
        />
      </div>
    </div>
  );
}

export function HorseCompletenessDot({ score }: { score: number }) {
  const color = colorFor(score);
  return (
    <span
      aria-label={`Profile ${score}% complete`}
      title={`Profile ${score}% complete`}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 999,
        background: color,
      }}
    />
  );
}

function colorFor(score: number): string {
  if (score >= 80) return "#2a4031"; // forest
  if (score >= 50) return "#c9a84c"; // brass
  return "rgba(42,64,49,0.35)"; // muted
}
