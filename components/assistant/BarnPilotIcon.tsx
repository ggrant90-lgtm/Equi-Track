/**
 * BarnPilot brand mark — horseshoe flanked by delta-wing aviator triangles.
 *
 * Stroke-based line art so it inherits the surrounding color via
 * currentColor. Reads cleanly from ~16px (TopNav button) to ~32px+.
 *
 * If you want to tweak:
 *   - Horseshoe shape: the first <path> (M..V..a..V..)
 *   - Caulks (heel nubs): the two short horizontal <path>s
 *   - Wings: the two triangular <path>s (delta-wing geometry, no curves)
 */
export function BarnPilotIcon({
  size = 24,
  strokeWidth = 1.6,
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
      {/* Horseshoe (U-shape opening down, centered) */}
      <path d="M8 16 V11 a4 4 0 0 1 8 0 V16" />
      {/* Caulks (heel nubs) */}
      <path d="M6.8 16.3 h2.4" />
      <path d="M14.8 16.3 h2.4" />

      {/* Left delta wing — geometric triangle, no feathers */}
      <path d="M8 12 L2.5 13.5 L8 15" />

      {/* Right delta wing (mirror) */}
      <path d="M16 12 L21.5 13.5 L16 15" />
    </svg>
  );
}
