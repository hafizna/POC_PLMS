import { useMemo, useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, ClipboardList, Database, FileSearch, FileText, GitCompareArrows, Inbox, Network, Plus, Route, Search, Settings2 } from "lucide-react";
import { NETWORK_CASES, ULTG_INVENTORY_NODES } from "../../domain/seed-network-registry";
import {
  getEffectiveNetworkGraph,
  INVENTORY_MASTER_CASE_ID,
  mergeMasterRelationsIntoCase,
  networkLinesFromGraph,
  networkNodesFromGraph,
} from "../../domain/network-graph";
import { buildUnifiedNetwork } from "../../domain/unified";
import { useProsetStore } from "../../store/useProsetStore";
import { normalizeStationName } from "../../domain/normalization";
import { findComparisonBayIdForLine } from "../../domain/seed-comparison";
import { StudyWizard } from "./StudyWizard";
import {
  LCD_DIST_REGISTRY,
  mapLcdDistCandidatesToLines,
} from "../../domain/lcd-dist-import";
import {
  OCR_REGISTRY,
  mapOcrCandidatesToLines,
  summarizeOcrMismatch,
} from "../../domain/ocr-import";
import { getEffectiveCtVt } from "../../domain/instrument-transformers";
import {
  resolveFaultScenario,
  type ScenarioResolution,
  type SourceSnapshot,
  type StudyScenario,
} from "../../domain/engineering-data";

type BayStatus =
  | "perlu mapping"
  | "data tidak lengkap"
  | "missing CT/VT"
  | "perlu TAP"
  | "ada drift"
  | "siap hitung"
  | "coverage ready";

type BayRow = {
  bayId: string;
  substation: string;
  substationCode: string;
  bayName: string;
  circuit: string;
  relationId?: string;
  relationLabel: string;
  ied: string;
  functions: string[];
  status: BayStatus;
  readinessNotes: string[];
  hasComparison: boolean;
  hasDrift: boolean;
  isCoverageReady: boolean;
};

