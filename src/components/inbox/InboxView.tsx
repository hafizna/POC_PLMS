import { useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Inbox,
  Plus,
  Sparkles,
  Undo2,
  XCircle,
} from "lucide-react";
import { NETWORK_CASES } from "../../domain/seed-network-registry";
import {
  LCD_DIST_REGISTRY,
  LcdDistLineCandidate,
  mapLcdDistCandidatesToLines,
} from "../../domain/lcd-dist-import";
import {
  OCR_REGISTRY,
  OcrLineCandidate,
  OcrRecord,
  mapOcrCandidatesToLines,
  summarizeOcrMismatch,
} from "../../domain/ocr-import";
import type { Bay, Busbar, LineRelation, LifecycleStatus, ProtectionFunctionId, Terminal, UnifiedSubstation } from "../../domain/unified";
import { buildUnifiedNetwork } from "../../domain/unified";
import { buildCaseScopePredicate } from "../../domain/matcher";
import {
  getEffectiveMiniNmm,
  INVENTORY_MASTER_CASE_ID,
  mergeMasterRelationsIntoCase,
  networkLinesFromMiniNmm,
  networkNodesFromMiniNmm,
} from "../../domain/mini-nmm";
import { looseTokenMatch, normalizeStationName } from "../../domain/normalization";
import { useProsetStore } from "../../store/useProsetStore";

const statusClass: Record<LifecycleStatus, string> = {
  imported: "bg-slate-50 text-slate-600 border-slate-200",
  reviewed: "bg-blue-50 text-blue-700 border-blue-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  issued: "bg-violet-50 text-violet-700 border-violet-200",
};

type CandidateRow = {
  candidateId: string;
  source: "LCD+DIST" | "OCR/GFR";
  summary: string;
  detail: string;
  matchStatus: string;
  matchedLineId?: string;
  reason: string;
  defaultStatus: LifecycleStatus;
  currentStatus: LifecycleStatus;
  decision?: { note?: string; decidedAt?: string };
  // Hints from matcher for quick-add expansion actions
  localStationHint?: string;
  remoteStationHint?: string;
  // Raw record fields needed when promoting (circuit + bay name preserved
  // so the new bay/relation reflects the source data faithfully).
  sourceCircuit: string;
  sourceLocalBayName: string;
  sourceRowLabel: string;
};

