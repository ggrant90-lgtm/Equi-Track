/**
 * BarnPilot brand mark — horseshoe (opens up) with upward-fanning aviator
 * wings, USAF/Top Gun style.
 *
 * Sized to fill ~75% of the 24x24 viewBox vertically (wing tips above
 * the horseshoe, arc reaches near the bottom) so the visual mass
 * matches the other line-art nav icons.
 *
 * Composition:
 *   - Horseshoe is taller than wide — prongs y=4..15, arc bottoms at y=20
 *   - Caulks (heel nubs) sit on top of the prongs
 *   - Three feather sweeps per wing, each fanning UP and OUT from the
 *     side of the horseshoe (top feather climbs above the horseshoe top)
 */
export function BarnPilotIcon({
  size = 24,
  strokeWidth = 2,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Horseshoe — opens UP, taller than before */}
      <path d="M 7 4 V 15 a 5 5 0 0 0 10 0 V 4" />
      {/* Caulks on top of prongs */}
      <path d="M 5.5 4 H 8.5" />
      <path d="M 15.5 4 H 18.5" />

      {/* Left wing — three feathers fanning UP and out */}
      <path d="M 7 8 L 1 2" />
      <path d="M 7 11 L 1 6.5" />
      <path d="M 7 14 L 1.5 11" />

      {/* Right wing — mirror */}
      <path d="M 17 8 L 23 2" />
      <path d="M 17 11 L 23 6.5" />
      <path d="M 17 14 L 22.5 11" />
    </svg>
  );
}
