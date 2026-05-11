import { useState } from "react";
import { MismatchSeverity } from "../../domain/types";
import { Info } from "lucide-react";

export function MismatchBadge({
  severity,
  note,
}: {
  severity: MismatchSeverity;
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const config = {
    match: {
      label: "Match",
      cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
    },
    cosmetic: {
      label: "Cosmetic",
      cls: "bg-amber-100 text-amber-800 border-amber-200",
    },
    functional: {
      label: "Functional",
      cls: "bg-red-100 text-red-800 border-red-200",
    },
  }[severity];

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => note && setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${config.cls} ${
          note ? "cursor-pointer hover:opacity-80" : ""
        }`}
      >
        {config.label}
        {note && <Info className="w-3 h-3" />}
      </button>
      {open && note && (
        <div className="absolute right-0 mt-1 w-72 bg-white border border-slate-200 rounded-md shadow-lg p-3 z-20 text-xs text-slate-700 leading-relaxed normal-case font-normal tracking-normal">
          {note}
          <button
            onClick={() => setOpen(false)}
            className="block mt-2 text-blue-600 text-[10px] uppercase tracking-wider"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
