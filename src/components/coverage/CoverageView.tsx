import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { useProsetStore } from "../../store/useProsetStore";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { runGraphCoordinationChecks, summarizeGraphDiagnostics } from "../../lib/graph-coordination";
import {
  INVENTORY_MASTER_CASE_ID,
  networkLinesFromGraph,
  networkNodesFromGraph,
} from "../../domain/network-graph";
import { deriveStudyNetwork, getConfirmedMasterNetwork } from "../../domain/study-network";

export function CoverageView() {
  const activeLineId = useProsetStore((state) => state.activeNetworkLineId);
  const activeStudy = useProsetStore((state) =>
    state.studies.find((study) => study.id === state.activeStudyId)
  );
  const networkGraphOverride = useProsetStore(
    (state) => state.networkGraphOverrides[INVENTORY_MASTER_CASE_ID]
  );
  const ensureStudyForLine = useProsetStore((state) => state.ensureStudyForLine);
  const addCoordinationCheck = useProsetStore((state) => state.addCoordinationCheck);
  const linkToSettingCase = useProsetStore((state) => state.linkToSettingCase);
  const linkedSettingCase = useProsetStore((state) =>
    state.settingCases.find(
      (item) => item.protectedScope.subjectLineId === state.activeNetworkLineId
    )
  );
  const [savedCheckId, setSavedCheckId] = useState<string | null>(null);

  const masterNetwork = useMemo(
    () => getConfirmedMasterNetwork(networkGraphOverride),
    [networkGraphOverride]
  );
  const studyResolution = useMemo(
    () => deriveStudyNetwork(masterNetwork, activeStudy),
    [activeStudy, masterNetwork]
  );
  const networkGraph = studyResolution.network;
  const nodes = useMemo(
    () => (networkGraph ? networkNodesFromGraph(networkGraph) : []),
    [networkGraph]
  );
  const lines = useMemo(
    () => (networkGraph ? networkLinesFromGraph(networkGraph) : []),
    [networkGraph]
  );
  const masterNodes = useMemo(() => networkNodesFromGraph(masterNetwork), [masterNetwork]);
  const masterLines = useMemo(() => networkLinesFromGraph(masterNetwork), [masterNetwork]);
  const activeLine = lines.find((line) => line.id === activeLineId);
  const diagnostics = useMemo(
    () => (networkGraph ? runGraphCoordinationChecks(networkGraph) : []),
    [networkGraph]
  );
  const diagnosticsSummary = useMemo(
    () => summarizeGraphDiagnostics(diagnostics),
    [diagnostics]
  );
  const hasRelaySettings = Boolean(networkGraph?.relaySettings?.length);

  const handleSaveCoordinationCheck = () => {
    if (!activeLine) return;
    const checkId = addCoordinationCheck({
      caseId: linkedSettingCase?.id ?? INVENTORY_MASTER_CASE_ID,
      lineId: activeLine.id,
      diagnostics,
      errorCount: diagnosticsSummary.error,
      warningCount: diagnosticsSummary.warning,
      note: "Coordination check (coverage/selectivity/gap) dari graph-coordination.ts.",
    });
    if (linkedSettingCase) {
      linkToSettingCase(linkedSettingCase.id, { kind: "coordination", refId: checkId });
    }
    setSavedCheckId(checkId);
  };

  if (!studyResolution.ready || !activeLine) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-sm font-semibold text-amber-950">Coverage membutuhkan Study berbasis bay/line</h2>
        <p className="mt-1 text-xs text-amber-800">
          Pilih relasi confirmed master. Bila topologinya belum tersedia atau belum terkonfirmasi, lengkapi melalui Graph Builder terlebih dahulu.
        </p>
        {studyResolution.blockers.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-red-800">
            {studyResolution.blockers.map((message) => <li key={message}>- {message}</li>)}
          </ul>
        )}
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) void ensureStudyForLine(event.target.value);
          }}
          className="mt-4 w-full max-w-xl rounded border border-amber-300 bg-white px-3 py-2 text-sm focus:border-brand-accent focus:outline-none"
        >
          <option value="" disabled>Pilih bay/line untuk coverage...</option>
          {masterLines.map((line) => {
            const from = masterNodes.find((node) => node.id === line.fromNodeId);
            const to = masterNodes.find((node) => node.id === line.toNodeId);
            return (
              <option key={line.id} value={line.id}>
                {from?.shortCode ?? line.fromNodeId} - {to?.shortCode ?? line.toNodeId} {line.circuit}
              </option>
            );
          })}
        </select>
      </section>
    );
  }

  const fromNode = nodes.find((node) => node.id === activeLine.fromNodeId);
  const toNode = nodes.find((node) => node.id === activeLine.toNodeId);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-brand-accent/30 bg-brand-accent/10 px-4 py-3 text-xs text-brand-ink">
        <div className="font-semibold">
          Study: {activeStudy?.name} · {fromNode?.shortCode ?? activeLine.fromNodeId} - {toNode?.shortCode ?? activeLine.toNodeId} {activeLine.circuit}
        </div>
        <div className="mt-1 text-brand-accent-dark">
          Coverage dan coordination check memakai {lines.length} relasi pada frozen Study scope; tidak memakai corridor demo.
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Study Network</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Subject line dan relasi satu-hop yang terkonfirmasi di master graph.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {lines.map((line) => {
            const from = nodes.find((node) => node.id === line.fromNodeId);
            const to = nodes.find((node) => node.id === line.toNodeId);
            return (
              <div key={line.id} className={`rounded-md border p-3 ${line.id === activeLine.id ? "border-brand-accent/40 bg-brand-accent/10" : "border-slate-200 bg-slate-50"}`}>
                <div className="text-xs font-semibold text-slate-800">
                  {from?.shortCode ?? line.fromNodeId} - {to?.shortCode ?? line.toNodeId} {line.circuit}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Xline {line.lineXOhm?.toFixed(3) ?? "?"} ohm · confidence {line.confidence}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {hasRelaySettings ? (
        <>
          <DiagnosticsPanel diagnostics={diagnostics} />
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-slate-600">
                {diagnosticsSummary.error} error, {diagnosticsSummary.warning} warning
                {linkedSettingCase && (
                  <span className="ml-2 rounded-full border border-brand-accent/30 bg-brand-accent/10 px-2 py-0.5 text-brand-accent-dark">
                    Case: {linkedSettingCase.title}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleSaveCoordinationCheck}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
              >
                <Save className="h-3.5 w-3.5" />
                Save Coordination Check
              </button>
            </div>
            {savedCheckId && <p className="mt-2 text-xs text-emerald-700">Coordination Check tersimpan.</p>}
          </section>
        </>
      ) : (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          Study graph sudah tersedia, tetapi RelaySetting Z1/Z2/Z3 belum lengkap. Update setting relay agar diagnostics coverage dapat dihitung.
        </section>
      )}
    </div>
  );
}
