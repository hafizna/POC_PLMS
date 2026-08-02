import { useEffect, useMemo, useState } from "react";
import { useProsetStore } from "../../store/useProsetStore";
import { ParameterTable } from "./ParameterTable";
import { summarizeBay } from "../../lib/mismatch-classifier";
import { CheckCircle2, AlertTriangle, AlertOctagon, FileWarning } from "lucide-react";

const ALL_TAB = "__ALL__";

export function ComparisonView() {
  const bays = useProsetStore((s) => s.comparisonBays);
  const selectedBayId = useProsetStore((s) => s.comparisonBayId);
  const setBay = useProsetStore((s) => s.setComparisonBay);

  const bay = bays.find((b) => b.bay.id === selectedBayId) ?? bays[0];
  const summary = useMemo(() => summarizeBay(bay.parameters), [bay]);

  // Group parameters by function block
  const groups = useMemo(() => {
    const map = new Map<string, typeof bay.parameters>();
    for (const row of bay.parameters) {
      if (!map.has(row.fn)) map.set(row.fn, []);
      map.get(row.fn)!.push(row);
    }
    return Array.from(map.entries());
  }, [bay]);

  const fnNames = useMemo(() => groups.map(([name]) => name), [groups]);
  const [activeFn, setActiveFn] = useState<string>(ALL_TAB);

  // Reset to All when switching bays so we don't sit on a function the new bay
  // doesn't expose (e.g. OCR-only generated bays don't have "Scheme").
  useEffect(() => {
    setActiveFn(ALL_TAB);
  }, [bay.bay.id]);

  const visibleGroups =
    activeFn === ALL_TAB
      ? groups
      : groups.filter(([name]) => name === activeFn);

  const tabSummaries = useMemo(() => {
    const map: Record<string, ReturnType<typeof summarizeBay>> = {};
    for (const [name, rows] of groups) {
      map[name] = summarizeBay(rows);
    }
    return map;
  }, [groups]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Setting Comparison</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Side-by-side comparison of relay setting "as-installed" (terpasang)
              vs "as-approved" (tap), grouped by function block. Switch fungsi dari tab di bawah.
            </p>
          </div>
          <select
            value={bay.bay.id}
            onChange={(e) => setBay(e.target.value)}
            className="bg-white text-sm px-3 py-1.5 rounded border border-slate-300 focus:border-brand-accent focus:outline-none"
          >
            {bays.map((b) => (
              <option key={b.bay.id} value={b.bay.id}>
                {b.bay.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            label="Bay"
            value={bay.bay.name}
            sub={`${bay.bay.voltage_kv} kV | ${bay.bay.substation}`}
            icon={<FileWarning className="w-4 h-4 text-slate-400" />}
          />
          <SummaryCard
            label="Match"
            value={String(summary.match)}
            sub="Identical"
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            tone="emerald"
          />
          <SummaryCard
            label="Cosmetic"
            value={String(summary.cosmetic)}
            sub="Within 1% tolerance"
            icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}
            tone="amber"
          />
          <SummaryCard
            label="Functional"
            value={String(summary.functional)}
            sub="Needs engineering review"
            icon={<AlertOctagon className="w-4 h-4 text-red-600" />}
            tone="red"
          />
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Relay: <span className="font-mono">{bay.relay.make} {bay.relay.model}</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex flex-wrap border-b border-slate-200 bg-slate-50">
          <FnTab
            label="All"
            active={activeFn === ALL_TAB}
            onClick={() => setActiveFn(ALL_TAB)}
            count={bay.parameters.length}
          />
          {fnNames.map((name) => {
            const s = tabSummaries[name];
            const drift = s.functional;
            return (
              <FnTab
                key={name}
                label={name}
                active={activeFn === name}
                onClick={() => setActiveFn(name)}
                count={s.match + s.cosmetic + s.functional}
                badge={drift > 0 ? drift : undefined}
              />
            );
          })}
        </div>
        {activeFn !== ALL_TAB && tabSummaries[activeFn] && (
          <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-3 text-[11px] text-slate-600">
            <span className="font-mono">{activeFn}</span>
            <MiniBadge label="match" count={tabSummaries[activeFn].match} tone="emerald" />
            <MiniBadge label="cosmetic" count={tabSummaries[activeFn].cosmetic} tone="amber" />
            <MiniBadge label="functional" count={tabSummaries[activeFn].functional} tone="red" />
          </div>
        )}
      </div>

      {visibleGroups.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 text-center text-sm text-slate-500">
          Tidak ada parameter untuk fungsi <span className="font-mono">{activeFn}</span> pada bay ini.
        </div>
      )}

      {visibleGroups.map(([fnName, rows]) => (
        <ParameterTable key={fnName} fnName={fnName} rows={rows} />
      ))}
    </div>
  );
}

function FnTab({
  label,
  active,
  onClick,
  count,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium border-b-2 flex items-center gap-2 ${
        active
          ? "border-brand-accent-dark text-brand-accent-dark bg-white"
          : "border-transparent text-slate-600 hover:text-slate-900"
      }`}
    >
      <span>{label}</span>
      <span className="text-[10px] text-slate-400">{count}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className="text-[10px] px-1.5 rounded-full border border-red-200 bg-red-50 text-red-700 font-semibold">
          {badge}
        </span>
      )}
    </button>
  );
}

function MiniBadge({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "emerald" | "amber" | "red";
}) {
  const cls = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
  }[tone];
  return (
    <span className={`inline-flex text-[10px] border rounded px-1.5 py-0.5 ${cls}`}>
      {label}: {count}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone?: "emerald" | "amber" | "red";
}) {
  const toneClass = {
    emerald: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200",
    red: "bg-red-50 border-red-200",
  }[tone ?? "emerald"];
  const baseClass = tone ? toneClass : "bg-slate-50 border-slate-200";
  return (
    <div className={`border rounded-md p-3 ${baseClass}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-1 text-xl font-semibold text-slate-900 truncate">{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5 truncate">{sub}</div>
    </div>
  );
}
