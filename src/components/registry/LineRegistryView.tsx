import { useMemo } from "react";
import { Calculator, GitCompareArrows, Route } from "lucide-react";
import { NETWORK_CASES, RegistryConfidence } from "../../domain/seed-network-registry";
import {
  getEffectiveMiniNmm,
  INVENTORY_MASTER_CASE_ID,
  mergeMasterRelationsIntoCase,
  networkLinesFromMiniNmm,
  networkNodesFromMiniNmm,
  relayAssetsFromMiniNmm,
} from "../../domain/mini-nmm";
import {
  LCD_DIST_REGISTRY,
  promoteMatchedLcdDistCandidates,
} from "../../domain/lcd-dist-import";
import { findComparisonBayIdForLine } from "../../domain/seed-comparison";
import { buildRelationStatuses } from "../../domain/relation-status";
import { buildUnifiedNetwork, LifecycleStatus } from "../../domain/unified";
import { useProsetStore } from "../../store/useProsetStore";
import { LineDetailPanel } from "./LineDetailPanel";
import { ctRatioText, getEffectiveCtVt, vtRatioText } from "../../domain/instrument-transformers";

const confidenceClass: Record<RegistryConfidence, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-orange-50 text-orange-700 border-orange-200",
  missing: "bg-red-50 text-red-700 border-red-200",
};

const statusClass = {
  imported: "bg-slate-50 text-slate-600 border-slate-200",
  reviewed: "bg-blue-50 text-blue-700 border-blue-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  issued: "bg-violet-50 text-violet-700 border-violet-200",
};

const promotionClass: Record<LifecycleStatus, string> = {
  imported: "bg-slate-50 text-slate-500 border-slate-200",
  reviewed: "bg-blue-50 text-blue-700 border-blue-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  issued: "bg-violet-50 text-violet-700 border-violet-200",
};

// Same function may have multiple promotions (LCD+DIST + OCR can both touch
// LCD if a record has overlapping data). Keep highest-status per function.
function dedupePromotions<
  T extends { function: string; status: LifecycleStatus }
>(items: T[]): T[] {
  const rank: Record<LifecycleStatus, number> = {
    imported: 0,
    rejected: 0,
    reviewed: 1,
    approved: 2,
    issued: 3,
  };
  const out = new Map<string, T>();
  for (const p of items) {
    const existing = out.get(p.function);
    if (!existing || rank[p.status] > rank[existing.status]) {
      out.set(p.function, p);
    }
  }
  return Array.from(out.values()).sort((a, b) => a.function.localeCompare(b.function));
}

