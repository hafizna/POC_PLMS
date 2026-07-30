import { RotateCcw, User, Zap } from "lucide-react";
import { useProsetStore, type Tab } from "../../store/useProsetStore";

const TAB_LABELS: Record<Tab, string> = {
  cases: "Setting Cases",
  "reference-setting": "Reference Setting",
  home: "Legacy Home",
  "master-data": "Data Teknis",
  "study-dashboard": "Bay List",
  "network-model": "Working Network",
  "network-graph-editor": "Network Builder",
  "source-index": "Dokumen Sumber",
  inbox: "Mapping Inbox",
  "line-registry": "Setting Register",
  calculation: "Calculation POC",
  comparison: "Actual Comparison",
  "vendor-import": "Vendor Import",
  coverage: "Coverage Check",
  "verified-report": "Verified Report",
  "audit-trail": "Audit Trail",
};

export function TopBar() {
  const tab = useProsetStore((state) => state.currentTab);
  const persona = useProsetStore((state) => state.currentPersona);
  const setPersona = useProsetStore((state) => state.setPersona);
  const resetAll = useProsetStore((state) => state.resetAll);

  return (
    <header className="flex min-h-16 items-center justify-between gap-4 bg-slate-950 px-4 py-3 text-white sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-400 text-slate-950">
          <Zap className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-tight">PLMS</span>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
              Sprint 4.1
            </span>
          </div>
          <div className="truncate text-[11px] text-slate-400">
            Protection Lifecycle Management System · {TAB_LABELS[tab]}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (confirm("Reset seluruh override dan state lokal ke nilai awal?")) {
              resetAll();
            }
          }}
          className="hidden items-center gap-1.5 text-xs text-slate-300 transition-colors hover:text-white sm:flex"
          title="Reset local state"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
        <div className="flex items-center gap-2">
          <User className="hidden h-4 w-4 text-slate-500 sm:block" />
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.08em] text-slate-500 md:inline">
            Demo role
          </span>
          <select
            value={persona}
            onChange={(event) => setPersona(event.target.value as typeof persona)}
            className="max-w-36 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500"
            aria-label="Demo role persona"
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
