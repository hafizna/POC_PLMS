import { useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Inbox,
  Network,
  Plus,
  Sparkles,
  Undo2,
  XCircle,
} from "lucide-react";
import { NETWORK_CASES, type NetworkLine, type NetworkNode } from "../../domain/seed-network-registry";
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
  getEffectiveNetworkGraph,
  INVENTORY_MASTER_CASE_ID,
  mergeMasterRelationsIntoCase,
  networkLinesFromGraph,
  networkNodesFromGraph,
} from "../../domain/network-graph";
import { looseTokenMatch, normalizeStationName } from "../../domain/normalization";
import { buildGraphForUltg, type GraphBuildGroup } from "../../domain/graph-builder";
import {
  HEL_PHT_TAP_REGISTRY,
  buildHelPhtTapArtifacts,
  mapHelPhtTapCandidatesToLines,
} from "../../domain/hel-pht-tap-import";
import { useProsetStore } from "../../store/useProsetStore";
import { getConfirmedMasterNetwork } from "../../domain/study-network";
import {
  buildScopedTopologyCandidates,
  findGraphSubstation,
  topologyDecisionKey,
} from "../../domain/topology-remediation";

const statusClass: Record<LifecycleStatus, string> = {
  imported: "bg-slate-50 text-slate-600 border-slate-200",
  reviewed: "bg-blue-50 text-blue-700 border-blue-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  issued: "bg-violet-50 text-violet-700 border-violet-200",
  superseded: "bg-orange-50 text-orange-700 border-orange-200",
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
  const [showRegistryQueues, setShowRegistryQueues] = useState(false);
  const openedFromCaseId = useProsetStore((state) => state.openedFromCaseId);
  const openedFromCase = useProsetStore((state) =>
    state.settingCases.find((item) => item.id === state.openedFromCaseId)
  );
  const activeCaseId = useProsetStore((s) => s.activeNetworkCaseId);
  const setTab = useProsetStore((s) => s.setTab);
  const setActiveSettingCase = useProsetStore((s) => s.setActiveSettingCase);
  const clearOpenedFromCase = useProsetStore((s) => s.clearOpenedFromCase);
  const decisions = useProsetStore((s) => s.candidateDecisions);
  const decideCandidate = useProsetStore((s) => s.decideCandidate);
  const clearCandidateDecision = useProsetStore((s) => s.clearCandidateDecision);
  const selectLine = useProsetStore((s) => s.selectLine);
  const addNetworkGraphRelationBundle = useProsetStore((s) => s.addNetworkGraphRelationBundle);
  const networkGraphOverride = useProsetStore((s) => s.networkGraphOverrides[activeCaseId]);
  const masterNetworkGraphOverride = useProsetStore((s) => s.networkGraphOverrides[INVENTORY_MASTER_CASE_ID]);

  const activeCase =
    NETWORK_CASES.find((item) => item.id === activeCaseId) ?? NETWORK_CASES[0];
  const inventoryCase =
    NETWORK_CASES.find((item) => item.id === INVENTORY_MASTER_CASE_ID) ?? activeCase;
  const fallbackNetworkGraph = useMemo(() => buildUnifiedNetwork(activeCase), [activeCase]);
  const masterFallbackNetworkGraph = useMemo(() => buildUnifiedNetwork(inventoryCase), [inventoryCase]);
  const masterNetworkGraph = useMemo(
    () =>
      getEffectiveNetworkGraph(
        INVENTORY_MASTER_CASE_ID,
        masterNetworkGraphOverride,
        masterFallbackNetworkGraph
      ),
    [masterNetworkGraphOverride, masterFallbackNetworkGraph]
  );
  const effectiveNetworkGraph = useMemo(
    () =>
      mergeMasterRelationsIntoCase(
        getEffectiveNetworkGraph(activeCase.id, networkGraphOverride, fallbackNetworkGraph),
        masterNetworkGraph
      ),
    [activeCase.id, networkGraphOverride, fallbackNetworkGraph, masterNetworkGraph]
  );
  const effectiveNodes = useMemo(
    () => (effectiveNetworkGraph ? networkNodesFromGraph(effectiveNetworkGraph) : activeCase.nodes),
    [activeCase.nodes, effectiveNetworkGraph]
  );
  const effectiveLines = useMemo(
    () => (effectiveNetworkGraph ? networkLinesFromGraph(effectiveNetworkGraph) : activeCase.lines),
    [activeCase.lines, effectiveNetworkGraph]
  );
  const helMappingOverrides = useMemo(
    () =>
      Object.fromEntries(
        HEL_PHT_TAP_REGISTRY.records.flatMap((record) => {
          const lineId = decisions[`candidate_${record.id}`]?.overrideLineId;
          return lineId ? [[record.id, lineId]] : [];
        })
      ),
    [decisions]
  );
  const helCandidates = useMemo(
    () =>
      mapHelPhtTapCandidatesToLines(
        HEL_PHT_TAP_REGISTRY.records,
        effectiveNodes,
        effectiveLines,
        helMappingOverrides
      ),
    [effectiveLines, effectiveNodes, helMappingOverrides]
  );
  const helArtifacts = useMemo(
    () =>
      effectiveNetworkGraph
        ? buildHelPhtTapArtifacts(effectiveNetworkGraph, helMappingOverrides)
        : { settingRecords: [], relaySettings: [] },
    [effectiveNetworkGraph, helMappingOverrides]
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
  // STRICT scope: only records where local substation appears in network graph
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
          // selectLine + Comparison tab; unmatched => guide to Network Builder.
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

  const returnToCaseGate = () => {
    if (!openedFromCaseId) return;
    setActiveSettingCase(openedFromCaseId);
    clearOpenedFromCase();
    setTab("cases");
  };

  // ── Quick-add handlers for Coverage Expansion / Needs Relation ────────
  // Both create bay+relation; needs_substation also creates the missing
  // remote substation first. Confidence "low" + status "imported" so that
  // engineer knows these were auto-promoted from import data, not curated.

  const findSubByHint = (hint: string | undefined): UnifiedSubstation | undefined => {
    if (!hint || !effectiveNetworkGraph) return undefined;
    return effectiveNetworkGraph.substations.find((s) =>
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
    addNetworkGraphRelationBundle(activeCase.id, {
      busbars: terminals.busbarsToAdd,
      bays,
      terminals: terminals.terminalsToAdd,
      relation,
    });
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
    const { bays, relation } = buildQuickRelation(row, fromSub, newSub);
    const terminals = buildQuickTerminals(activeCase.id, fromSub, newSub, bays);
    addNetworkGraphRelationBundle(activeCase.id, {
      substations: [newSub],
      busbars: terminals.busbarsToAdd,
      bays,
      terminals: terminals.terminalsToAdd,
      relation,
    });
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
      const existing = effectiveNetworkGraph?.busbars.find((b) => b.substationId === sub.id);
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

  if (openedFromCaseId && openedFromCase) {
    return (
      <div className="space-y-4">
        <section className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Case-scoped workspace</div>
          <h2 className="mt-1 text-sm font-semibold text-blue-950">{openedFromCase.title}</h2>
          <p className="mt-1 text-xs text-blue-800">
            Hanya kandidat topology yang menyentuh subject bay/line atau GI pada scope case ini yang ditampilkan. Mapping queue global tidak ikut dimuat.
          </p>
        </section>
        <CaseScopedGraphBuilderSection />
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div>
            <div className="text-xs font-semibold text-emerald-950">
              Baseline dibekukan dari Setting Case
            </div>
            <p className="mt-0.5 text-[11px] text-emerald-800">
              Topology Remediation hanya menyelesaikan relation. Kembali ke Case Gate,
              pastikan bukti sumber ter-link, lalu pilih Bekukan baseline.
            </p>
          </div>
          <button
            type="button"
            onClick={returnToCaseGate}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Kembali ke Case Gate <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </section>
      </div>
    );
  }

  if (!showRegistryQueues) {
    return (
      <div className="space-y-4">
        <section className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md border border-blue-200 bg-white p-2">
              <Inbox className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                Case-driven data quality
              </div>
              <h2 className="mt-1 text-sm font-semibold text-blue-950">
                Pilih Case atau Study yang sedang dikerjakan
              </h2>
              <p className="mt-1 max-w-3xl text-xs text-blue-800">
                Halaman awal hanya menampilkan scope kerja. Buka Data Quality Queue dari
                detail Setting Case untuk workspace yang benar-benar terisolasi ke case itu.
              </p>
            </div>
          </div>
        </section>

        <CaseScopedGraphBuilderSection />

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Registry queues · Data Steward
              </div>
              <h3 className="mt-1 text-sm font-semibold text-slate-900">
                Antrean global tetap tersedia sebagai drill-down
              </h3>
              <p className="mt-1 max-w-2xl text-xs text-slate-500">
                Gunakan hanya untuk housekeeping lintas-case: HEL mapping, functional drift,
                ambiguity, dan coverage expansion. Record global tidak dibuka otomatis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRegistryQueues(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Buka antrean registry global <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Functional Drift" value={counts.drift} sub="TAP vs actual mismatch" tone="red" />
            <Tile label="Pending Mapping" value={counts.pendingMapping} sub="Perlu review mapping" tone="amber" />
            <Tile label="Coverage Expansion" value={counts.expansion} sub="Endpoint di luar graph" tone="blue" />
            <Tile label="Decided" value={counts.decided} sub="Sudah direview" tone="emerald" />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Registry queues · global
          </div>
          <p className="mt-0.5 text-xs text-slate-600">
            Mode housekeeping lintas-case. Keputusan topology case tetap dilakukan dari group card case.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowRegistryQueues(false)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ChevronRight className="h-3.5 w-3.5 rotate-180" /> Kembali ke Case/Study cards
        </button>
      </section>

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
                Ringkasan apa yang butuh perhatian engineer. Mapping yang salah bisa di-reset, dipilih ulang manual, atau dibuatkan relation baru dari kandidat import/SLD.
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
            sub="Substation belum di network graph"
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
          Default view tampilkan record yang local-side substation-nya ada di network graph (matched, ambiguous, atau butuh relation). Records dengan remote substation di luar network graph (e.g. line ke GI yang belum dimodelkan) di-hide; toggle "Show Coverage Expansion" untuk grow network graph dari data import.
        </p>
      </section>

      <HelPhtTapMappingPanel
        candidates={helCandidates}
        lines={effectiveLines}
        nodes={effectiveNodes}
        settingRecordCount={helArtifacts.settingRecords.length}
        relaySettingCount={helArtifacts.relaySettings.length}
        onMap={(candidateId, lineId) =>
          decideCandidate(candidateId, "reviewed", "HEL_PHT_TAP engineer mapping", lineId)
        }
      />

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
                              Map di Network Graph
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
        subtitle="Both substations exist di network graph tapi line relation belum ada. One-click [+ Add Relation]."
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
              <div className="text-[11px] text-slate-500">Records yang remote substation-nya belum di network graph. One-click [+ Add Substation + Relation] untuk tumbuh.</div>
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
        Tidak ada line di case ini. Tambah Line Relation di Network Builder dulu.
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
  count: number | string;
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

function HelPhtTapMappingPanel({
  candidates,
  lines,
  nodes,
  settingRecordCount,
  relaySettingCount,
  onMap,
}: {
  candidates: ReturnType<typeof mapHelPhtTapCandidatesToLines>;
  lines: NetworkLine[];
  nodes: NetworkNode[];
  settingRecordCount: number;
  relaySettingCount: number;
  onMap: (candidateId: string, lineId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const matched = candidates.filter((item) => item.matchStatus === "matched");
  const ambiguous = candidates.filter((item) => item.matchStatus === "ambiguous");
  const unresolved = candidates.filter(
    (item) => item.matchStatus !== "matched" && item.matchStatus !== "ambiguous"
  );
  const lineLabel = (lineId: string) => {
    const line = lines.find((item) => item.id === lineId);
    if (!line) return lineId;
    const from = nodes.find((item) => item.id === line.fromNodeId);
    const to = nodes.find((item) => item.id === line.toNodeId);
    return `${from?.shortCode ?? "?"}-${to?.shortCode ?? "?"} #${line.circuit}`;
  };
  return (
    <section className="rounded-lg border border-violet-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 bg-violet-50 px-4 py-3 text-left"
      >
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-violet-800">HEL_PHT_TAP mapping · D1</div>
          <div className="mt-0.5 text-[11px] text-violet-700">
            {matched.length}/{candidates.length} mapped ke LineRelation · {settingRecordCount} SettingRecord · {relaySettingCount} RelaySetting · {ambiguous.length} perlu pilih sirkit · {unresolved.length} menunggu topology
          </div>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-violet-600" /> : <ChevronRight className="h-4 w-4 text-violet-600" />}
      </button>
      {expanded && (
        <div className="divide-y divide-slate-100">
          <div className="px-4 py-2 text-[11px] text-slate-600">
            Raw payload 13 model tetap dipertahankan. Mapping yang dikonfirmasi menghasilkan SettingRecord dan RelaySetting tanpa meratakan field vendor secara paksa.
          </div>
          {ambiguous.slice(0, 40).map((candidate) => (
            <div key={candidate.id} className="grid gap-2 px-4 py-2 text-xs md:grid-cols-[1fr_180px_1fr] md:items-center">
              <div>
                <div className="font-medium text-slate-800">{candidate.substation} → {candidate.remoteBay}</div>
                <div className="text-[10px] text-slate-500">{candidate.model} · row {candidate.sourceRow}</div>
              </div>
              <span className="w-fit rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">ambiguous circuit</span>
              <select
                defaultValue=""
                onChange={(event) => event.target.value && onMap(candidate.id, event.target.value)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
              >
                <option value="" disabled>Pilih LineRelation…</option>
                {candidate.candidateLineIds.map((lineId) => (
                  <option key={lineId} value={lineId}>{lineLabel(lineId)}</option>
                ))}
              </select>
            </div>
          ))}
          {ambiguous.length > 40 && (
            <div className="px-4 py-2 text-[10px] text-slate-500">Menampilkan 40 dari {ambiguous.length} ambiguity. Gunakan filter/bay-specific workflow untuk sisanya.</div>
          )}
        </div>
      )}
    </section>
  );
}

type TopologyReviewContext = {
  id: string;
  kind: "case" | "study";
  title: string;
  subjectLabel?: string;
  subjectLineId?: string;
  subjectBayId?: string;
  substationIds: string[];
};

function CaseScopedGraphBuilderSection() {
  const openedFromCaseId = useProsetStore((state) => state.openedFromCaseId);
  const settingCases = useProsetStore((state) => state.settingCases);
  const studies = useProsetStore((state) => state.studies);
  const activeStudyId = useProsetStore((state) => state.activeStudyId);
  const decisions = useProsetStore((state) => state.graphBuildDecisions);
  const masterOverride = useProsetStore(
    (state) => state.networkGraphOverrides[INVENTORY_MASTER_CASE_ID]
  );
  const confirmCandidate = useProsetStore((state) => state.confirmGraphBuildGroup);
  const rejectCandidate = useProsetStore((state) => state.rejectGraphBuildGroup);
  const clearDecision = useProsetStore((state) => state.clearGraphBuildDecision);
  const [expandedContextId, setExpandedContextId] = useState<string | null>(openedFromCaseId);

  const result = useMemo(() => buildGraphForUltg(), []);
  const master = useMemo(() => getConfirmedMasterNetwork(masterOverride), [masterOverride]);
  const contexts = useMemo<TopologyReviewContext[]>(() => {
    const openedCase = settingCases.find((item) => item.id === openedFromCaseId);
    if (openedCase) {
      return [{
        id: openedCase.id,
        kind: "case",
        title: openedCase.title,
        subjectLabel: openedCase.protectedScope.subjectLabel,
        subjectLineId: openedCase.protectedScope.subjectLineId,
        subjectBayId: openedCase.protectedScope.subjectBayId,
        substationIds: openedCase.protectedScope.substationIds,
      }];
    }

    const openCaseContexts: TopologyReviewContext[] = settingCases
      .filter((item) => !["closed", "cancelled", "rejected"].includes(item.stage))
      .map((item) => ({
        id: item.id,
        kind: "case",
        title: item.title,
        subjectLabel: item.protectedScope.subjectLabel,
        subjectLineId: item.protectedScope.subjectLineId,
        subjectBayId: item.protectedScope.subjectBayId,
        substationIds: item.protectedScope.substationIds,
      }));
    const activeStudy = studies.find((item) => item.id === activeStudyId);
    if (
      activeStudy &&
      !openCaseContexts.some((item) => item.subjectLineId === activeStudy.subjectLineId)
    ) {
      openCaseContexts.unshift({
        id: activeStudy.id,
        kind: "study",
        title: activeStudy.name,
        subjectLabel: activeStudy.subjectLabel,
        subjectLineId: activeStudy.subjectLineId,
        subjectBayId: activeStudy.subjectBayId,
        substationIds: activeStudy.substationIds,
      });
    }
    return openCaseContexts;
  }, [activeStudyId, openedFromCaseId, settingCases, studies]);

  const contextCandidates = useMemo(
    () => new Map(contexts.map((context) => [context.id, buildScopedTopologyCandidates(result.groups, context)])),
    [contexts, result.groups]
  );
  const pendingCount = contexts.reduce(
    (sum, context) => sum + (contextCandidates.get(context.id) ?? []).filter((candidate) => {
      const decisionKey = topologyDecisionKey(context.id, candidate.relation.id);
      return !master.lineRelations.some((relation) => relation.id === candidate.relation.id) && !decisions[decisionKey];
    }).length,
    0
  );

  return (
    <PrioritySection
      title="Topology Remediation — approval per Case"
      subtitle="Satu group card mewakili satu Case/Study. Di dalamnya, engineer approve atau reject LineRelation yang dibutuhkan scope itu saja—bukan seluruh GI dan bukan bulk 200 bay."
      count={`${pendingCount} perlu keputusan`}
      tone={pendingCount > 0 ? "amber" : "blue"}
      icon={<Network className="h-4 w-4" />}
    >
      {contexts.length === 0 ? (
        <EmptyState message="Belum ada Case atau Study aktif yang membutuhkan topology. Buka Topology Remediation dari case yang sedang diuji." />
      ) : (
        <div className="divide-y divide-slate-100">
          {contexts.map((context) => {
            const candidates = contextCandidates.get(context.id) ?? [];
            const expanded = contexts.length === 1 || expandedContextId === context.id;
            const pending = candidates.filter((candidate) => {
              const decisionKey = topologyDecisionKey(context.id, candidate.relation.id);
              return !master.lineRelations.some((relation) => relation.id === candidate.relation.id) && !decisions[decisionKey];
            }).length;
            return (
              <div key={context.id} className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpandedContextId((current) => current === context.id ? null : context.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    {expanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{context.title}</span>
                        <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] uppercase text-blue-700">{context.kind}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {context.subjectLabel ?? context.subjectLineId ?? `${context.substationIds.length} GI dalam scope`}
                      </div>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] ${pending > 0 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                    {pending > 0 ? `${pending} perlu keputusan` : "scope ready"}
                  </span>
                </button>

                {expanded && (
                  <div className="ml-6 mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {candidates.length === 0 ? (
                      <div className="xl:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-800">
                        Tidak ada kandidat LineRelation untuk scope ini. Tambahkan source yang menyebut endpoint dan circuit terkait; PLMS tidak akan membuat relasi tebakan.
                      </div>
                    ) : candidates.map((candidate) => {
                      const relation = candidate.relation;
                      const decisionKey = topologyDecisionKey(context.id, relation.id);
                      const decision = decisions[decisionKey];
                      const inMaster = master.lineRelations.some((item) => item.id === relation.id);
                      const from = findGraphSubstation(result.groups, relation.fromSubstationId);
                      const to = findGraphSubstation(result.groups, relation.toSubstationId);
                      const blocked = candidate.group.indicators.topology === "identity_conflict";
                      return (
                        <article key={relation.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {from?.shortCode ?? relation.fromSubstationId} — {to?.shortCode ?? relation.toSubstationId} #{relation.circuit}
                              </div>
                              <div className="mt-0.5 font-mono text-[10px] text-slate-500">{relation.id}</div>
                            </div>
                            <TopologyCardStatus inMaster={inMaster} decision={decision?.status} />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                            <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-600">{candidate.group.indicators.topology.replace(/_/g, " ")}</span>
                            <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-600">Electrical {candidate.group.indicators.electricalCoveragePercent}%</span>
                            <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-blue-700">Setting {candidate.group.indicators.settingOverlayCoveragePercent}%</span>
                            <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-violet-700">{candidate.group.indicators.evidenceSourceCount} evidence</span>
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            X={relation.lineXOhm?.toFixed(3) ?? "?"} Ω{relation.physicalLengthKm != null ? ` · ${relation.physicalLengthKm} km` : ""}
                          </div>
                          {candidate.group.needsManualTopology && (
                            <div className={`mt-2 rounded border px-2 py-1.5 text-[11px] ${blocked ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                              {candidate.group.indicators.topologyReason}
                            </div>
                          )}
                          <div className="mt-3 flex justify-end gap-2">
                            {decision?.status === "rejected" ? (
                              <button type="button" onClick={() => clearDecision(decisionKey)} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100">
                                <Undo2 className="h-3 w-3" /> Reset decision
                              </button>
                            ) : !decision && !inMaster && (
                              <>
                                <button type="button" onClick={() => rejectCandidate(decisionKey)} className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-1 text-[11px] text-red-700 hover:bg-red-50">
                                  <XCircle className="h-3 w-3" /> Reject
                                </button>
                                <button
                                  type="button"
                                  disabled={blocked}
                                  onClick={() => confirmCandidate(INVENTORY_MASTER_CASE_ID, {
                                    substation: candidate.group.station,
                                    supportingSubstations: candidate.supportingSubstations,
                                    bays: candidate.bays,
                                    relations: [relation],
                                    decisionKey,
                                  })}
                                  className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-600 px-2 py-1 text-[11px] text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Approve relation
                                </button>
                              </>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PrioritySection>
  );
}

function TopologyCardStatus({
  inMaster,
  decision,
}: {
  inMaster: boolean;
  decision?: "confirmed" | "rejected";
}) {
  if (decision === "confirmed") return <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">User approved</span>;
  if (decision === "rejected") return <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-700">Rejected</span>;
  if (inMaster) return <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">Source anchored</span>;
  return <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">Needs approval</span>;
}

// Legacy per-GI graph builder retained temporarily as a code reference while
// persisted station-level decisions migrate; it is no longer rendered.
// Per-GI graph builder confirmation. Unlike the per-record sections below
// (Functional Drift, Pending Mapping, etc. — one Inbox item per bay/row),
// this reviews one substation at a time: all of its anchored bays and line
// relations (from digsilentLineDb, scoped by the SLD folder index) plus
// overlay matches from LCD+DIST/OCR, confirmed or rejected in one action.
function GraphBuilderSection() {
  const activeCaseId = useProsetStore((s) => s.activeNetworkCaseId);
  const decisions = useProsetStore((s) => s.graphBuildDecisions);
  const confirmGroup = useProsetStore((s) => s.confirmGraphBuildGroup);
  const rejectGroup = useProsetStore((s) => s.rejectGraphBuildGroup);
  const clearDecision = useProsetStore((s) => s.clearGraphBuildDecision);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showDecided, setShowDecided] = useState(false);
  // Stations the reviewer has actually opened at least once. Confirm is
  // gated on this — committing 10+ bays/relations for a GI in one click
  // shouldn't be possible from the collapsed row alone; the reviewer must
  // have seen what's inside first.
  const [reviewedStationIds, setReviewedStationIds] = useState<Set<string>>(new Set());

  const result = useMemo(() => buildGraphForUltg(), []);

  const pendingGroups = result.groups.filter((g) => !decisions[g.station.id]);
  const decidedGroups = result.groups.filter((g) => decisions[g.station.id]);
  const needsManualCount = pendingGroups.filter((g) => g.needsManualTopology).length;
  const totalUnmatchedOverlays = result.groups.reduce(
    (sum, g) => sum + g.overlays.filter((o) => o.matchStatus === "unmatched").length,
    0
  );
  return (
    <PrioritySection
      title="Graph Builder — Konfirmasi Topology per GI"
      subtitle="Anchor dari digsilentLineDb (di-scope oleh folder SLD ULTG), overlay dari LCD+DIST/OCR. Satu keputusan mencakup seluruh bay & relasi GI tersebut, bukan per baris."
      count={pendingGroups.length}
      tone={needsManualCount > 0 ? "amber" : "blue"}
      icon={<Network className="w-4 h-4" />}
    >
      <div className="px-4 py-2 flex items-center justify-between gap-3 border-b border-slate-100 flex-wrap">
        <p className="text-[11px] text-slate-500 max-w-2xl">
          {needsManualCount} dari {result.groups.length} GI belum punya anchor topology eksplisit (butuh review manual/SLD).
          {" "}
          {totalUnmatchedOverlays} baris setting-doc (LCD+DIST/OCR) di seluruh ULTG ini belum ter-match ke bay anchor manapun.
        </p>
        <label className="text-[11px] text-slate-600 flex items-center gap-1.5 shrink-0">
          <input type="checkbox" checked={showDecided} onChange={(e) => setShowDecided(e.target.checked)} />
          tampilkan yang sudah diputuskan
        </label>
      </div>
      {pendingGroups.length === 0 && decidedGroups.length === 0 ? (
        <EmptyState message="Tidak ada GI dalam scope SLD untuk case ini." />
      ) : (
        <div className="divide-y divide-slate-100">
          {pendingGroups.map((group) => (
            <GraphBuildGroupRow
              key={group.station.id}
              group={group}
              expanded={expanded === group.station.id}
              reviewed={reviewedStationIds.has(group.station.id)}
              onToggle={() =>
                setExpanded((cur) => {
                  const next = cur === group.station.id ? null : group.station.id;
                  if (next) {
                    setReviewedStationIds((prev) => new Set(prev).add(group.station.id));
                  }
                  return next;
                })
              }
              onConfirm={() =>
                confirmGroup(activeCaseId, {
                  substation: group.station,
                  supportingSubstations: group.supportingSubstations,
                  bays: group.bays,
                  relations: group.lineRelations,
                })
              }
              onReject={() => rejectGroup(group.station.id)}
            />
          ))}
          {showDecided &&
            decidedGroups.map((group) => {
              const decision = decisions[group.station.id];
              return (
                <div key={group.station.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[10px] font-medium shrink-0 ${
                        decision.status === "confirmed"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-50 text-slate-600 border-slate-200"
                      }`}
                    >
                      {decision.status === "confirmed" ? "Confirmed" : "Rejected"}
                    </span>
                    <span className="font-medium text-slate-800 truncate">{group.station.name}</span>
                    <span className="text-slate-400 truncate">
                      {group.bays.length} bay, {group.lineRelations.length} relasi
                    </span>
                  </div>
                  <button
                    className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 shrink-0"
                    onClick={() => clearDecision(group.station.id)}
                  >
                    <Undo2 className="w-3 h-3" /> Reset
                  </button>
                </div>
              );
            })}
        </div>
      )}
    </PrioritySection>
  );
}

function GraphBuildGroupRow({
  group,
  expanded,
  reviewed,
  onToggle,
  onConfirm,
  onReject,
}: {
  group: GraphBuildGroup;
  expanded: boolean;
  reviewed: boolean;
  onToggle: () => void;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const unmatchedOverlays = group.overlays.filter((o) => o.matchStatus === "unmatched");
  const indicators = group.indicators;
  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <button className="flex items-start gap-2 text-left min-w-0" onClick={onToggle}>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-slate-900">{group.station.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                {group.station.kind}
              </span>
              {group.needsManualTopology ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                  {indicators.topology === "identity_conflict"
                    ? "Identity conflict"
                    : indicators.topology === "corroborated_candidate"
                      ? "Corroborated candidate"
                      : "Perlu topology manual"}
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                  Anchor: digsilentLineDb
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {group.bays.length} bay, {group.lineRelations.length} relasi
              {unmatchedOverlays.length > 0 && `, ${unmatchedOverlays.length} setting-doc row belum ter-match`}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
              <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-600">Electrical {indicators.electricalCoveragePercent}%</span>
              <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-blue-700">Setting overlay {indicators.settingOverlayCoveragePercent}%</span>
              <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-violet-700">
                {indicators.evidenceSourceCount} evidence source{indicators.reciprocalEvidence ? " · reciprocal" : ""}
              </span>
            </div>
          </div>
        </button>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-2">
            <button
              className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 flex items-center gap-1"
              onClick={onReject}
            >
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
            <button
              className="text-xs px-2.5 py-1 rounded border border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:border-slate-300"
              onClick={onConfirm}
              disabled={
                !reviewed ||
                (group.bays.length === 0 && group.lineRelations.length === 0) ||
                indicators.topology === "identity_conflict"
              }
              title={!reviewed ? "Buka detail GI ini dulu sebelum confirm" : undefined}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Confirm GI
            </button>
          </div>
          {!reviewed && (group.bays.length > 0 || group.lineRelations.length > 0) && (
            <span className="text-[10px] text-slate-400">Buka detail dulu untuk bisa confirm</span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 ml-6 space-y-2">
          {group.lineRelations.length > 0 && (
            <div className="text-xs">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-1">Line relations</p>
              <ul className="space-y-0.5">
                {group.lineRelations.map((rel) => (
                  <li key={rel.id} className="text-slate-600 flex items-center gap-1.5">
                    <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                    <span className="font-mono text-[11px]">{rel.digsilentName}</span>
                    <span className="text-slate-400">
                      #{rel.circuit} · X={rel.lineXOhm?.toFixed(3)}Ω
                      {rel.physicalLengthKm != null && ` · ${rel.physicalLengthKm}km`}
                      {rel.outOfService && " · OUT OF SERVICE"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {unmatchedOverlays.length > 0 && (
            <div className="text-xs">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-1">
                Setting-doc rows belum ter-match ke bay anchor
              </p>
              <ul className="space-y-0.5">
                {unmatchedOverlays.map((o, i) => (
                  <li key={`${o.sourceId}_${i}`} className="text-slate-600">
                    <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 mr-1.5">
                      {o.sourceKind === "lcd-dist-import" ? "LCD+DIST" : "OCR/GFR"}
                    </span>
                    {o.substationRaw} / {o.bayRaw}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {group.needsManualTopology && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              {indicators.topologyReason}
              {indicators.topology === "corroborated_candidate" &&
                " Confirm menyimpan relasi sebagai reviewed candidate; nilai electrical tetap kosong sampai sumber resmi tersedia."}
            </p>
          )}
        </div>
      )}
    </div>
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
