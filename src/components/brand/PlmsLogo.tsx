// PLMS mark: a single hexagonal cell (the graph/network unit this app
// reasons about — substations and lines as nodes/edges) split by a bolt,
// standing in for the protection-relay trip decision that runs through
// every case. Monoline, no gradients — reads at 20px in a tab bar and at
// 96px on the login screen without redrawing.
//
// The hex stroke follows `currentColor` (set via the `className` a caller
// passes, e.g. "text-white" on a dark header) so one mark works on both
// light and dark grounds; the bolt stays brand-accent amber always, since
// it's the one deliberate color note in an otherwise monoline mark.
export function PlmsMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      role="img"
      aria-label="PLMS"
    >
      <path
        d="M20 2.5 35.5 11v18L20 37.5 4.5 29V11L20 2.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M22.4 9 12.5 22.2h7.3L17.4 31 27.5 17.4h-7.3L22.4 9Z"
        className="fill-brand-accent"
      />
    </svg>
  );
}

export function PlmsWordmark({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <PlmsMark size={32} className="text-brand-ink" />
      <span className="text-[20px] font-semibold tracking-[-0.02em] text-brand-ink">
        PLMS
      </span>
    </div>
  );
}
