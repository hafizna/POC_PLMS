import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Database,
  FileSearch,
  GitBranch,
  HardDrive,
  Plus,
  RadioTower,
  RotateCcw,
  XCircle,
} from "lucide-react";
import {
  NETWORK_CASES,
  REGISTRY_SOURCES,
  RegistryConfidence,
  NetworkCase,
} from "../../domain/seed-network-registry";
import { SLD_SOURCE_INDEX } from "../../domain/sld-source-index";
import {
  PDF_SOURCE_REGISTRY,
  filterPdfSourcesForNodes,
  getEndpointCandidatesForNodes,
} from "../../domain/pdf-source-registry";
import {
  getEffectiveMiniNmm,
  INVENTORY_MASTER_CASE_ID,
  mergeMasterRelationsIntoCase,
  networkLinesFromMiniNmm,
  networkNodesFromMiniNmm,
  relayAssetsFromMiniNmm,
} from "../../domain/mini-nmm";
import { useProsetStore } from "../../store/useProsetStore";
import type { NetworkNode } from "../../domain/seed-network-registry";
import { normalizeStationName } from "../../domain/normalization";
import type { Bay, LineRelation, UnifiedNetwork, UnifiedSubstation } from "../../domain/unified";
import { buildUnifiedNetwork } from "../../domain/unified";

type EndpointFilter = "actionable" | "existing" | "expansion" | "ignored";

const confidenceClass: Record<RegistryConfidence, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-orange-50 text-orange-700 border-orange-200",
  missing: "bg-red-50 text-red-700 border-red-200",
};

const gapClass = {
  blocker: "bg-red-50 text-red-800 border-red-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
};

const gapIcon = { blocker: AlertTriangle, warning: AlertTriangle, info: CircleHelp };
const STUDY_CASE_IDS = new Set(["case_dks_dm_pik_mkb"]);

function isStudyCase(item: NetworkCase) {
  return STUDY_CASE_IDS.has(item.id);
}

