import { useProsetStore } from "../../store/useProsetStore";
import { Zap, RotateCcw, User, Activity } from "lucide-react";
import { NETWORK_CASES } from "../../domain/seed-network-registry";

export function TopBar() {
  const persona = useProsetStore((s) => s.currentPersona);
  const setPersona = useProsetStore((s) => s.setPersona);
  const resetAll = useProsetStore((s) => s.resetAll);
  const activeLineId = useProsetStore((s) => s.activeNetworkLineId);
  const selectLine = useProsetStore((s) => s.selectLine);

  // Find owning case + endpoints for the active line. Persistent across tabs
  // so engineer always knows which line they're working on.
  const activeContext = (() => {
    if (!activeLineId || activeLineId === "unknown") return null;
    const owningCase = NETWORK_CASES.find((c) =>
      c.lines.some((l) => l.id === activeLineId)
    );
    if (!owningCase) return null;
    const line = owningCase.lines.find((l) => l.id === activeLineId)!;
    const from = owningCase.nodes.find((n) => n.id === line.fromNodeId);
    const to = owningCase.nodes.find((n) => n.id === line.toNodeId);
    return {
      label: `${from?.shortCode ?? "?"} - ${to?.shortCode ?? "?"} ${line.circuit}`,
      caseId: owningCase.id,
    };
  })();

  return (
    <header className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Zap className="w-6 h-6 text-amber-400" strokeWidth={2.5} />
        <div>
          <div className="font-bold tracking-tight text-lg leading-none">PLMS</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">
            Protection Lifecycle Management System
          </div>
        </div>
        <span className="ml-2 text-[10px] uppercase tracking-wider px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded">
          POC v0.1
        </span>

        <div className="ml-4 pl-4 border-l border-slate-700 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[10px] uppercase tracking-wider text-slate-400">
            Working on:
          </span>
          <LinePicker activeLineId={activeContext ? activeLineId! : ""} onSelect={selectLine} activeLabel={activeContext?.label} />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={() => {
            if (confirm("Reset all parameter overrides to seeded values?")) {
              resetAll();
            }
          }}
          className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5"
          title="Reset all unsaved parameter changes"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset edits
        </button>
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-slate-400" />
          <select
            value={persona}
            onChange={(e) => setPersona(e.target.value as typeof persona)}
            className="bg-slate-800 text-white text-sm px-3 py-1.5 rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
          >
            <option>Engineer</option>
            <option>Asisten Manajer</option>
            <option>Manajer</option>
          </select>
        </div>
      </div>
    </header>
  );
}

function LinePicker({
  activeLineId,
  activeLabel,
  onSelect,
}: {
  activeLineId: string;
  activeLabel?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <select
      value={activeLineId}
      onChange={(e) => {
        if (e.target.value) onSelect(e.target.value);
      }}
      className="bg-slate-800 text-white text-xs px-2 py-1 rounded border border-slate-700 focus:border-blue-500 focus:outline-none min-w-44"
    >
      <option value="" disabled>
        {activeLabel ?? "Pilih line..."}
      </option>
      {NETWORK_CASES.flatMap((c) =>
        c.lines.map((line) => {
          const f = c.nodes.find((n) => n.id === line.fromNodeId);
          const t = c.nodes.find((n) => n.id === line.toNodeId);
          return (
            <option key={line.id} value={line.id}>
              {c.title} | {f?.shortCode} - {t?.shortCode} {line.circuit}
            </option>
          );
        })
      )}
    </select>
  );
}