export function LineRegistryView() {
  const activeCaseId = useProsetStore((s) => s.activeNetworkCaseId);
  const activeLineId = useProsetStore((s) => s.activeNetworkLineId);
  const setTab = useProsetStore((s) => s.setTab);
  const selectLine = useProsetStore((s) => s.selectLine);
  const decisions = useProsetStore((s) => s.candidateDecisions);
  const ctVtOverrides = useProsetStore((s) => s.ctVtOverrides);
  const activeCase =
    NETWORK_CASES.find((item) => item.id === activeCaseId) ?? NETWORK_CASES[0];
  const inventoryCase =
    NETWORK_CASES.find((item) => item.id === INVENTORY_MASTER_CASE_ID) ?? activeCase;
  const miniNmmOverride = useProsetStore((s) => s.miniNmmOverrides[activeCase.id]);
  const masterMiniNmmOverride = useProsetStore((s) => s.miniNmmOverrides[INVENTORY_MASTER_CASE_ID]);
  const fallbackMiniNmm = useMemo(() => buildUnifiedNetwork(activeCase), [activeCase]);
  const masterFallbackMiniNmm = useMemo(() => buildUnifiedNetwork(inventoryCase), [inventoryCase]);
  const masterMiniNmm = getEffectiveMiniNmm(
    INVENTORY_MASTER_CASE_ID,
    masterMiniNmmOverride,
    masterFallbackMiniNmm
  );
  const baseMiniNmm = getEffectiveMiniNmm(activeCase.id, miniNmmOverride, fallbackMiniNmm);
  const effectiveMiniNmm = mergeMasterRelationsIntoCase(baseMiniNmm, masterMiniNmm);
  const localRelationCount = baseMiniNmm?.lineRelations.length ?? 0;
  const bridgedRelationCount =
    effectiveMiniNmm?.lineRelations.filter((relation) => relation.sourceIds.includes("master-inventory")).length ?? 0;
  const nodes = useMemo(
    () => (effectiveMiniNmm ? networkNodesFromMiniNmm(effectiveMiniNmm) : activeCase.nodes),
    [activeCase.nodes, effectiveMiniNmm]
  );
  const lines = useMemo(
    () => (effectiveMiniNmm ? networkLinesFromMiniNmm(effectiveMiniNmm) : activeCase.lines),
    [activeCase.lines, effectiveMiniNmm]
  );
  const relays = useMemo(
    () => (effectiveMiniNmm ? relayAssetsFromMiniNmm(effectiveMiniNmm) : activeCase.relays),
    [activeCase.relays, effectiveMiniNmm]
  );

  // Reuse promoted import data for "import-backed" badge.
  const promotedLines = promoteMatchedLcdDistCandidates(
    LCD_DIST_REGISTRY.records,
    nodes,
    lines
  );
  const promotedByLine = new Map(promotedLines.map((line) => [line.matchedLineId, line]));
  const pdfTapPromotionsAll = useProsetStore((s) => s.pdfTapPromotions);
  const pdfTapPromotionsForCase = useMemo(
    () => pdfTapPromotionsAll.filter((p) => p.caseId === activeCase.id),
    [pdfTapPromotionsAll, activeCase.id]
  );
  const calculationSnapshotsAll = useProsetStore((s) => s.calculationSnapshots);
  const calculationSnapshotsForCase = useMemo(
    () => calculationSnapshotsAll.filter((snapshot) => snapshot.caseId === activeCase.id),
    [calculationSnapshotsAll, activeCase.id]
  );
  const relationStatuses = useMemo(
    () => buildRelationStatuses(nodes, lines, decisions, pdfTapPromotionsForCase, calculationSnapshotsForCase),
    [nodes, lines, decisions, pdfTapPromotionsForCase, calculationSnapshotsForCase]
  );

  const openCalculation = (lineId: string) => {
    selectLine(lineId);
    setTab("calculation");
  };
  const openCoverage = (lineId: string) => {
    selectLine(lineId);
    setTab("coverage");
  };
  const openComparison = (lineId: string) => {
    const comparisonBayId = findComparisonBayIdForLine(lineId);
    if (!comparisonBayId) return;
    selectLine(lineId);
    setTab("comparison");
  };

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Line Registry</h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
              Per-LineRelation index dengan status lifecycle. Drill ke calculation, comparison, dan coverage analyzer.
            </p>
          </div>
          <div className="text-[10px] text-slate-500 self-end">
            {lines.length} relation{lines.length === 1 ? "" : "s"} | {relays.length} IED
          </div>
        </div>
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-600">
            Active registry scope: <span className="font-semibold text-slate-800">{localRelationCount}</span> local relation
            {localRelationCount === 1 ? "" : "s"} plus <span className="font-semibold text-blue-700">{bridgedRelationCount}</span> bridged relation
            {bridgedRelationCount === 1 ? "" : "s"} from ULTG Inventory master.
          </div>
          <span className="text-[10px] px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700">
            master-aware view
          </span>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2 bg-slate-50 flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Line Relations</h3>
          <span className="text-[10px] text-slate-500">extracted from registry, PDF, dan setting files</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Relation</th>
                <th className="text-left px-4 py-2 font-medium">Bay</th>
                <th className="text-left px-4 py-2 font-medium">CT/PT</th>
                <th className="text-left px-4 py-2 font-medium">Protection</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Data</th>
                <th className="text-left px-4 py-2 font-medium">Analysis</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    Belum ada relasi line yang diekstrak untuk case ini.
                  </td>
                </tr>
              )}
              {lines.map((line) => {
                const from = nodes.find((n) => n.id === line.fromNodeId);
                const to = nodes.find((n) => n.id === line.toNodeId);
                const promoted = promotedByLine.get(line.id);
                const compareBay = findComparisonBayIdForLine(line.id);
                const relationStatus = relationStatuses.get(line.id);
                const isActive = line.id === activeLineId;
                const relation = effectiveMiniNmm?.lineRelations.find((item) => item.id === line.id);
                const fromIed = relation
                  ? effectiveMiniNmm?.relayIeds.find((ied) => ied.bayId === relation.fromBayId)
                  : undefined;
                const toIed = relation
                  ? effectiveMiniNmm?.relayIeds.find((ied) => ied.bayId === relation.toBayId)
                  : undefined;
                const fromCtVt = getEffectiveCtVt(fromIed, ctVtOverrides);
                const toCtVt = getEffectiveCtVt(toIed, ctVtOverrides);
                const ctDisplay =
                  fromCtVt.ct && toCtVt.ct && fromCtVt.ct.ratioText !== toCtVt.ct.ratioText
                    ? `${fromCtVt.ct.ratioText} / ${toCtVt.ct.ratioText}`
                    : ctRatioText(fromCtVt.ct ?? toCtVt.ct, promoted?.ctRatio || line.ctRatio || undefined);
                const vtDisplay =
                  fromCtVt.vt && toCtVt.vt && fromCtVt.vt.ratioText !== toCtVt.vt.ratioText
                    ? `${fromCtVt.vt.ratioText} / ${toCtVt.vt.ratioText}`
                    : vtRatioText(fromCtVt.vt ?? toCtVt.vt, promoted?.vtRatio || line.vtRatio || undefined);
                return (
                  <tr
                    key={line.id}
                    onClick={() => selectLine(line.id)}
                    className={`border-b border-slate-100 last:border-b-0 cursor-pointer transition-colors ${
                      isActive ? "bg-blue-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isActive && <span className="w-1.5 h-4 rounded-sm bg-blue-500" aria-hidden />}
                        <div className="font-semibold text-slate-900">{from?.shortCode} - {to?.shortCode} {line.circuit}</div>
                        {promoted && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">import-backed</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Xline {(promoted?.lineImpedanceOhm ?? line.lineXOhm)?.toFixed(3) ?? "?"} ohm
                        {line.physicalLengthKm ? ` | ${line.physicalLengthKm} km` : ""}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {line.sourceIds.map((sourceId) => (
                          <span
                            key={sourceId}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-500"
                            title={line.notes}
                          >
                            {formatSourceId(sourceId)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-600">
                      <div>{line.fromBay}</div>
                      <div className="text-slate-400 mt-1">{line.toBay}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-600">
                      <div>{ctDisplay === "-" ? "CT unknown" : ctDisplay}</div>
                      <div className="text-slate-400 mt-1">{vtDisplay === "-" ? "VT unknown" : vtDisplay}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {line.protectionFunctions.map((fn) => (
                          <span key={fn} className="text-[10px] px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">{fn}</span>
                        ))}
                      </div>
                      <div className="text-xs text-slate-500 mt-2">{line.relayMain}</div>
                      {promoted && (
                        <div className="font-mono text-[10px] text-slate-400 mt-1">
                          Z1 {formatMaybe(promoted.zones.z1)} | Z2 {formatMaybe(promoted.zones.z2)} | Z3 {formatMaybe(promoted.zones.z3)}
                        </div>
                      )}
                      {relationStatus && relationStatus.functionPromotions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {dedupePromotions(relationStatus.functionPromotions).map((p) => (
                            <span
                              key={`${p.function}-${p.candidateId}`}
                              className={`text-[10px] px-1.5 py-0.5 rounded border ${promotionClass[p.status]}`}
                              title={`${p.sourceRef} | ${p.status}${p.decidedAt ? ` | ${p.decidedAt.slice(0, 10)}` : ""}`}
                            >
                              {p.function}: {p.status}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusBadge status={relationStatus?.rollup ?? "imported"} />
                      <div className="text-[10px] text-slate-400 mt-1">
                        {relationStatus?.perSource.length ?? 0} source
                        {(relationStatus?.perSource.length ?? 0) === 1 ? "" : "s"}
                      </div>
                      {relationStatus && (
                        <div className="flex flex-wrap gap-1 mt-1.5 max-w-44">
                          {relationStatus.perSource.map((source) => (
                            <span
                              key={`${source.source}:${source.candidateId ?? "seed"}`}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-500"
                            >
                              {source.source}: {source.status}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <ConfidenceBadge confidence={line.confidence} />
                      <div className="text-xs text-slate-500 mt-2">{line.completeness}% complete</div>
                      {promoted && (
                        <div className="text-[10px] text-blue-700 mt-1">row {promoted.sourceRow} promoted</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-1.5 min-w-28">
                        <ActionButton label="Calculate" icon={<Calculator className="w-3.5 h-3.5" />} onClick={() => openCalculation(line.id)} />
                        <ActionButton label="Coverage" icon={<Route className="w-3.5 h-3.5" />} onClick={() => openCoverage(line.id)} />
                        <ActionButton label="Compare" icon={<GitCompareArrows className="w-3.5 h-3.5" />} onClick={() => openComparison(line.id)} disabled={!compareBay} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {(() => {
        const activeLine = lines.find((l) => l.id === activeLineId);
        if (!activeLine) {
          return (
            <section className="bg-white border border-dashed border-slate-300 rounded-lg p-6 text-center text-sm text-slate-500">
              Pilih line dari tabel di atas untuk melihat detail topology, sumber data, dan setting per fungsi proteksi.
            </section>
          );
        }
        return (
          <LineDetailPanel
            line={activeLine}
            activeCase={activeCase}
            miniNmm={effectiveMiniNmm ?? undefined}
            status={relationStatuses.get(activeLine.id)}
          />
        );
      })()}

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2 bg-slate-50 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Promoted LCD+DIST Settings</h3>
            <div className="text-[10px] text-slate-500 mt-0.5">Hasil import yang sudah cocok ke line relation, siap dipakai sebagai prefill calculation/comparison.</div>
          </div>
          <span className="text-[10px] px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700">{promotedLines.length} promoted</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Matched Line</th>
                <th className="text-left px-4 py-2 font-medium">Relay Side</th>
                <th className="text-left px-4 py-2 font-medium">CT/PT</th>
                <th className="text-left px-4 py-2 font-medium">Zones</th>
                <th className="text-left px-4 py-2 font-medium">TAP Source</th>
              </tr>
            </thead>
            <tbody>
              {promotedLines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">Belum ada matched candidate yang dipromosikan.</td>
                </tr>
              )}
              {promotedLines.map((line) => (
                <tr key={line.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-2 align-top">
                    <div className="font-mono text-xs text-slate-700">{line.matchedLineId}</div>
                    <div className="text-[10px] text-slate-400">from LCD+DIST row {line.sourceRow}</div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="font-semibold text-slate-900">{line.substation}</div>
                    <div className="text-xs text-slate-600">{line.bay} {line.circuit}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{line.relayLabel}</div>
                  </td>
                  <td className="px-4 py-2 align-top text-xs text-slate-600">{line.ctRatio || "CT ?"} | {line.vtRatio || "VT ?"}</td>
                  <td className="px-4 py-2 align-top font-mono text-xs text-slate-700">
                    X {formatMaybe(line.lineImpedanceOhm)} | Z1 {formatMaybe(line.zones.z1)} | Z2 {formatMaybe(line.zones.z2)} | Z3 {formatMaybe(line.zones.z3)}
                    <div className="text-[10px] text-slate-400 mt-0.5">t1 {formatMaybe(line.zones.t1)} | t2 {formatMaybe(line.zones.t2)} | t3 {formatMaybe(line.zones.t3)}</div>
                  </td>
                  <td className="px-4 py-2 align-top text-xs text-slate-600 max-w-72">
                    <div className="truncate">{line.tapDocument || "No TAP document"}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{line.tapDate || "date unknown"} | {line.confidence}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2 bg-slate-50">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Relay Asset Registry</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">GI/GIS</th>
                <th className="text-left px-4 py-2 font-medium">Bay</th>
                <th className="text-left px-4 py-2 font-medium">Relay</th>
                <th className="text-left px-4 py-2 font-medium">CT/PT</th>
                <th className="text-left px-4 py-2 font-medium">Source</th>
                <th className="text-left px-4 py-2 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {relays.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                    Relay asset belum dinormalisasi untuk case inventory ini.
                  </td>
                </tr>
              )}
              {relays.map((relay) => {
                const node = nodes.find((n) => n.id === relay.nodeId);
                return (
                  <tr key={relay.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-2 font-semibold text-slate-900">{node?.shortCode}</td>
                    <td className="px-4 py-2 text-slate-700">{relay.bay} {relay.circuit}</td>
                    <td className="px-4 py-2">
                      <div className="font-mono text-xs text-slate-700">{relay.make} {relay.model}</div>
                      <div className="text-[10px] text-slate-400">{relay.serial}</div>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">{relay.ctRatio} | {relay.vtRatio}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      <div>{relay.tapDocument}</div>
                      {relay.actualSource && (
                        <div className="text-slate-400 mt-0.5">actual: {relay.actualSource}</div>
                      )}
                    </td>
                    <td className="px-4 py-2"><ConfidenceBadge confidence={relay.confidence} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatMaybe(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : value.toFixed(3);
}

function formatSourceId(sourceId: string) {
  return sourceId
    .replace(/^src_/, "")
    .replace(/_/g, " ")
    .replace(/-/g, " ");
}

function ActionButton({ label, icon, onClick, disabled }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
        disabled
          ? "border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed"
          : "border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ConfidenceBadge({ confidence }: { confidence: RegistryConfidence }) {
  return (
    <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded border uppercase tracking-wider ${confidenceClass[confidence]}`}>
      {confidence}
    </span>
  );
}

function StatusBadge({ status }: { status: keyof typeof statusClass }) {
  return (
    <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded border uppercase tracking-wider ${statusClass[status]}`}>
      {status}
    </span>
  );
}
