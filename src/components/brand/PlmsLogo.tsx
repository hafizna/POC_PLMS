// PLMS mark: a single hexagonal cell (the graph/network unit this app
// reasons about — substations and lines as nodes/edges) containing a
// one-line-diagram fragment — terminal nodes joined by right-angle
// conductors, the way a relay/breaker bay is drawn on a real SLD. One
// conductor segment renders in brand-accent amber, standing in for the
// protection element that runs through every case. Monoline, no
// gradients — reads at 20px in a tab bar and at 96px on the login screen
// without redrawing.
//
// The hex stroke and node/line work follow `currentColor` (set via the
// `className` a caller passes, e.g. "text-white" on a dark header) so one
// mark works on both light and dark grounds; the amber segment is the one
// deliberate color note and stays constant regardless of ground.
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
      {/* one-line-diagram fragment: node -> down -> right -> amber gap -> node, plus a lower branch node */}
      <path
        d="M13 13v6h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 19h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M23 19h4"
        className="stroke-brand-accent"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M15 19v6.5h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="13" r="1.8" fill="white" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="15" cy="19" r="1.6" fill="currentColor" />
      <circle cx="21" cy="25.5" r="1.8" fill="white" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="27" cy="19" r="1.6" className="fill-brand-accent" />
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