export function InboxView() {
  const [showDecided, setShowDecided] = useState(false);
  const [showExpansion, setShowExpansion] = useState(false);
  const activeCaseId = useProsetStore((s) => s.activeNetworkCaseId);
  const setTab = useProsetStore((s) => s.setTab);
  const decisions = useProsetStore((s) => s.candidateDecisions);
  const decideCandidate = useProsetStore((s) => s.decideCandidate);
  const clearCandidateDecision = useProsetStore((s) => s.clearCandidateDecision);
  const selectLine = useProsetStore((s) => s.selectLine);
  const addMiniNmmSubstation = useProsetStore((s) => s.addMiniNmmSubstation);
  const addMiniNmmBusbar = useProsetStore((s) => s.addMiniNmmBusbar);
  const addMiniNmmBay = useProsetStore((s) => s.addMiniNmmBay);
  const addMiniNmmTerminal = useProsetStore((s) => s.addMiniNmmTerminal);
  const addMiniNmmRelation = useProsetStore((s) => s.addMiniNmmRelation);
  const miniNmmOverride = useProsetStore((s) => s.miniNmmOverrides[activeCaseId]);
  const masterMiniNmmOverride = useProsetStore((s) => s.miniNmmOverrides[INVENTORY_MASTER_CASE_ID]);

  const activeCase =
    NETWORK_CASES.find((item) => item.id === activeCaseId) ?? NETWORK_CASES[0];
  const inventoryCase =
    NETWORK_CASES.find((item) => item.id === INVENTORY_MASTER_CASE_ID) ?? activeCase;
  const fallbackMiniNmm = useMemo(() => buildUnifiedNetwork(activeCase), [activeCase]);
  const masterFallbackMiniNmm = useMemo(() => buildUnifiedNetwork(inventoryCase), [inventoryCase]);
  const masterMiniNmm = useMemo(
    () =>
      getEffectiveMiniNmm(
        INVENTORY_MASTER_CASE_ID,
        masterMiniNmmOverride,
        masterFallbackMiniNmm
      ),
    [masterMiniNmmOverride, masterFallbackMiniNmm]
  );
  const effectiveMiniNmm = useMemo(
    () =>
      mergeMasterRelationsIntoCase(
        getEffectiveMiniNmm(activeCase.id, miniNmmOverride, fallbackMiniNmm),
        masterMiniNmm
      ),
    [activeCase.id, miniNmmOverride, fallbackMiniNmm, masterMiniNmm]
  );
  const effectiveNodes = useMemo(
    () => (effectiveMiniNmm ? networkNodesFromMiniNmm(effectiveMiniNmm) : activeCase.nodes),
    [activeCase.nodes, effectiveMiniNmm]
  );
  const effectiveLines = useMemo(
    () => (effectiveMiniNmm ? networkLinesFromMiniNmm(effectiveMiniNmm) : activeCase.lines),
    [activeCase.lines, effectiveMiniNmm]
  );

  const lcdCandidates = useMemo(
    () => mapLcdDistCandidatesToLines(LCD_DIST_REGISTRY.records, effectiveNodes, effectiveLines),
    [effectiveNodes, effectiveLines]
  );
  const ocrCandidates = useMemo(
    () => mapOcrCandidatesToLines(OCR_REGISTRY.records, effectiveNodes, effectiveLines),
    [effectiveNodes, effectiveLines]
  );

  const inScope = useMemo(() => buildCaseScopePredicate(effectiveNodes), [effectiveNodes]);

  // Lines available for manual mapping picker. Format: id + label like
  // "DKS - DM #1" so engineer can pick visually.
  const availableLines = useMemo(
    () =>
      effectiveLines.map((line) => {
        const from = effectiveNodes.find((n) => n.id === line.fromNodeId);
        const to = effectiveNodes.find((n) => n.id === line.toNodeId);
        return {
          id: line.id,
          label: `${from?.shortCode ?? "?"} - ${to?.shortCode ?? "?"} ${line.circuit}`,
        };
      }),
    [effectiveNodes, effectiveLines]
  );
  // STRICT scope: only records where local substation appears in mini-NMM
  // (i.e. matchStatus is matched | ambiguous | needs_relation | needs_substation).
  // Records with `unmatched` status are silently dropped — they're not about
  // any line in our coverage neighborhood.
  const lcdInScope = lcdCandidates.filter(
    (c) =>
      c.matchStatus !== "unmatched" &&
      inScope({ substation: c.substation, bay: c.bay })
  );
  const ocrInScope = ocrCandidates.filter((c) => {
    if (c.matchStatus === "unmatched") return false;
    const record = OCR_REGISTRY.records.find((r) => r.id === c.recordId);
    return record && inScope({ substation: record.substation, bay: record.bay });
  });

  const driftRecords = useMemo(
    () =>
      OCR_REGISTRY.records
        .filter((record) => {
          const candidate = ocrCandidates.find((c) => c.recordId === record.id);
          return Boolean(candidate && candidate.matchStatus !== "unmatched");
        })
        .filter((record) => summarizeOcrMismatch(record).hasFunctionalRisk)
        .map((record) => {
          // Re-use the same OCR matcher result so drift rows know whether the
          // record has a LineRelation in the active case. Clickable drift =>
          // selectLine + Comparison tab; unmatched => guide to Mini-NMM Editor.
          const candidate = ocrCandidates.find((c) => c.recordId === record.id);
          return {
            record,
            mismatch: summarizeOcrMismatch(record),
            matchedLineId: candidate?.matchedLineId,
            matchStatus: candidate?.matchStatus ?? "needs_validation",
          };
        }),
    [ocrCandidates]
  );

  const allRows: CandidateRow[] = useMemo(() => {
    const rows: CandidateRow[] = [
      ...lcdInScope.map<CandidateRow>((c) => {
        const candidateId = `lcd:${c.recordId}`;
        const decision = decisions[candidateId];
        const defaultStatus = defaultLifecycle(c);
        return {
          candidateId,
          source: "LCD+DIST",
          summary: `${c.substation} - ${c.bay} ${c.circuit}`,
          detail: `${c.relayLabel} | row ${c.sourceRow} | matched: ${c.matchedLineId ?? "-"}`,
          matchStatus: c.matchStatus,
          matchedLineId: c.matchedLineId,
          reason: c.reason,
          defaultStatus,
          currentStatus: decision?.status ?? defaultStatus,
          decision,
          localStationHint: c.localStationHint,
          remoteStationHint: c.remoteStationHint,
          sourceCircuit: c.circuit,
          sourceLocalBayName: c.bay,
          sourceRowLabel: `LCD+DIST row ${c.sourceRow}`,
        };
      }),
      ...ocrInScope.map<CandidateRow>((c) => {
        const record = OCR_REGISTRY.records.find((r) => r.id === c.recordId)!;
        const candidateId = `ocr:${c.recordId}`;
        const decision = decisions[candidateId];
        const defaultStatus = defaultLifecycleOcr(c);
        return {
          candidateId,
          source: "OCR/GFR",
          summary: `${record.substation} - ${record.bay} ${record.circuit}`,
          detail: `${record.relay.make} ${record.relay.model} | row ${record.sourceRow} | matched: ${c.matchedLineId ?? "-"}`,
          matchStatus: c.matchStatus,
          matchedLineId: c.matchedLineId,
          reason: c.reason,
          defaultStatus,
          currentStatus: decision?.status ?? defaultStatus,
          decision,
          localStationHint: c.localStationHint,
          remoteStationHint: c.remoteStationHint,
          sourceCircuit: record.circuit,
          sourceLocalBayName: record.bay,
          sourceRowLabel: `OCR row ${record.sourceRow}`,
        };
      }),
    ];
    return rows;
  }, [lcdInScope, ocrInScope, decisions]);

  // Bucket assignment by matchStatus (4 priority sections + 1 expansion).
  const visibleFilter = (r: CandidateRow) => showDecided || r.currentStatus === "imported";
  const newImports = allRows.filter((r) => r.matchStatus === "matched" && visibleFilter(r));
  const ambiguous = allRows.filter(
    (r) => (r.matchStatus === "ambiguous" || r.matchStatus === "candidate") && visibleFilter(r)
  );
  const needsRelation = allRows.filter(
    (r) => r.matchStatus === "needs_relation" && visibleFilter(r)
  );
  const needsSubstation = allRows.filter(
    (r) => r.matchStatus === "needs_substation" && visibleFilter(r)
  );
  // Legacy needs_validation = LCD record with no distance values. This is
  // data completeness review, not mapping ambiguity.
  const needsValidationLegacy = allRows.filter(
    (r) => r.matchStatus === "needs_validation" && visibleFilter(r)
  );

  const counts = {
    drift: driftRecords.length,
    pendingMapping:
      newImports.filter((r) => r.currentStatus === "imported").length +
      ambiguous.filter((r) => r.currentStatus === "imported").length +
      needsValidationLegacy.filter((r) => r.currentStatus === "imported").length +
      needsRelation.filter((r) => r.currentStatus === "imported").length,
    expansion: needsSubstation.filter((r) => r.currentStatus === "imported").length,
    decided: allRows.filter((r) => r.currentStatus !== "imported").length,
  };

  const openLine = (matchedLineId: string | undefined) => {
    if (!matchedLineId) return;
    selectLine(matchedLineId);
    setTab("line-registry");
  };

  // ── Quick-add handlers for Coverage Expansion / Needs Relation ────────
  // Both create bay+relation; needs_substation also creates the missing
  // remote substation first. Confidence "low" + status "imported" so that
  // engineer knows these were auto-promoted from import data, not curated.

  const findSubByHint = (hint: string | undefined): UnifiedSubstation | undefined => {
    if (!hint || !effectiveMiniNmm) return undefined;
    return effectiveMiniNmm.substations.find((s) =>
      looseTokenMatch(s.normalizedName, hint)
    );
  };

  const titleCase = (s: string) =>
    s
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");

  const buildQuickRelation = (
    row: CandidateRow,
    fromSub: UnifiedSubstation,
    toSub: UnifiedSubstation
  ): { bays: Bay[]; relation: LineRelation } => {
    const c = row.sourceCircuit.replace(/[^\d]/g, "") || "1";
    const suffix = `${fromSub.id}_${toSub.id}_${c}_user`;
    const fromBay: Bay = {
      id: `bay_${suffix}_from`,
      substationId: fromSub.id,
      rawName: row.sourceLocalBayName, // preserves "PHT 150kV X#Y"
      normalizedName: normalizeStationName(toSub.name),
      remoteEndpointHint: normalizeStationName(toSub.name),
      circuit: c,
      kind: "line",
    };
    const toBay: Bay = {
      id: `bay_${suffix}_to`,
      substationId: toSub.id,
      rawName: `PHT ${toSub.voltageKv}kV ${fromSub.name.toUpperCase()}#${c}`,
      normalizedName: normalizeStationName(fromSub.name),
      remoteEndpointHint: normalizeStationName(fromSub.name),
      circuit: c,
      kind: "line",
    };
    const relation: LineRelation = {
      id: `line_${suffix}`,
      fromBayId: fromBay.id,
      toBayId: toBay.id,
      fromSubstationId: fromSub.id,
      toSubstationId: toSub.id,
      circuit: c,
      voltageKv: fromSub.voltageKv,
      protectionFunctionIds: inferProtectionFunctions(row),
      sourceIds: ["inbox-quick-add", row.sourceRowLabel],
      confidence: "low",
      status: "imported",
    };
    return { bays: [fromBay, toBay], relation };
  };

  const quickAddRelation = (row: CandidateRow) => {
    const fromSub = findSubByHint(row.localStationHint);
    const toSub = findSubByHint(row.remoteStationHint);
    if (!fromSub || !toSub) return;
    const { bays, relation } = buildQuickRelation(row, fromSub, toSub);
    const terminals = buildQuickTerminals(activeCase.id, fromSub, toSub, bays);
    for (const busbar of terminals.busbarsToAdd) addMiniNmmBusbar(activeCase.id, busbar);
    for (const bay of bays) addMiniNmmBay(activeCase.id, bay);
    for (const terminal of terminals.terminalsToAdd) addMiniNmmTerminal(activeCase.id, terminal);
    addMiniNmmRelation(activeCase.id, relation);
    decideCandidate(
      row.candidateId,
      "reviewed",
      `Auto-promoted via Add Relation (${fromSub.shortCode} -> ${toSub.shortCode})`,
      relation.id
    );
  };

  const quickAddSubstationAndRelation = (row: CandidateRow) => {
    const fromSub = findSubByHint(row.localStationHint);
    if (!fromSub || !row.remoteStationHint) return;
    // Generate substation ID from remote station name. Reuse existing if
    // somehow already there (race-safe).
    const remoteName = titleCase(row.remoteStationHint);
    const remoteShort =
      row.remoteStationHint
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase())
        .join("")
        .slice(0, 4) || "X";
    const remoteId = `sub_${row.remoteStationHint.replace(/\s+/g, "_")}_user`;
    const newSub: UnifiedSubstation = {
      id: remoteId,
      name: remoteName,
      shortCode: remoteShort,
      voltageKv: fromSub.voltageKv,
      kind: "GIS",
      normalizedName: row.remoteStationHint,
    };
    addMiniNmmSubstation(activeCase.id, newSub);
    const { bays, relation } = buildQuickRelation(row, fromSub, newSub);
    const terminals = buildQuickTerminals(activeCase.id, fromSub, newSub, bays);
    for (const busbar of terminals.busbarsToAdd) addMiniNmmBusbar(activeCase.id, busbar);
    for (const bay of bays) addMiniNmmBay(activeCase.id, bay);
    for (const terminal of terminals.terminalsToAdd) addMiniNmmTerminal(activeCase.id, terminal);
    addMiniNmmRelation(activeCase.id, relation);
    decideCandidate(
      row.candidateId,
      "reviewed",
      `Auto-promoted via Add Substation+Relation (${fromSub.shortCode} -> ${remoteShort})`,
      relation.id
    );
  };

  const buildQuickTerminals = (
    caseId: string,
    fromSub: UnifiedSubstation,
    toSub: UnifiedSubstation,
    bays: Bay[]
  ): { busbarsToAdd: Busbar[]; terminalsToAdd: Terminal[] } => {
    const busbarsToAdd: Busbar[] = [];
    const terminalsToAdd: Terminal[] = [];
    const ensureBusbar = (sub: UnifiedSubstation) => {
      const existing = effectiveMiniNmm?.busbars.find((b) => b.substationId === sub.id);
      if (existing) return existing;
      const busbar: Busbar = {
        id: `bb_${sub.id}_quick_main_${caseId}`,
        substationId: sub.id,
        label: "Bus A",
        voltageKv: sub.voltageKv,
        kind: "main",
      };
      if (!busbarsToAdd.some((b) => b.id === busbar.id)) busbarsToAdd.push(busbar);
      return busbar;
    };
    const fromBusbar = ensureBusbar(fromSub);
    const toBusbar = ensureBusbar(toSub);
    const busbarByBayId = new Map([
      [bays[0]?.id, fromBusbar.id],
      [bays[1]?.id, toBusbar.id],
    ]);
    for (const bay of bays) {
      const busbarId = busbarByBayId.get(bay.id);
      if (!busbarId) continue;
      terminalsToAdd.push({
        id: `term_${bay.id}_quick_bus`,
        bayId: bay.id,
        busbarId,
        position: "bus-side",
      });
    }
    return { busbarsToAdd, terminalsToAdd };
  };

  return (
    <div className="space-y-4">
      {/* Status ringkas / dashboard tile */}
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-blue-50 border border-blue-200 p-2">
              <Inbox className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Status Ringkas</h2>
              <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
                Ringkasan apa yang butuh perhatian engineer. Urutan kerja: drift fungsional dulu, lalu validasi mapping ambigu, terakhir approve import baru.
              </p>
            </div>
          </div>
          <label className="text-[11px] text-slate-600 flex items-center gap-1.5 self-start">
            <input type="checkbox" checked={showDecided} onChange={(e) => setShowDecided(e.target.checked)} />
            tampilkan yang sudah diputuskan
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile
            label="Functional Drift"
            value={counts.drift}
            sub="TAP vs actual mismatch"
            icon={<AlertOctagon className="w-4 h-4 text-red-600" />}
            tone="red"
          />
          <Tile
            label="Pending Mapping"
            value={counts.pendingMapping}
            sub="Approve / pick / add relation"
            icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}
            tone="amber"
          />
          <Tile
            label="Coverage Expansion"
            value={counts.expansion}
            sub="Substation belum di mini-NMM"
            icon={<Plus className="w-4 h-4 text-blue-600" />}
            tone="blue"
          />
          <Tile
            label="Decided"
            value={counts.decided}
            sub="Reviewed / rejected"
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            tone="emerald"
          />
        </div>
        <p className="text-[11px] text-slate-500 mt-3 max-w-3xl">
          Default view tampilkan record yang local-side substation-nya ada di mini-NMM (matched, ambiguous, atau butuh relation). Records dengan remote substation di luar mini-NMM (e.g. line ke GI yang belum dimodelkan) di-hide; toggle "Show Coverage Expansion" untuk grow mini-NMM dari data import.
        </p>
      </section>

      {/* Section 1: Functional Drift */}
      <PrioritySection
        title="Functional Drift"
        subtitle="Setting aktual berbeda secara fungsional dari TAP. Review wajib sebelum next outage."
        count={driftRecords.length}
        tone="red"
        icon={<AlertOctagon className="w-4 h-4" />}
      >
        {driftRecords.length === 0 ? (
          <EmptyState message="Tidak ada functional drift di case ini." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Bay</th>
                  <th className="text-left px-4 py-2 font-medium">Relay</th>
                  <th className="text-left px-4 py-2 font-medium">TAP</th>
                  <th className="text-left px-4 py-2 font-medium">Actual</th>
                  <th className="text-left px-4 py-2 font-medium">Drift</th>
                  <th className="text-left px-4 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {driftRecords.map(({ record, mismatch, matchedLineId, matchStatus }) => {
                  const clickable = Boolean(matchedLineId);
                  const handleOpen = () => {
                    if (matchedLineId) {
                      selectLine(matchedLineId);
                      setTab("comparison");
                    }
                  };
                  return (
                    <tr
                      key={record.id}
                      onClick={clickable ? handleOpen : undefined}
                      className={`border-b border-slate-100 last:border-b-0 align-top transition-colors ${
                        clickable ? "cursor-pointer hover:bg-red-50/40" : ""
                      }`}
                      title={clickable ? "Klik untuk buka di Comparison" : undefined}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{record.substation}</div>
                        <div className="text-xs text-slate-600">{record.bay} {record.circuit}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">row {record.sourceRow}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        {record.relay.make} {record.relay.model}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        OC {fmt(record.tap.ocPickupA)} / TMS {fmt(record.tap.ocTms)}
                        <div className="text-[10px] text-slate-400 mt-0.5">GF {fmt(record.tap.gfPickupA)} / TMS {fmt(record.tap.gfTms)}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        OC {fmt(record.actual.ocPickupA)} / TMS {fmt(record.actual.ocTms)}
                        <div className="text-[10px] text-slate-400 mt-0.5">GF {fmt(record.actual.gfPickupA)} / TMS {fmt(record.actual.gfTms)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <MismatchBadge label="OC" status={mismatch.ocMismatch} />
                          <MismatchBadge label="GF" status={mismatch.gfMismatch} />
                          <MismatchBadge label="OC TMS" status={mismatch.tmsMismatch} />
                          <MismatchBadge label="GF TMS" status={mismatch.gfTmsMismatch} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {clickable ? (
                          <SmallButton
                            label="Buka Comparison"
                            icon={<ArrowRight className="w-3.5 h-3.5" />}
                            tone="red"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpen();
                            }}
                          />
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] text-amber-700">
                              <MatchBadge status={matchStatus} />
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTab("network-model");
                              }}
                              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-1 rounded border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            >
                              Map di Mini-NMM
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PrioritySection>

      {/* Section 2: Ambiguous Mapping */}
      <PrioritySection
        title="Ambiguous Mapping"
        subtitle="Multi candidate match. Pilih line target dari 'Map to line...'."
        count={ambiguous.length}
        tone="amber"
        icon={<AlertTriangle className="w-4 h-4" />}
      >
        {ambiguous.length === 0 ? (
          <EmptyState message="Tidak ada mapping ambigu." />
        ) : (
          <CandidateTable
            rows={ambiguous}
            availableLines={availableLines}
            onApprove={(id) => decideCandidate(id, "reviewed", "Mapping confirmed via inbox")}
            onReject={(id) => decideCandidate(id, "rejected", "Rejected; mapping needs fix")}
            onMapManually={(id, lineId) => {
              const label = availableLines.find((l) => l.id === lineId)?.label ?? lineId;
              decideCandidate(id, "reviewed", `Manually mapped to ${label}`, lineId);
            }}
            onReset={clearCandidateDecision}
            onOpenLine={openLine}
          />
        )}
      </PrioritySection>

      {/* Section 2b: Missing values, not mapping ambiguity */}
      <PrioritySection
        title="Missing Setting Values"
        subtitle="Mapping bukan masalah utama; row import belum punya nilai distance/setting yang cukup untuk divalidasi."
        count={needsValidationLegacy.length}
        tone="amber"
        icon={<AlertTriangle className="w-4 h-4" />}
      >
        {needsValidationLegacy.length === 0 ? (
          <EmptyState message="Tidak ada row import dengan nilai setting kosong." />
        ) : (
          <CandidateTable
            rows={needsValidationLegacy}
            availableLines={availableLines}
            onApprove={(id) => decideCandidate(id, "reviewed", "Reviewed; missing setting values acknowledged")}
            onReject={(id) => decideCandidate(id, "rejected", "Rejected; source row lacks required setting values")}
            onMapManually={(id, lineId) => {
              const label = availableLines.find((l) => l.id === lineId)?.label ?? lineId;
              decideCandidate(id, "reviewed", `Missing values acknowledged; manually mapped to ${label}`, lineId);
            }}
            onReset={clearCandidateDecision}
            onOpenLine={openLine}
          />
        )}
      </PrioritySection>

      {/* Section 3: Needs Relation */}
      <PrioritySection
        title="Needs Relation"
        subtitle="Both substations exist di mini-NMM tapi line relation belum ada. One-click [+ Add Relation]."
        count={needsRelation.length}
        tone="amber"
        icon={<AlertTriangle className="w-4 h-4" />}
      >
        {needsRelation.length === 0 ? (
          <EmptyState message="Tidak ada line yang tinggal butuh relation. Coverage neighborhood kelihatannya complete untuk records yang in-scope." />
        ) : (
          <ExpansionTable
            rows={needsRelation}
            availableLines={availableLines}
            actionLabel="+ Add Relation"
            onAction={quickAddRelation}
            onMapManually={(id, lineId) => {
              const label = availableLines.find((l) => l.id === lineId)?.label ?? lineId;
              decideCandidate(id, "reviewed", `Manually mapped to ${label}`, lineId);
            }}
            onReject={(id) => decideCandidate(id, "rejected", "Rejected; mapping needs fix")}
            onReset={clearCandidateDecision}
          />
        )}
      </PrioritySection>

      {/* Section 4: New Imports */}
      <PrioritySection
        title="New Imports"
        subtitle="Candidate yang matched ke line existing. Approve untuk mempromosikan setting ke status reviewed."
        count={newImports.length}
        tone="blue"
        icon={<Sparkles className="w-4 h-4" />}
      >
        {newImports.length === 0 ? (
          <EmptyState message="Tidak ada candidate baru." />
        ) : (
          <CandidateTable
            rows={newImports}
            availableLines={availableLines}
            onApprove={(id) => decideCandidate(id, "reviewed", "Mapping confirmed via inbox")}
            onReject={(id) => decideCandidate(id, "rejected", "Rejected; mapping needs fix")}
            onMapManually={(id, lineId) => {
              const label = availableLines.find((l) => l.id === lineId)?.label ?? lineId;
              decideCandidate(id, "reviewed", `Manually mapped to ${label}`, lineId);
            }}
            onReset={clearCandidateDecision}
            onOpenLine={openLine}
          />
        )}
      </PrioritySection>

      {/* Section 5 (toggle): Coverage Expansion — needs_substation */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowExpansion((v) => !v)}
          className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2">
            {showExpansion ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
            <div>
              <div className="text-sm font-semibold text-slate-700">Coverage Expansion</div>
              <div className="text-[11px] text-slate-500">Records yang remote substation-nya belum di mini-NMM. One-click [+ Add Substation + Relation] untuk tumbuh.</div>
            </div>
          </div>
          <span className="text-sm font-semibold px-2.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">
            {needsSubstation.length}
          </span>
        </button>
        {showExpansion && (
          <div className="border-t border-slate-100">
            {needsSubstation.length === 0 ? (
              <EmptyState message="Tidak ada record yang tinggal butuh substation expansion." />
            ) : (
              <ExpansionTable
                rows={needsSubstation}
                availableLines={availableLines}
                actionLabel="+ Add Substation + Relation"
                onAction={quickAddSubstationAndRelation}
                onMapManually={(id, lineId) => {
                  const label = availableLines.find((l) => l.id === lineId)?.label ?? lineId;
                  decideCandidate(id, "reviewed", `Manually mapped to ${label}`, lineId);
                }}
                onReject={(id) => decideCandidate(id, "rejected", "Rejected; out of scope")}
                onReset={clearCandidateDecision}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function CandidateTable({
  rows,
  availableLines,
  onApprove,
  onReject,
  onMapManually,
  onReset,
  onOpenLine,
}: {
  rows: CandidateRow[];
  availableLines: { id: string; label: string }[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onMapManually: (candidateId: string, lineId: string) => void;
  onReset: (id: string) => void;
  onOpenLine: (lineId: string | undefined) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Source</th>
            <th className="text-left px-4 py-2 font-medium">Candidate</th>
            <th className="text-left px-4 py-2 font-medium">Match</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th className="text-left px-4 py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.candidateId} className="border-b border-slate-100 last:border-b-0 align-top">
              <td className="px-4 py-3">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">
                  {row.source}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">{row.summary}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{row.detail}</div>
                {row.matchedLineId && (
                  <button
                    type="button"
                    onClick={() => onOpenLine(row.matchedLineId)}
                    className="text-[10px] text-blue-600 hover:underline mt-1"
                  >
                    open in Line Registry →
                  </button>
                )}
              </td>
              <td className="px-4 py-3">
                <MatchBadge status={row.matchStatus} />
                <div className="text-[10px] text-slate-500 mt-1 max-w-72">{row.reason}</div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={row.currentStatus} />
                {row.decision?.note && (
                  <div className="text-[10px] text-slate-500 mt-1 italic max-w-56">{row.decision.note}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1.5 min-w-44">
                  {row.currentStatus === "imported" ? (
                    row.matchStatus === "matched" ? (
                      <>
                        <SmallButton
                          label="Approve mapping"
                          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                          tone="emerald"
                          onClick={() => onApprove(row.candidateId)}
                        />
                        <SmallButton
                          label="Reject mapping"
                          icon={<XCircle className="w-3.5 h-3.5" />}
                          tone="red"
                          onClick={() => onReject(row.candidateId)}
                        />
                      </>
                    ) : (
                      <>
                        <ManualMapPicker
                          candidateId={row.candidateId}
                          availableLines={availableLines}
                          onMap={onMapManually}
                        />
                        <SmallButton
                          label="Reject mapping"
                          icon={<XCircle className="w-3.5 h-3.5" />}
                          tone="red"
                          onClick={() => onReject(row.candidateId)}
                        />
                      </>
                    )
                  ) : (
                    <SmallButton
                      label="Reset"
                      icon={<Undo2 className="w-3.5 h-3.5" />}
                      tone="slate"
                      onClick={() => onReset(row.candidateId)}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpansionTable({
  rows,
  availableLines,
  actionLabel,
  onAction,
  onMapManually,
  onReject,
  onReset,
}: {
  rows: CandidateRow[];
  availableLines: { id: string; label: string }[];
  actionLabel: string;
  onAction: (row: CandidateRow) => void;
  onMapManually: (candidateId: string, lineId: string) => void;
  onReject: (id: string) => void;
  onReset: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Source</th>
            <th className="text-left px-4 py-2 font-medium">Candidate</th>
            <th className="text-left px-4 py-2 font-medium">Hint</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th className="text-left px-4 py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.candidateId} className="border-b border-slate-100 last:border-b-0 align-top">
              <td className="px-4 py-3">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">
                  {row.source}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">{row.summary}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{row.detail}</div>
              </td>
              <td className="px-4 py-3 text-[11px] text-slate-600 max-w-72">
                <div className="font-mono">
                  {row.localStationHint ?? "?"} → {row.remoteStationHint ?? "?"}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{row.reason}</div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={row.currentStatus} />
                {row.decision?.note && (
                  <div className="text-[10px] text-slate-500 mt-1 italic max-w-56">{row.decision.note}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1.5 min-w-44">
                  {row.currentStatus === "imported" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onAction(row)}
                        className="inline-flex items-center justify-center gap-1.5 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-1 text-[11px] font-medium transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {actionLabel}
                      </button>
                      <ManualMapPicker
                        candidateId={row.candidateId}
                        availableLines={availableLines}
                        onMap={onMapManually}
                      />
                      <SmallButton
                        label="Reject"
                        icon={<XCircle className="w-3.5 h-3.5" />}
                        tone="red"
                        onClick={() => onReject(row.candidateId)}
                      />
                    </>
                  ) : (
                    <SmallButton
                      label="Reset"
                      icon={<Undo2 className="w-3.5 h-3.5" />}
                      tone="slate"
                      onClick={() => onReset(row.candidateId)}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ManualMapPicker({
  candidateId,
  availableLines,
  onMap,
}: {
  candidateId: string;
  availableLines: { id: string; label: string }[];
  onMap: (candidateId: string, lineId: string) => void;
}) {
  if (availableLines.length === 0) {
    return (
      <div className="text-[10px] text-amber-700 italic">
        Tidak ada line di case ini. Tambah Line Relation di Mini-NMM Editor dulu.
      </div>
    );
  }
  return (
    <select
      className="bg-white text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 focus:border-emerald-500 focus:outline-none"
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) {
          onMap(candidateId, e.target.value);
          e.currentTarget.value = "";
        }
      }}
    >
      <option value="" disabled>
        Map to line...
      </option>
      {availableLines.map((line) => (
        <option key={line.id} value={line.id}>
          {line.label}
        </option>
      ))}
    </select>
  );
}

function PrioritySection({
  title,
  subtitle,
  count,
  tone,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  tone: "red" | "amber" | "blue";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const headerCls = {
    red: "bg-red-50 border-red-200 text-red-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    blue: "bg-blue-50 border-blue-200 text-blue-900",
  }[tone];
  const borderCls = {
    red: "border-red-200",
    amber: "border-amber-200",
    blue: "border-blue-200",
  }[tone];
  const countCls = {
    red: "bg-red-100 text-red-800 border-red-300",
    amber: "bg-amber-100 text-amber-800 border-amber-300",
    blue: "bg-blue-100 text-blue-800 border-blue-300",
  }[tone];
  return (
    <section className={`bg-white border-2 ${borderCls} rounded-lg overflow-hidden`}>
      <div className={`border-b px-4 py-2.5 flex items-center justify-between gap-3 ${headerCls}`}>
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-[11px] opacity-80">{subtitle}</div>
          </div>
        </div>
        <span className={`text-sm font-semibold px-2.5 py-0.5 rounded border ${countCls}`}>
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-6 text-center text-xs text-slate-500">{message}</div>
  );
}

function defaultLifecycle(_c: LcdDistLineCandidate): LifecycleStatus {
  return "imported";
}

function defaultLifecycleOcr(_c: OcrLineCandidate): LifecycleStatus {
  return "imported";
}

function inferProtectionFunctions(row: CandidateRow): ProtectionFunctionId[] {
  return row.source === "LCD+DIST" ? ["LCD", "DIST"] : ["OCR", "GFR"];
}

function fmt(value: number | null) {
  return value === null ? "-" : String(value);
}

function Tile({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  icon?: React.ReactNode;
  tone: "amber" | "red" | "slate" | "emerald" | "blue";
}) {
  const cls = {
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    red: "bg-red-50 border-red-200 text-red-900",
    slate: "bg-slate-50 border-slate-200 text-slate-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
    blue: "bg-blue-50 border-blue-200 text-blue-900",
  }[tone];
  return (
    <div className={`rounded-md border p-3 ${cls}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider font-medium opacity-80">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-semibold mt-0.5">{value}</div>
      {sub && <div className="text-[10px] opacity-70 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function SmallButton({
  label,
  icon,
  onClick,
  tone,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  tone: "emerald" | "red" | "slate";
  disabled?: boolean;
}) {
  const cls = {
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    red: "border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
    slate: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  }[tone];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
        disabled ? "border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed" : cls
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: LifecycleStatus }) {
  return (
    <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded border uppercase tracking-wider ${statusClass[status]}`}>
      {status}
    </span>
  );
}

function MatchBadge({ status }: { status: string }) {
  const style: Record<string, string> = {
    matched: "bg-emerald-50 text-emerald-700 border-emerald-200",
    candidate: "bg-blue-50 text-blue-700 border-blue-200",
    needs_validation: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`inline-flex text-[10px] uppercase tracking-wider border rounded px-2 py-0.5 ${style[status] ?? "bg-slate-50 border-slate-200 text-slate-600"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function MismatchBadge({ label, status }: { label: string; status: "match" | "cosmetic" | "functional" | "unknown" }) {
  const style = {
    match: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cosmetic: "bg-blue-50 text-blue-700 border-blue-200",
    functional: "bg-red-50 text-red-700 border-red-200",
    unknown: "bg-slate-50 text-slate-500 border-slate-200",
  }[status];
  return (
    <span className={`inline-flex text-[10px] border rounded px-1.5 py-0.5 ${style}`}>
      {label}: {status}
    </span>
  );
}
