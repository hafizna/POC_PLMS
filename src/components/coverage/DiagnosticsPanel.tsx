import { useState } from "react";
import type { GraphDiagnostic } from "../../lib/graph-coordination";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, ChevronDown } from "lucide-react";

export function DiagnosticsPanel({ diagnostics }: { diagnostics: GraphDiagnostic[] }) {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const infos = diagnostics.filter((d) => d.severity === "info");
  const total = diagnostics.length;

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Coordination Diagnostics
          </h2>
          <div className="flex items-center gap-3 text-xs">
            {errors.length > 0 && (
              <span className="flex items-center gap-1 text-red-700">
                <AlertCircle className="w-3.5 h-3.5" /> {errors.length} errors
              </span>
            )}
            {warnings.length > 0 && (
              <span className="flex items-center gap-1 text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5" /> {warnings.length} warnings
              </span>
            )}
            {total === 0 && (
              <span className="flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> All checks passing
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {[...errors, ...warnings, ...infos].map((d) => (
          <DiagnosticRow key={d.id} diag={d} />
        ))}
        {total === 0 && (
          <div className="p-6 text-sm text-slate-500 text-center">
            No coordination issues detected with current settings. Edit a zone reach in the
            parameter panel to see live diagnostic updates.
          </div>
        )}
      </div>
    </div>
  );
}

function DiagnosticRow({ diag }: { diag: GraphDiagnostic }) {
  const [expanded, setExpanded] = useState(false);
  const Icon =
    diag.severity === "error"
      ? AlertCircle
      : diag.severity === "warning"
      ? AlertTriangle
      : Info;
  const color =
    diag.severity === "error"
      ? "text-red-600"
      : diag.severity === "warning"
      ? "text-amber-600"
      : "text-blue-600";

  return (
    <button
      onClick={() => setExpanded((v) => !v)}
      className="w-full text-left p-4 hover:bg-slate-50 flex gap-3"
    >
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-slate-900">{diag.title}</span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
        {expanded && (
          <div className="mt-2 text-xs text-slate-600 leading-relaxed">
            {diag.detail}
            <div className="mt-2 text-[10px] font-mono text-slate-400">
              code: {diag.code}
              {diag.affectedZones &&
                ` | zones: ${diag.affectedZones.join(", ")}`}
            </div>
          </div>
        )}
      </div>
    </button>
  );
}
