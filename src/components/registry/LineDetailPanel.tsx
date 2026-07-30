import { useMemo } from "react";
import {
  Calculator,
  GitCompareArrows,
  Route,
  Network,
  CircuitBoard,
} from "lucide-react";
import type { NetworkCase, NetworkLine } from "../../domain/seed-network-registry";
import type { UnifiedNetwork, LifecycleStatus, ProtectionFunctionId } from "../../domain/unified";
import type { RelationStatus, FunctionPromotion } from "../../domain/relation-status";
import { findComparisonBayIdForLine } from "../../domain/seed-comparison";
import { useProsetStore } from "../../store/useProsetStore";
import { ctRatioText, getEffectiveCtVt, vtRatioText } from "../../domain/instrument-transformers";

const statusBadge: Record<LifecycleStatus, string> = {
  imported: "bg-slate-50 text-slate-600 border-slate-200",
  reviewed: "bg-blue-50 text-blue-700 border-blue-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  issued: "bg-violet-50 text-violet-700 border-violet-200",
  superseded: "bg-orange-50 text-orange-700 border-orange-200",
};

type Props = {
  line: NetworkLine;
  activeCase: NetworkCase;
  networkGraph?: UnifiedNetwork;
  status?: RelationStatus;
};

const PROTECTION_ORDER: ProtectionFunctionId[] = [
  "DIST",
  "LCD",
  "OCR",
  "GFR",
  "AR",
  "SYNC",
  "DEF",
  "PSB",
  "CBF",
  "TELE",
];

