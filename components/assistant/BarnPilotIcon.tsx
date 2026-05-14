/**
 * BarnPilot brand mark — horseshoe (opens up, prongs + caulks at top) with
 * wide aviator wings sweeping outward.
 *
 * Stroke-based so it inherits the surrounding color via currentColor.
 * Default strokeWidth 2.2 is on the bold side — the icon should have
 * presence at 24-32px in the TopNav.
 *
 * Composition:
 *   - Horseshoe is upright (lucky orientation, matches reference logo)
 *   - Caulks sit on top of the prongs
 *   - Two flat-then-tapered feather sweeps per wing — geometric, not bird-like
 *
 * Tweaking guide:
 *   - Make horseshoe taller: change the `V 12` to e.g. `V 13` (longer prongs)
 *   - Wider wings: extend the second coord of each wing path further from 1.5/22.5
 *   - More feathers per wing: add another <path> between 9-15 inner and the outer tip
 */
export function BarnPilotIcon({
  size = 24,
  strokeWidth = 2.2,
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
      {/* Horseshoe — opens UP, big U-shape with arc at bottom */}
      <path d="M 9 6 V 12 a 3 3 0 0 0 6 0 V 6" />
      {/* Caulks (heel nubs) at the top of each prong */}
      <path d="M 7.8 6 H 10.2" />
      <path d="M 13.8 6 H 16.2" />

      {/* Left wing — two flat feather sweeps */}
      <path d="M 9 10 L 1.5 11" />
      <path d="M 9 12 L 3.5 13.5" />

      {/* Right wing — mirror */}
      <path d="M 15 10 L 22.5 11" />
      <path d="M 15 12 L 20.5 13.5" />
    </svg>
  );
}