export function StudyDashboardView() {
  const [search, setSearch] = useState("");
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const activeCaseId = useProsetStore((s) => s.activeNetworkCaseId);
  const networkGraphOverrides = useProsetStore((s) => s.networkGraphOverrides);
  const ctVtOverrides = useProsetStore((s) => s.ctVtOverrides);
  const setTab = useProsetStore((s) => s.setTab);
  const selectLine = useProsetStore((s) => s.selectLine);
  const studies = useProsetStore((s) => s.studies);
  const activeStudyId = useProsetStore((s) => s.activeStudyId);
  const setActiveStudy = useProsetStore((s) => s.setActiveStudy);
  const sourceSnapshots = useProsetStore((s) => s.sourceSnapshots);
  const studyScenarios = useProsetStore((s) => s.studyScenarios);
  const setStudyScenario = useProsetStore((s) => s.setStudyScenario);
  
  const activeStudy = studies.find((study) => study.id === activeStudyId);
  const scenarioResolution = useMemo(
    () =>
      resolveFaultScenario(
        sourceSnapshots,
        studyScenarios,
        activeStudy?.scenarioId
      ),
    [activeStudy?.scenarioId, sourceSnapshots, studyScenarios]
  );
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
        networkGraphOverrides[INVENTORY_MASTER_CASE_ID],
        masterFallbackNetworkGraph
      ),
    [masterFallbackNetworkGraph, networkGraphOverrides]
  );
  
  const networkGraph = useMemo(
    () =>
      mergeMasterRelationsIntoCase(
        getEffectiveNetworkGraph(activeCase.id, networkGraphOverrides[activeCase.id], fallbackNetworkGraph),
        masterNetworkGraph
      ),
    [activeCase.id, fallbackNetworkGraph, masterNetworkGraph, networkGraphOverrides]
  );

  const derivedNodes = useMemo(
    () => (networkGraph ? networkNodesFromGraph(networkGraph) : activeCase.nodes),
    [activeCase.nodes, networkGraph]
  );
  const derivedLines = useMemo(
    () => (networkGraph ? networkLinesFromGraph(networkGraph) : activeCase.lines),
    [activeCase.lines, networkGraph]
  );

  const lineReadiness = useMemo(() => {
    const lcdCandidates = mapLcdDistCandidatesToLines(
      LCD_DIST_REGISTRY.records,
      derivedNodes,
      derivedLines
    );
    const ocrCandidates = mapOcrCandidatesToLines(
      OCR_REGISTRY.records,
      derivedNodes,
      derivedLines
    );
    const lcdTapLineIds = new Set(
      lcdCandidates
        .filter((candidate) => candidate.matchStatus === "matched" && candidate.matchedLineId && candidate.tapDocument)
        .map((candidate) => candidate.matchedLineId!)
    );
    const driftLineIds = new Set(
      ocrCandidates
        .filter((candidate) => candidate.matchStatus === "matched" && candidate.matchedLineId)
        .filter((candidate) => {
          const record = OCR_REGISTRY.records.find((item) => item.id === candidate.recordId);
          return record ? summarizeOcrMismatch(record).hasFunctionalRisk : false;
        })
        .map((candidate) => candidate.matchedLineId!)
    );

    return { lcdTapLineIds, driftLineIds };
  }, [derivedLines, derivedNodes]);

  const rows: BayRow[] = useMemo(() => {
    if (!networkGraph) return [];
    const scopedSubstations = buildStudyScopeKeys(activeStudy?.substationIds ?? []);
    return networkGraph.bays
      .flatMap((bay) => {
        const sub = networkGraph.substations.find((item) => item.id === bay.substationId);
        // Only show bays in the active study scope
        if (scopedSubstations.size > 0 && !isSubstationInScope(sub, bay.substationId, scopedSubstations)) {
          return [];
        }
        
        const relation = networkGraph.lineRelations.find(
          (item) => item.fromBayId === bay.id || item.toBayId === bay.id
        );
        const remoteSubId =
          relation?.fromBayId === bay.id
            ? relation.toSubstationId
            : relation?.toBayId === bay.id
              ? relation.fromSubstationId
              : undefined;
        const remoteSub = networkGraph.substations.find((item) => item.id === remoteSubId);
        const ied = networkGraph.relayIeds.find((item) => item.bayId === bay.id);
        const functions = networkGraph.protectionFunctions
          .filter((item) => item.relayIedId === ied?.id)
          .map((item) => item.function);

        const hasComparison = relation ? !!findComparisonBayIdForLine(relation.id) : false;
        const hasTapSource = relation ? lineReadiness.lcdTapLineIds.has(relation.id) || hasComparison : false;
        const hasDrift = relation ? lineReadiness.driftLineIds.has(relation.id) : false;
        const effectiveCtVt = getEffectiveCtVt(ied, ctVtOverrides);
        const missingCtVt = !!ied && (!effectiveCtVt.ct || !effectiveCtVt.vt);
        const hasDistance = functions.includes("DIST");
        const isCoverageReady =
          !!relation &&
          !!ied &&
          !missingCtVt &&
          hasDistance &&
          relation.lineXOhm != null;
        const readinessNotes = buildReadinessNotes({
          relationExists: !!relation,
          iedExists: !!ied,
          hasFunctions: functions.length > 0,
          missingCtVt,
          hasTapSource,
          hasComparison,
          hasDrift,
          hasDistance,
          lineXOhm: relation?.lineXOhm,
        });
        const status = deriveBayStatus({
          relationExists: !!relation,
          iedExists: !!ied,
          hasFunctions: functions.length > 0,
          missingCtVt,
          hasTapSource,
          hasDrift,
          isCoverageReady,
        });

        const row: BayRow = {
          bayId: bay.id,
          substation: sub?.name ?? bay.substationId,
          substationCode: sub?.shortCode ?? bay.substationId,
          bayName: bay.rawName,
          circuit: bay.circuit ? `#${bay.circuit}` : "-",
          relationId: relation?.id,
          relationLabel: remoteSub ? `${sub?.shortCode ?? bay.substationId} - ${remoteSub.shortCode}` : "unmapped",
          ied: ied ? `${ied.make} ${ied.model}` : "IED belum terdaftar",
          functions: Array.from(new Set(functions)),
          status,
          readinessNotes,
          hasComparison,
          hasDrift,
          isCoverageReady,
        };
        return [row];
      })
      .sort((a, b) =>
        `${a.substationCode} ${a.bayName}`.localeCompare(`${b.substationCode} ${b.bayName}`)
      );
  }, [activeStudy?.substationIds, ctVtOverrides, lineReadiness.driftLineIds, lineReadiness.lcdTapLineIds, networkGraph]);

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => 
      row.substationCode.toLowerCase().includes(q) ||
      row.bayName.toLowerCase().includes(q) ||
      row.ied.toLowerCase().includes(q) ||
      row.relationLabel.toLowerCase().includes(q) ||
      row.status.toLowerCase().includes(q) ||
      row.readinessNotes.some((note) => note.toLowerCase().includes(q)) ||
      row.functions.some(f => f.toLowerCase().includes(q))
    );
  }, [rows, search]);

  const substationsCount = new Set(rows.map((row) => row.substationCode)).size;
  const relationCount = new Set(rows.flatMap((row) => (row.relationId ? [row.relationId] : []))).size;
  const readyCount = rows.filter((row) => row.status === "siap hitung" || row.status === "coverage ready").length;
  const driftCount = rows.filter((row) => row.hasDrift).length;
  const coverageReadyCount = rows.filter((row) => row.isCoverageReady).length;

  const startStudy = (lineId: string | undefined, targetTab: "network-model" | "calculation" | "comparison" | "coverage" | "verified-report") => {
    if (lineId) selectLine(lineId);
    setTab(targetTab);
  };

  const getStatusColor = (status: BayStatus) => {
    switch (status) {
      case "siap hitung": return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "coverage ready": return "bg-blue-50 text-blue-700 border-blue-200";
      case "ada drift": return "bg-red-50 text-red-700 border-red-200";
      case "missing CT/VT": return "bg-amber-50 text-amber-700 border-amber-200";
      case "perlu TAP": return "bg-violet-50 text-violet-700 border-violet-200";
      case "perlu mapping": return "bg-orange-50 text-orange-700 border-orange-200";
      case "data tidak lengkap": return "bg-red-50 text-red-700 border-red-200";
      default: return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  return (
    <div className="space-y-4">
      {isWizardOpen && <StudyWizard onClose={() => setIsWizardOpen(false)} />}
      
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-blue-600 p-3 shadow-sm">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Study Dashboard</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold uppercase tracking-wider">
                  Working View
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1 max-w-3xl">
                Landing kerja engineer. Mulai dari Master Data di background, definisikan case di Study Wizard, dan lakukan navigasi perhitungan (calculate, compare, coverage, report) secara terpusat di sini.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={activeStudyId ?? ""}
                onChange={(e) => setActiveStudy(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 text-sm font-medium border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
              >
                {studies.length === 0 && <option value="">No Active Studies</option>}
                {studies.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <Settings2 className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            </div>
            <button
              onClick={() => setIsWizardOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Study
            </button>
          </div>
        </div>

        {activeStudy ? (
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-5 gap-4">
            <SummaryTile label="Substations in Scope" value={substationsCount} />
            <SummaryTile label="Registered Bays" value={rows.length} />
            <SummaryTile label="Line Relations" value={relationCount} />
            <SummaryTile label="Ready / Coverage" value={`${readyCount} / ${coverageReadyCount}`} highlight={readyCount === rows.length && rows.length > 0} />
            <SummaryTile label="Functional Drift" value={driftCount} tone={driftCount > 0 ? "red" : "slate"} />
          </div>
        ) : (
          <div className="mt-6 p-8 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-center">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">No Active Study Scope</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
              Silakan buat study baru melalui Study Wizard untuk menentukan scope gardu induk dan bay yang akan dianalisis.
            </p>
            <button
              onClick={() => setIsWizardOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Start Study Wizard
            </button>
          </div>
        )}
      </section>

      {activeStudy && (
        <StudyScenarioPanel
          studyName={activeStudy.name}
          scenarioId={activeStudy.scenarioId}
          scenarios={studyScenarios}
          snapshots={sourceSnapshots}
          resolution={scenarioResolution}
          onChange={(scenarioId) => setStudyScenario(activeStudy.id, scenarioId)}
        />
      )}

      {activeStudy && (
        <GuidedFlowPanel
          relationCount={relationCount}
          mappedBayCount={rows.filter((row) => row.relationId).length}
          readyCount={readyCount}
          comparisonCount={rows.filter((row) => row.hasComparison).length}
          coverageReadyCount={coverageReadyCount}
          onNavigate={setTab}
        />
      )}

      {activeStudy && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col min-h-[500px]">
          <div className="border-b border-slate-200 px-4 py-3 bg-slate-50 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Working Network: {activeStudy.name}</h3>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {activeStudy.description || "Scope data siap untuk eksekusi task rekonduktoring/analisis."}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter GI, Bay, IED, Fungsi..."
                  className="pl-9 pr-4 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-slate-200 text-xs text-slate-500 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold uppercase tracking-wider">GI/GIS</th>
                  <th className="text-left px-4 py-3 font-semibold uppercase tracking-wider">Bay</th>
                  <th className="text-left px-4 py-3 font-semibold uppercase tracking-wider">Relation</th>
                  <th className="text-left px-4 py-3 font-semibold uppercase tracking-wider">IED & Protection</th>
                  <th className="text-left px-4 py-3 font-semibold uppercase tracking-wider">Readiness</th>
                  <th className="text-left px-4 py-3 font-semibold uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      {search ? "Tidak ada hasil pencarian yang sesuai." : "Belum ada bay dalam scope study ini."}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.bayId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 align-top w-40">
                        <div className="font-bold text-slate-900">{row.substationCode}</div>
                        <div className="text-[11px] text-slate-500 line-clamp-1" title={row.substation}>{row.substation}</div>
                      </td>
                      <td className="px-4 py-3 align-top w-48">
                        <div className="font-semibold text-slate-800">{row.bayName}</div>
                        <div className="text-[11px] text-slate-500">circuit {row.circuit}</div>
                      </td>
                      <td className="px-4 py-3 align-top w-48">
                        {row.relationId ? (
                          <>
                            <div className="text-xs font-medium text-slate-700">{row.relationLabel}</div>
                            <div className="font-mono text-[10px] text-slate-400 mt-1 truncate" title={row.relationId}>{row.relationId}</div>
                          </>
                        ) : (
                          <div className="text-xs italic text-slate-400">Not mapped to line</div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-xs text-slate-800 font-medium mb-1.5">{row.ied}</div>
                        <div className="flex flex-wrap gap-1">
                          {(row.functions.length > 0 ? row.functions : ["-"]).map((fn) => (
                            <span key={fn} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-white text-slate-600 shadow-sm">
                              {fn}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top w-48">
                        <div className="space-y-1.5">
                          <span className={`inline-flex text-[10px] px-2 py-1 rounded border uppercase tracking-wider font-semibold shadow-sm ${getStatusColor(row.status)}`}>
                            {row.status}
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {row.readinessNotes.slice(0, 3).map((note) => (
                              <span
                                key={note}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-white text-slate-500"
                              >
                                {note}
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <ActionPill 
                            label="Network" 
                            icon={<Network className="w-3.5 h-3.5" />} 
                            disabled={!row.relationId} 
                            onClick={() => startStudy(row.relationId, "network-model")} 
                          />
                          <ActionPill 
                            label="Calculate" 
                            icon={<Calculator className="w-3.5 h-3.5" />} 
                            disabled={!row.relationId || row.status === "perlu mapping"} 
                            onClick={() => startStudy(row.relationId, "calculation")} 
                          />
                          <ActionPill 
                            label="Compare" 
                            icon={<GitCompareArrows className="w-3.5 h-3.5" />} 
                            disabled={!row.relationId || !row.hasComparison} 
                            onClick={() => startStudy(row.relationId, "comparison")} 
                          />
                          <ActionPill 
                            label="Coverage" 
                            icon={<Route className="w-3.5 h-3.5" />} 
                            disabled={!row.relationId || !row.isCoverageReady} 
                            onClick={() => startStudy(row.relationId, "coverage")} 
                          />
                          <ActionPill 
                            label="Report" 
                            icon={<FileText className="w-3.5 h-3.5" />} 
                            disabled={!row.relationId} 
                            onClick={() => startStudy(row.relationId, "verified-report")} 
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function StudyScenarioPanel({
  studyName,
  scenarioId,
  scenarios,
  snapshots,
  resolution,
  onChange,
}: {
  studyName: string;
  scenarioId?: string;
  scenarios: StudyScenario[];
  snapshots: SourceSnapshot[];
  resolution: ScenarioResolution;
  onChange: (scenarioId: string | null) => void;
}) {
  const selected = scenarios.find((scenario) => scenario.id === scenarioId);
  const networkSnapshot = selected
    ? snapshots.find((snapshot) => snapshot.id === selected.networkSnapshotId)
    : undefined;
  const faultSnapshot = selected?.faultSnapshotId
    ? snapshots.find((snapshot) => snapshot.id === selected.faultSnapshotId)
    : undefined;
  const blocked = resolution.status === "blocked";

  return (
    <section
      className={`rounded-lg border overflow-hidden ${
        blocked ? "border-amber-300 bg-amber-50/40" : "border-blue-200 bg-white"
      }`}
    >
      <div
        className={`px-4 py-3 border-b flex items-start justify-between gap-4 flex-wrap ${
          blocked ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"
        }`}
      >
        <div className="flex items-start gap-2">
          {blocked ? (
            <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5" />
          ) : (
            <Database className="w-4 h-4 text-blue-700 mt-0.5" />
          )}
          <div>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-800">
              Study Scenario
            </h3>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Fault level untuk {studyName} hanya boleh diambil melalui scenario ini.
            </p>
          </div>
        </div>
        <select
          value={scenarioId ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
          className="min-w-72 bg-white text-xs px-3 py-2 rounded border border-slate-300 focus:border-blue-500 focus:outline-none"
        >
          <option value="">Select scenario — fault lookup blocked</option>
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.name}
            </option>
          ))}
        </select>
      </div>

      {selected ? (
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
            <ScenarioDatum label="Network revision" value={selected.networkRevisionId} />
            <ScenarioDatum
              label="Method / condition"
              value={`${selected.studyMethod} / ${selected.condition}`}
            />
            <ScenarioDatum
              label="Network snapshot"
              value={networkSnapshot?.label ?? selected.networkSnapshotId}
            />
            <ScenarioDatum
              label="Fault snapshot"
              value={faultSnapshot?.label ?? selected.faultSnapshotId ?? "not selected"}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-[10px] px-2 py-1 rounded border border-slate-200 bg-slate-50 text-slate-600">
              calculated at: {selected.calculatedAt ?? "unknown"}
            </span>
            <span className="text-[10px] px-2 py-1 rounded border border-slate-200 bg-slate-50 text-slate-600">
              generation: {selected.generationState}
            </span>
            <span className="text-[10px] px-2 py-1 rounded border border-slate-200 bg-slate-50 text-slate-600">
              source state: {selected.sourceState}
            </span>
          </div>
          {resolution.issues.length > 0 && (
            <div className="mt-3 space-y-1">
              {resolution.issues.map((issue, index) => (
                <div
                  key={`${issue.code}-${index}`}
                  className={`text-[11px] ${
                    issue.severity === "error" ? "text-red-700" : "text-amber-700"
                  }`}
                >
                  {issue.severity === "error" ? "Blocked" : "Review"}: {issue.message}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 text-xs text-amber-800">
          No scenario is attached. Automatic fault-study lookup is blocked; manual values must
          be identified explicitly as manual input.
        </div>
      )}
    </section>
  );
}

function ScenarioDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50/70 p-2.5">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
        {label}
      </div>
      <div className="text-xs text-slate-800 mt-1">{value}</div>
    </div>
  );
}

function GuidedFlowPanel({
  relationCount,
  mappedBayCount,
  readyCount,
  comparisonCount,
  coverageReadyCount,
  onNavigate,
}: {
  relationCount: number;
  mappedBayCount: number;
  readyCount: number;
  comparisonCount: number;
  coverageReadyCount: number;
  onNavigate: (tab: "source-index" | "network-model" | "inbox" | "calculation" | "comparison" | "verified-report") => void;
}) {
  const steps = [
    {
      label: "Source Documents",
      detail: "SLD, TAP, workbook, and validation docs indexed",
      icon: <FileSearch className="w-4 h-4" />,
      done: true,
      action: () => onNavigate("source-index"),
    },
    {
      label: "Working Network",
      detail: `${relationCount} relation${relationCount === 1 ? "" : "s"} modeled`,
      icon: <Network className="w-4 h-4" />,
      done: relationCount > 0,
      action: () => onNavigate("network-model"),
    },
    {
      label: "Mapping Inbox",
      detail: `${mappedBayCount} bay${mappedBayCount === 1 ? "" : "s"} linked to relation`,
      icon: <Inbox className="w-4 h-4" />,
      done: mappedBayCount > 0,
      action: () => onNavigate("inbox"),
    },
    {
      label: "Calculation",
      detail: `${readyCount} bay${readyCount === 1 ? "" : "s"} ready for workbook`,
      icon: <Calculator className="w-4 h-4" />,
      done: readyCount > 0,
      action: () => onNavigate("calculation"),
    },
    {
      label: "Comparison",
      detail: `${comparisonCount} line${comparisonCount === 1 ? "" : "s"} with comparison data`,
      icon: <GitCompareArrows className="w-4 h-4" />,
      done: comparisonCount > 0,
      action: () => onNavigate("comparison"),
    },
    {
      label: "Report",
      detail: `${coverageReadyCount} line${coverageReadyCount === 1 ? "" : "s"} coverage ready`,
      icon: <FileText className="w-4 h-4" />,
      done: coverageReadyCount > 0,
      action: () => onNavigate("verified-report"),
    },
  ];

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Guided Flow</h3>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Jalur kerja utama dari dokumen sumber sampai verified report.
          </div>
        </div>
        <span className="text-[10px] px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700">
          {steps.filter((step) => step.done).length}/{steps.length} ready
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-slate-100">
        {steps.map((step, index) => (
          <button
            key={step.label}
            type="button"
            onClick={step.action}
            className="text-left p-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`inline-flex items-center justify-center rounded-md border p-1.5 ${
                step.done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"
              }`}>
                {step.done ? <CheckCircle2 className="w-4 h-4" /> : step.icon}
              </span>
              <span className="text-[10px] text-slate-400">Step {index + 1}</span>
            </div>
            <div className="mt-3 text-xs font-semibold text-slate-900">{step.label}</div>
            <div className="mt-1 text-[11px] leading-4 text-slate-500">{step.detail}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function buildStudyScopeKeys(substationIds: string[]) {
  const keys = new Set<string>();
  for (const id of substationIds) {
    keys.add(id);
    keys.add(id.toLowerCase());
    keys.add(normalizeStationName(id));
    const inventoryNode = ULTG_INVENTORY_NODES.find((node) => node.id === id);
    if (inventoryNode) {
      keys.add(inventoryNode.id);
      keys.add(inventoryNode.shortCode.toLowerCase());
      keys.add(normalizeStationName(inventoryNode.name));
    }
  }
  return keys;
}

function isSubstationInScope(
  substation: { id: string; name: string; shortCode: string; normalizedName?: string } | undefined,
  fallbackId: string,
  scopeKeys: Set<string>
) {
  if (scopeKeys.has(fallbackId) || scopeKeys.has(fallbackId.toLowerCase())) return true;
  if (!substation) return false;
  return (
    scopeKeys.has(substation.id) ||
    scopeKeys.has(substation.id.toLowerCase()) ||
    scopeKeys.has(substation.shortCode.toLowerCase()) ||
    scopeKeys.has(substation.normalizedName ?? "") ||
    scopeKeys.has(normalizeStationName(substation.name))
  );
}

function deriveBayStatus(input: {
  relationExists: boolean;
  iedExists: boolean;
  hasFunctions: boolean;
  missingCtVt: boolean;
  hasTapSource: boolean;
  hasDrift: boolean;
  isCoverageReady: boolean;
}): BayStatus {
  if (!input.relationExists) return "perlu mapping";
  if (!input.iedExists || !input.hasFunctions) return "data tidak lengkap";
  if (input.missingCtVt) return "missing CT/VT";
  if (input.hasDrift) return "ada drift";
  if (!input.hasTapSource) return "perlu TAP";
  if (input.isCoverageReady) return "coverage ready";
  return "siap hitung";
}

function buildReadinessNotes(input: {
  relationExists: boolean;
  iedExists: boolean;
  hasFunctions: boolean;
  missingCtVt: boolean;
  hasTapSource: boolean;
  hasComparison: boolean;
  hasDrift: boolean;
  hasDistance: boolean;
  lineXOhm?: number;
}) {
  const notes: string[] = [];
  if (!input.relationExists) notes.push("relation belum ada");
  if (!input.iedExists) notes.push("IED belum terdaftar");
  if (input.iedExists && !input.hasFunctions) notes.push("fungsi proteksi kosong");
  if (input.missingCtVt) notes.push("CT/VT missing");
  if (!input.hasTapSource) notes.push("TAP source belum ada");
  if (!input.hasComparison) notes.push("actual comparison belum ada");
  if (input.hasDrift) notes.push("functional drift");
  if (input.hasDistance && input.lineXOhm == null) notes.push("X line missing");
  if (notes.length === 0) notes.push(input.hasDistance ? "coverage ready" : "registry ready");
  return notes;
}

function SummaryTile({
  label,
  value,
  highlight,
  tone = "slate",
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  tone?: "slate" | "red";
}) {
  const toneClass =
    tone === "red"
      ? "bg-red-50 border-red-200 text-red-900"
      : highlight
        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
        : "bg-white border-slate-200 text-slate-900";
  const labelClass =
    tone === "red"
      ? "text-red-700"
      : highlight
        ? "text-emerald-700"
        : "text-slate-500";
  return (
    <div className={`rounded-xl border p-4 shadow-sm transition-colors ${toneClass}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${labelClass}`}>{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function ActionPill({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-[4px] text-[11px] font-medium border transition-colors ${
        disabled
          ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
          : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 shadow-sm"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