export function LineDetailPanel({ line, activeCase, networkGraph, status }: Props) {
  const setTab = useProsetStore((s) => s.setTab);
  const selectLine = useProsetStore((s) => s.selectLine);
  const ctVtOverrides = useProsetStore((s) => s.ctVtOverrides);

  const fromNode = activeCase.nodes.find((n) => n.id === line.fromNodeId);
  const toNode = activeCase.nodes.find((n) => n.id === line.toNodeId);
  const relation = networkGraph?.lineRelations.find((r) => r.id === line.id);
  const fromBay = relation ? networkGraph?.bays.find((b) => b.id === relation.fromBayId) : undefined;
  const toBay = relation ? networkGraph?.bays.find((b) => b.id === relation.toBayId) : undefined;
  const fromIed = fromBay ? networkGraph?.relayIeds.find((i) => i.bayId === fromBay.id) : undefined;
  const toIed = toBay ? networkGraph?.relayIeds.find((i) => i.bayId === toBay.id) : undefined;
  const fromCtVt = getEffectiveCtVt(fromIed, ctVtOverrides);
  const toCtVt = getEffectiveCtVt(toIed, ctVtOverrides);

  const groupedPromotions = useMemo(() => {
    const map = new Map<ProtectionFunctionId, FunctionPromotion[]>();
    for (const p of status?.functionPromotions ?? []) {
      if (!map.has(p.function)) map.set(p.function, []);
      map.get(p.function)!.push(p);
    }
    return map;
  }, [status]);

  const compareBayId = findComparisonBayIdForLine(line.id);

  const open = (tab: "calculation" | "comparison" | "coverage") => {
    selectLine(line.id);
    setTab(tab);
  };

  return (
    <section className="bg-white border-2 border-blue-300 rounded-lg overflow-hidden shadow-sm">
      <div className="border-b border-blue-200 px-4 py-3 bg-blue-50 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <CircuitBoard className="w-5 h-5 text-blue-700" />
          <div>
            <div className="text-sm font-semibold text-blue-900">
              Line Detail: {fromNode?.shortCode} - {toNode?.shortCode} {line.circuit}
            </div>
            <div className="text-[11px] text-blue-700">
              {activeCase.title} | {line.relayMain || "no relay info"} | Xline {line.lineXOhm?.toFixed(3) ?? "?"} ohm
              {line.physicalLengthKm ? ` | ${line.physicalLengthKm} km` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${statusBadge[status.rollup]}`}>
              {status.rollup}
            </span>
          )}
          <ActionButton label="Calculate" icon={<Calculator className="w-3.5 h-3.5" />} onClick={() => open("calculation")} />
          <ActionButton
            label="Compare"
            icon={<GitCompareArrows className="w-3.5 h-3.5" />}
            onClick={() => open("comparison")}
            disabled={!compareBayId}
          />
          <ActionButton label="Coverage" icon={<Route className="w-3.5 h-3.5" />} onClick={() => open("coverage")} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
        {/* Topology section */}
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Network className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Topology</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <EndCard
              label={`${fromNode?.shortCode ?? "?"} side`}
              station={fromNode?.name ?? line.fromNodeId}
              bay={fromBay?.rawName ?? line.fromBay}
              ied={fromIed ? `${fromIed.make} ${fromIed.model}` : undefined}
              ct={ctRatioText(fromCtVt.ct, fromIed?.ctRatio)}
              vt={vtRatioText(fromCtVt.vt, fromIed?.vtRatio)}
              tap={undefined}
            />
            <EndCard
              label={`${toNode?.shortCode ?? "?"} side`}
              station={toNode?.name ?? line.toNodeId}
              bay={toBay?.rawName ?? line.toBay}
              ied={toIed ? `${toIed.make} ${toIed.model}` : undefined}
              ct={ctRatioText(toCtVt.ct, toIed?.ctRatio)}
              vt={vtRatioText(toCtVt.vt, toIed?.vtRatio)}
              tap={undefined}
            />
          </div>
          <div className="mt-3 text-[11px] text-slate-500">
            {line.notes || "No engineering notes for this relation."}
          </div>
        </div>

        {/* Sources section */}
        <div className="px-4 py-4">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600 mb-3">Data Sources</h3>
          {status ? (
            <div className="space-y-1.5">
              {status.perSource.map((entry, idx) => (
                <div
                  key={`${entry.source}-${idx}`}
                  className="flex items-center justify-between text-[11px] border border-slate-100 bg-slate-50 rounded px-2 py-1"
                >
                  <span className="font-mono text-slate-700">{entry.source}</span>
                  <span className={`px-1.5 py-0.5 rounded border ${statusBadge[entry.status]}`}>
                    {entry.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500">No source data.</div>
          )}
        </div>
      </div>

      {/* Per-function panels */}
      <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600 mb-2">Protection Functions</h3>
        {groupedPromotions.size === 0 ? (
          <div className="text-xs text-slate-500">
            Belum ada import-backed setting per fungsi. Approve candidate di Inbox untuk mengisi.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {PROTECTION_ORDER.filter((fn) => groupedPromotions.has(fn)).map((fn) => {
              const promos = groupedPromotions.get(fn)!;
              const top = pickHighest(promos);
              return (
                <div key={fn} className="border border-slate-200 bg-white rounded-md p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-800">{fn}</span>
                    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusBadge[top.status]}`}>
                      {top.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">{top.sourceRef}</div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[10px] text-slate-700">
                    {Object.entries(top.values)
                      .filter(([, v]) => v !== null && v !== "" && v !== undefined)
                      .slice(0, 6)
                      .map(([k, v]) => (
                        <div key={k} className="truncate" title={`${k}: ${v}`}>
                          <span className="text-slate-400">{k}:</span> {String(v)}
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function pickHighest(items: FunctionPromotion[]): FunctionPromotion {
  const rank: Record<LifecycleStatus, number> = {
    imported: 0,
    rejected: 0,
    superseded: 0,
    reviewed: 1,
    approved: 2,
    issued: 3,
  };
  return items.reduce((acc, it) => (rank[it.status] > rank[acc.status] ? it : acc), items[0]);
}

function EndCard({
  label,
  station,
  bay,
  ied,
  ct,
  vt,
  tap,
}: {
  label: string;
  station: string;
  bay: string;
  ied?: string;
  ct?: string;
  vt?: string;
  tap?: string;
}) {
  return (
    <div className="border border-slate-200 rounded-md p-2.5 bg-slate-50">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-0.5 truncate">{station}</div>
      <div className="text-[11px] text-slate-700 mt-1 truncate" title={bay}>{bay}</div>
      <div className="mt-2 space-y-0.5 text-[10px] text-slate-600">
        <div>
          <span className="text-slate-400">IED:</span> {ied || "unknown"}
        </div>
        <div>
          <span className="text-slate-400">CT:</span> {ct || "?"}
          {" | "}
          <span className="text-slate-400">VT:</span> {vt || "?"}
        </div>
        {tap && (
          <div className="truncate" title={tap}>
            <span className="text-slate-400">TAP:</span> {tap}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
        disabled
          ? "border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed"
          : "border-blue-300 bg-white text-blue-700 hover:bg-blue-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