export function NetworkModelView() {
  const [endpointFilter, setEndpointFilter] = useState<EndpointFilter>("actionable");
  const activeCaseId = useProsetStore((s) => s.activeNetworkCaseId);
  const setActiveCase = useProsetStore((s) => s.setActiveNetworkCase);
  const setTab = useProsetStore((s) => s.setTab);
  const decisions = useProsetStore((s) => s.candidateDecisions);
  const decideCandidate = useProsetStore((s) => s.decideCandidate);
  const clearCandidateDecision = useProsetStore((s) => s.clearCandidateDecision);
  const addBay = useProsetStore((s) => s.addMiniNmmBay);
  const addRelation = useProsetStore((s) => s.addMiniNmmRelation);
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
  const miniNmm = mergeMasterRelationsIntoCase(baseMiniNmm, masterMiniNmm);
  const localRelationCount = baseMiniNmm?.lineRelations.length ?? 0;
  const masterRelationCount = masterMiniNmm?.lineRelations.length ?? 0;
  const bridgedRelationCount =
    miniNmm?.lineRelations.filter((relation) => relation.sourceIds.includes("master-inventory")).length ?? 0;
  const nodes = useMemo(
    () => (miniNmm ? networkNodesFromMiniNmm(miniNmm) : activeCase.nodes),
    [activeCase.nodes, miniNmm]
  );
  const lines = useMemo(
    () => (miniNmm ? networkLinesFromMiniNmm(miniNmm) : activeCase.lines),
    [activeCase.lines, miniNmm]
  );
  const relays = useMemo(
    () => (miniNmm ? relayAssetsFromMiniNmm(miniNmm) : activeCase.relays),
    [activeCase.relays, miniNmm]
  );
  const sources = REGISTRY_SOURCES.filter((s) => activeCase.sourceIds.includes(s.id));
  const avgCompleteness = Math.round(
    lines.length === 0
      ? activeCase.readiness
      : lines.reduce((sum, line) => sum + line.completeness, 0) / lines.length
  );
  const parsedSources = sources.filter((s) => s.status === "parsed").length;
  const sldStationRows = getCaseSldStationRows(nodes);
  const pdfSources = filterPdfSourcesForNodes(nodes);
  const endpointCandidates = getEndpointCandidatesForNodes(nodes);
  const endpointRows = useMemo(
    () => buildEndpointReviewRows(endpointCandidates, miniNmm, decisions),
    [endpointCandidates, miniNmm, decisions]
  );
  const filteredEndpointRows = endpointRows.filter((row) => {
    if (endpointFilter === "ignored") return row.status === "rejected";
    if (row.status === "rejected") return false;
    if (endpointFilter === "existing") return row.relationExists;
    if (endpointFilter === "expansion") return !row.readyToPromote && !row.relationExists;
    return row.readyToPromote;
  });
  const endpointCounts = {
    actionable: endpointRows.filter((row) => row.readyToPromote && row.status !== "rejected").length,
    existing: endpointRows.filter((row) => row.relationExists && row.status !== "rejected").length,
    expansion: endpointRows.filter((row) => !row.readyToPromote && !row.relationExists && row.status !== "rejected").length,
    ignored: endpointRows.filter((row) => row.status === "rejected").length,
  };

  const promoteEndpoint = (row: EndpointReviewRow) => {
    const targetCaseId = INVENTORY_MASTER_CASE_ID;
    const targetMiniNmm = masterMiniNmm ?? miniNmm;
    const targetLocalSub = findSubstationByName(targetMiniNmm, row.localStation);
    const targetRemoteSub = findSubstationByName(targetMiniNmm, row.remoteStation);
    if (!targetMiniNmm || !targetLocalSub || !targetRemoteSub || row.relationExists) return;
    const { relation, bays } = createRelationFromEndpoint(
      { ...row, localSub: targetLocalSub, remoteSub: targetRemoteSub },
      targetMiniNmm
    );
    for (const bay of bays) addBay(targetCaseId, bay);
    addRelation(targetCaseId, relation);
    decideCandidate(row.candidateId, "reviewed", `Promoted SLD endpoint from ${row.sourceFileName}`);
  };

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Working Network</h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
              Active study network untuk perhitungan dan coverage setting. Master ULTG Inventory tetap dipakai sebagai source bridge di belakang layar, bukan sebagai working case utama.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Active Study</span>
            <select
              value={activeCase.id}
              onChange={(event) => setActiveCase(event.target.value)}
              className="bg-white text-sm px-3 py-1.5 rounded border border-slate-300 focus:border-blue-500 focus:outline-none"
            >
              {NETWORK_CASES.filter(isStudyCase).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span className="font-semibold">Study intent:</span> verified workflow untuk satu koridor/ruas prioritas. ULTG Durikosambi Inventory berfungsi sebagai master/staging source untuk menambah relation yang sudah divalidasi ke study ini.
        </div>

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label="Substations" value={String(nodes.length)} sub="GI/GIS nodes" icon={<RadioTower className="w-4 h-4 text-blue-600" />} tone="blue" />
          <SummaryCard
            label="Line Relations"
            value={String(lines.length)}
            sub={activeCase.scope === "inventory" && lines.length === 0 ? "not extracted yet" : activeCase.scope === "inventory" ? "draft extracted edges" : "corridor edges"}
            icon={<GitBranch className="w-4 h-4 text-emerald-600" />}
            tone="emerald"
          />
          <SummaryCard label="Relay Assets" value={String(relays.length)} sub="main protection IEDs" icon={<HardDrive className="w-4 h-4 text-amber-600" />} tone="amber" />
          <SummaryCard label="Completeness" value={`${avgCompleteness}%`} sub={`${parsedSources}/${sources.length} sources parsed`} icon={<Database className="w-4 h-4 text-slate-500" />} />
        </div>
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs font-semibold text-slate-700">Master inventory bridge</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Validated SLD endpoint promotion disimpan di ULTG Inventory master, lalu hanya relation yang relevan difilter ke active study.
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <BridgePill label="local relations" value={localRelationCount} />
            <BridgePill label="master relations" value={masterRelationCount} />
            <BridgePill label="bridged here" value={bridgedRelationCount} tone="blue" />
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2 bg-slate-50 flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Data Readiness</h3>
          <span className="text-[10px] text-slate-500">
            {activeCase.gaps.length} open item{activeCase.gaps.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
          <GapSummary label="Blocker" count={activeCase.gaps.filter((g) => g.severity === "blocker").length} tone="blocker" />
          <GapSummary label="Warning" count={activeCase.gaps.filter((g) => g.severity === "warning").length} tone="warning" />
          <GapSummary label="Info" count={activeCase.gaps.filter((g) => g.severity === "info").length} tone="info" />
        </div>
        <div className="divide-y divide-slate-100">
          {activeCase.gaps.map((gap) => {
            const Icon = gapIcon[gap.severity];
            return (
              <div key={gap.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-md border p-1 ${gapClass[gap.severity]}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-sm font-semibold text-slate-900">{gap.title}</div>
                      <span className="text-[10px] px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-500">{gap.area}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{gap.detail}</p>
                    <div className="text-xs text-slate-500 mt-2">
                      Next: <span className="text-slate-700">{gap.nextAction}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600 mb-4">
          {activeCase.scope === "inventory" ? "Inventory Nodes" : "Network Relations"}
        </h3>
        <div className="overflow-x-auto pb-2">
          {activeCase.scope === "inventory" ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {nodes.map((node) => (
                <div key={node.id} className="border border-slate-200 bg-slate-50 rounded-md p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-lg font-semibold text-slate-900">{node.shortCode}</div>
                    <span className="text-[10px] text-slate-500 border border-slate-200 bg-white rounded px-1.5 py-0.5">{node.type}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">{node.name}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{node.voltageKv} kV | SLD indexed</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="min-w-[920px] space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {lines.map((line) => {
                  const from = nodes.find((node) => node.id === line.fromNodeId);
                  const to = nodes.find((node) => node.id === line.toNodeId);
                  return (
                    <div key={line.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center gap-3">
                        <RelationNode node={from} fallback={line.fromNodeId} />
                        <div className="flex-1 min-w-28">
                          <div className="h-0.5 bg-slate-300 relative">
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 whitespace-nowrap">
                              {line.circuit} | X {line.lineXOhm?.toFixed(3) ?? "?"} ohm
                            </div>
                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 whitespace-nowrap max-w-48 truncate">
                              {line.relayMain || line.protectionFunctions.join("/")}
                            </div>
                          </div>
                        </div>
                        <RelationNode node={to} fallback={line.toNodeId} />
                      </div>
                      <div className="mt-7 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                        <span className="font-mono truncate">{line.id}</span>
                        <span className={`px-1.5 py-0.5 rounded border ${confidenceClass[line.confidence]}`}>
                          {line.confidence}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
                Relation cards use actual `fromNodeId` / `toNodeId`. They are not drawn as one continuous corridor unless the topology path is explicitly validated for distance coverage.
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                {nodes.map((node) => (
                  <div key={node.id} className="border border-slate-200 bg-white rounded-md p-2 text-center">
                    <div className="text-sm font-semibold text-slate-900">{node.shortCode}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">{node.name}</div>
                    <div className="text-[10px] text-slate-400 mt-1">{node.type} {node.voltageKv} kV</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-700 mb-2">Case notes</div>
          <ul className="space-y-1">
            {activeCase.notes.map((note) => (
              <li key={note} className="text-xs text-slate-600">- {note}</li>
            ))}
          </ul>
        </div>
      </section>

      {miniNmm && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-2 bg-slate-50 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">
                Mini-NMM (Substation -&gt; Busbar -&gt; Bay -&gt; Terminal -&gt; Relation -&gt; IED)
              </h3>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Single source of truth untuk koridor ini. Edit di src/domain/mini-nmm.ts.
              </div>
            </div>
            <span className="text-[10px] px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700">
              {miniNmm.substations.length} subs | {miniNmm.busbars.length} bus | {miniNmm.bays.length} bays | {miniNmm.lineRelations.length} relations | {miniNmm.relayIeds.length} IED
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {miniNmm.substations.map((sub) => {
              const subBusbars = miniNmm.busbars.filter((b) => b.substationId === sub.id);
              const subBays = miniNmm.bays.filter((b) => b.substationId === sub.id);
              return (
                <div key={sub.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-semibold text-slate-900">{sub.shortCode} - {sub.name}</div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">{sub.kind} {sub.voltageKv} kV</span>
                    <span className="text-[10px] text-slate-400 font-mono">{subBusbars.map((b) => b.label).join(", ")}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {subBays.map((bay) => {
                      const term = miniNmm.terminals.find((t) => t.bayId === bay.id);
                      const busbar = subBusbars.find((b) => b.id === term?.busbarId);
                      const ied = miniNmm.relayIeds.find((r) => r.bayId === bay.id);
                      const fnIds = miniNmm.protectionFunctions.filter((p) => p.relayIedId === ied?.id).map((p) => p.function);
                      const relation = miniNmm.lineRelations.find((r) => r.fromBayId === bay.id || r.toBayId === bay.id);
                      return (
                        <div key={bay.id} className="border border-slate-200 rounded-md p-2 bg-slate-50">
                          <div className="text-xs font-semibold text-slate-800 truncate">{bay.rawName}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">terminal -&gt; {busbar?.label ?? "?"} | circuit {bay.circuit || "?"}</div>
                          {ied && (
                            <div className="text-[10px] text-slate-700 font-mono mt-1">IED: {ied.make} {ied.model}</div>
                          )}
                          {fnIds.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {fnIds.map((fn) => (
                                <span key={fn} className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">{fn}</span>
                              ))}
                            </div>
                          )}
                          {relation && (
                            <div className="text-[10px] text-slate-400 mt-1 font-mono truncate">relation: {relation.id} | status {relation.status}</div>
                          )}
                        </div>
                      );
                    })}
                    {subBays.length === 0 && (
                      <div className="text-xs text-slate-400 italic">No bays in seed.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2 bg-slate-50 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">SLD Endpoint Candidates</h3>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Unique GI/GIS-to-GI/GIS skeleton extracted from SLD PDF text layer. Promote only reviewed endpoints.
            </div>
          </div>
          <span className="text-[10px] px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700">
            {endpointRows.length} unique endpoints
          </span>
        </div>
        <div className="px-4 py-2 border-b border-slate-100 bg-white flex items-center gap-2 flex-wrap">
          <EndpointFilterButton active={endpointFilter === "actionable"} onClick={() => setEndpointFilter("actionable")} label="Ready to promote" count={endpointCounts.actionable} />
          <EndpointFilterButton active={endpointFilter === "existing"} onClick={() => setEndpointFilter("existing")} label="Already modeled" count={endpointCounts.existing} />
          <EndpointFilterButton active={endpointFilter === "expansion"} onClick={() => setEndpointFilter("expansion")} label="Needs station" count={endpointCounts.expansion} />
          <EndpointFilterButton active={endpointFilter === "ignored"} onClick={() => setEndpointFilter("ignored")} label="Ignored" count={endpointCounts.ignored} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Endpoint</th>
                <th className="text-left px-4 py-2 font-medium">State</th>
                <th className="text-left px-4 py-2 font-medium">Evidence</th>
                <th className="text-left px-4 py-2 font-medium">Source</th>
                <th className="text-left px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEndpointRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                    Tidak ada endpoint pada filter ini.
                  </td>
                </tr>
              )}
              {filteredEndpointRows.map((row) => (
                <tr key={row.candidateId} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-2 align-top">
                    <div className="font-semibold text-slate-900">
                      {row.localStation} - {row.remoteStation}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {row.sourceCount} source{row.sourceCount === 1 ? "" : "s"} | {row.localSub ? "local ok" : "local missing"} | {row.remoteSub ? "remote ok" : "remote missing"}
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="flex flex-col gap-1 items-start">
                      <EndpointConfidenceBadge confidence={row.confidence} />
                      <EndpointStateBadge row={row} />
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top text-xs text-slate-600 max-w-xl">
                    <div className="line-clamp-2">{row.evidence || "-"}</div>
                  </td>
                  <td className="px-4 py-2 align-top text-xs text-slate-600 max-w-80">
                    <div className="truncate">{row.sourceFileName}</div>
                    {row.decision?.decidedAt && (
                      <div className="text-[10px] text-slate-400 mt-1">
                        decided {formatDate(row.decision.decidedAt)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="flex flex-col gap-1.5 min-w-32">
                      {row.status === "rejected" ? (
                        <SmallEndpointButton
                          label="Undo ignore"
                          icon={<RotateCcw className="w-3.5 h-3.5" />}
                          onClick={() => clearCandidateDecision(row.candidateId)}
                        />
                      ) : row.relationExists ? (
                        <span className="text-[10px] text-slate-400">Already in mini-NMM</span>
                      ) : (
                        <>
                          <SmallEndpointButton
                            label="Promote to master"
                            icon={<Plus className="w-3.5 h-3.5" />}
                            onClick={() => promoteEndpoint(row)}
                            disabled={!row.readyToPromote}
                          />
                          <SmallEndpointButton
                            label="Ignore"
                            icon={<XCircle className="w-3.5 h-3.5" />}
                            onClick={() => decideCandidate(row.candidateId, "rejected", "Ignored from SLD endpoint review")}
                            tone="red"
                          />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-4 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          PDF Source Registry, SLD Source Directory Index, dan Registry Sources sekarang ada di tab Source Index.
        </div>
        <button
          type="button"
          onClick={() => setTab("source-index")}
          className="text-xs px-3 py-1.5 rounded border border-blue-300 bg-white text-blue-700 hover:bg-blue-50"
        >
          Buka Source Index →
        </button>
      </section>
    </div>
  );
}

type EndpointReviewRow = {
  candidateId: string;
  localStation: string;
  remoteStation: string;
  localSub?: UnifiedSubstation;
  remoteSub?: UnifiedSubstation;
  relationExists: boolean;
  relationOrigin?: "local" | "master";
  readyToPromote: boolean;
  confidence: string;
  evidence: string;
  sourceFileName: string;
  sourceCount: number;
  status: "imported" | "reviewed" | "rejected" | "approved" | "issued";
  decision?: { status: "imported" | "reviewed" | "rejected" | "approved" | "issued"; decidedAt?: string; note?: string };
};

function buildEndpointReviewRows(
  candidates: ReturnType<typeof getEndpointCandidatesForNodes>,
  miniNmm: UnifiedNetwork | undefined,
  decisions: ReturnType<typeof useProsetStore.getState>["candidateDecisions"]
): EndpointReviewRow[] {
  const groups = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const local = normalizeStationName(candidate.localStation);
    const remote = normalizeStationName(candidate.remoteStation);
    if (!local || !remote || local === remote) continue;
    const key = [local, remote].sort().join("__");
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  return Array.from(groups.entries())
    .map(([key, items]) => {
      const best = [...items].sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence))[0];
      const localSub = findSubstationByName(miniNmm, best.localStation);
      const remoteSub = findSubstationByName(miniNmm, best.remoteStation);
      const matchedRelation =
        localSub && remoteSub
          ? miniNmm?.lineRelations.find(
          (relation) =>
            [relation.fromSubstationId, relation.toSubstationId].includes(localSub.id) &&
            [relation.fromSubstationId, relation.toSubstationId].includes(remoteSub.id)
          )
          : undefined;
      const relationExists = !!matchedRelation;
      const candidateId = `sld-endpoint:${key}`;
      const decision = decisions[candidateId];
      return {
        candidateId,
        localStation: best.localStation,
        remoteStation: best.remoteStation,
        localSub,
        remoteSub,
        relationExists,
        relationOrigin: matchedRelation?.sourceIds.includes("master-inventory") ? "master" : matchedRelation ? "local" : undefined,
        readyToPromote: !!localSub && !!remoteSub && !relationExists && best.confidence !== "low",
        confidence: best.confidence,
        evidence: best.evidence,
        sourceFileName: best.sourceFileName,
        sourceCount: items.length,
        status: decision?.status ?? "imported",
        decision,
      } satisfies EndpointReviewRow;
    })
    .sort((a, b) => {
      const actionDelta = Number(b.readyToPromote) - Number(a.readyToPromote);
      if (actionDelta !== 0) return actionDelta;
      return confidenceRank(b.confidence) - confidenceRank(a.confidence);
    });
}

function createRelationFromEndpoint(row: EndpointReviewRow, miniNmm: UnifiedNetwork) {
  const localSub = row.localSub!;
  const remoteSub = row.remoteSub!;
  const circuit = "1";
  const suffix = `${localSub.id}_${remoteSub.id}_${Date.now()}`;
  const localBay: Bay = {
    id: `bay_${suffix}_from`,
    substationId: localSub.id,
    rawName: `PHT ${localSub.voltageKv}kV ${remoteSub.name.toUpperCase()}#${circuit}`,
    normalizedName: normalizeStationName(remoteSub.name),
    remoteEndpointHint: normalizeStationName(remoteSub.name),
    circuit,
    kind: "line",
  };
  const remoteBay: Bay = {
    id: `bay_${suffix}_to`,
    substationId: remoteSub.id,
    rawName: `PHT ${remoteSub.voltageKv}kV ${localSub.name.toUpperCase()}#${circuit}`,
    normalizedName: normalizeStationName(localSub.name),
    remoteEndpointHint: normalizeStationName(localSub.name),
    circuit,
    kind: "line",
  };
  const relation: LineRelation = {
    id: `line_${suffix}`,
    fromBayId: localBay.id,
    toBayId: remoteBay.id,
    fromSubstationId: localSub.id,
    toSubstationId: remoteSub.id,
    circuit,
    voltageKv: localSub.voltageKv,
    protectionFunctionIds: [],
    sourceIds: ["sld-endpoint-candidate"],
    confidence: row.confidence === "high" ? "medium" : "low",
    status: "reviewed",
  };
  return { relation, bays: [localBay, remoteBay] };
}

function findSubstationByName(miniNmm: UnifiedNetwork | undefined, name: string) {
  const key = normalizeStationName(name);
  return miniNmm?.substations.find((sub) => {
    const subKey = normalizeStationName(sub.name);
    return subKey === key || subKey.includes(key) || key.includes(subKey);
  });
}

function confidenceRank(confidence: string) {
  return { high: 3, medium: 2, low: 1 }[confidence as "high" | "medium" | "low"] ?? 0;
}

function EndpointFilterButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] px-2 py-1 rounded border ${
        active
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label} <span className="font-semibold">{count}</span>
    </button>
  );
}

function EndpointStateBadge({ row }: { row: EndpointReviewRow }) {
  let label = "needs station";
  let style = "bg-amber-50 text-amber-700 border-amber-200";
  if (row.status === "rejected") {
    label = "ignored";
    style = "bg-red-50 text-red-700 border-red-200";
  } else if (row.relationExists) {
    label = row.relationOrigin === "master" ? "modeled from master" : "already modeled";
    style =
      row.relationOrigin === "master"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-slate-50 text-slate-600 border-slate-200";
  } else if (row.readyToPromote) {
    label = "ready";
    style = "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  return (
    <span className={`inline-flex text-[10px] uppercase tracking-wider border rounded px-2 py-0.5 ${style}`}>
      {label}
    </span>
  );
}

function SmallEndpointButton({
  label,
  icon,
  onClick,
  disabled,
  tone = "blue",
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "blue" | "red";
}) {
  const cls =
    tone === "red"
      ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
      : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100";
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

function getCaseSldStationRows(nodes: NetworkNode[]) {
  const stationKeys = nodes.map((n) => normalizeStationName(n.name)).filter(Boolean);
  const files = SLD_SOURCE_INDEX.files.filter((record) => {
    if (stationKeys.length === 0) return true;
    const folderKey = normalizeStationName(record.stationFolder);
    return stationKeys.some((s) => folderKey.includes(s));
  });
  const rows = new Map<string, {
    stationFolder: string;
    fileCount: number;
    extensions: Set<string>;
    kinds: Set<string>;
    singleLineCount: number;
    latestFileName: string;
    latestModified: string;
  }>();
  for (const file of files) {
    const existing = rows.get(file.stationFolder);
    const current = existing ?? {
      stationFolder: file.stationFolder,
      fileCount: 0,
      extensions: new Set<string>(),
      kinds: new Set<string>(),
      singleLineCount: 0,
      latestFileName: file.fileName,
      latestModified: file.lastModified,
    };
    current.fileCount += 1;
    current.extensions.add(file.extension);
    current.kinds.add(file.kind);
    if (file.kind === "single_line") current.singleLineCount += 1;
    if (file.lastModified > current.latestModified) {
      current.latestFileName = file.fileName;
      current.latestModified = file.lastModified;
    }
    rows.set(file.stationFolder, current);
  }
  return Array.from(rows.values())
    .map((row) => ({ ...row, extensions: Array.from(row.extensions).sort(), kinds: Array.from(row.kinds).sort() }))
    .sort((a, b) => a.stationFolder.localeCompare(b.stationFolder));
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", { year: "numeric", month: "short", day: "2-digit" });
}

function GapSummary({ label, count, tone }: { label: string; count: number; tone: "blocker" | "warning" | "info" }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between">
      <div>
        <div className="text-xs font-semibold text-slate-700">{label}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">open data issue</div>
      </div>
      <span className={`text-sm font-semibold px-2.5 py-1 rounded border ${gapClass[tone]}`}>{count}</span>
    </div>
  );
}

function SummaryCard({ label, value, sub, icon, tone }: { label: string; value: string; sub: string; icon: React.ReactNode; tone?: "emerald" | "amber" | "red" | "blue" }) {
  const toneClass = { emerald: "bg-emerald-50 border-emerald-200", amber: "bg-amber-50 border-amber-200", red: "bg-red-50 border-red-200", blue: "bg-blue-50 border-blue-200" }[tone ?? "emerald"];
  const baseClass = tone ? toneClass : "bg-slate-50 border-slate-200";
  return (
    <div className={`border rounded-md p-3 ${baseClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{label}</span>
        {icon}
      </div>
      <div className="mt-1 text-xl font-semibold text-slate-900 truncate">{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5 truncate">{sub}</div>
    </div>
  );
}

function RelationNode({
  node,
  fallback,
}: {
  node: NetworkNode | undefined;
  fallback: string;
}) {
  return (
    <div className="w-32 shrink-0 rounded-md border border-slate-300 bg-white p-2 text-center">
      <div className="text-base font-semibold text-slate-900">{node?.shortCode ?? fallback}</div>
      <div className="text-[10px] text-slate-500 mt-0.5 truncate">{node?.name ?? "Unknown node"}</div>
      <div className="text-[10px] text-slate-400 mt-1">
        {node ? `${node.type} ${node.voltageKv} kV` : "missing node"}
      </div>
    </div>
  );
}

function BridgePill({ label, value, tone }: { label: string; value: number; tone?: "blue" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-1 ${
        tone === "blue"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      <span className="font-semibold">{value}</span>
      {label}
    </span>
  );
}

function PdfStatusBadge({ status }: { status: string }) {
  const style: Record<string, string> = {
    text_layer: "bg-emerald-50 text-emerald-700 border-emerald-200",
    scanned_needs_ocr: "bg-amber-50 text-amber-700 border-amber-200",
    metadata_only: "bg-slate-50 text-slate-600 border-slate-200",
    failed: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span className={`inline-flex text-[10px] uppercase tracking-wider border rounded px-2 py-0.5 ${style[status] ?? style.metadata_only}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function EndpointConfidenceBadge({ confidence }: { confidence: string }) {
  const style: Record<string, string> = {
    high: "bg-emerald-50 text-emerald-700 border-emerald-200",
    medium: "bg-blue-50 text-blue-700 border-blue-200",
    low: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`inline-flex text-[10px] uppercase tracking-wider border rounded px-2 py-0.5 ${style[confidence] ?? style.medium}`}>
      {confidence}
    </span>
  );
}
