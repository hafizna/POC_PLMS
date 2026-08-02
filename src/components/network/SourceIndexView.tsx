import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, FileSearch, Loader2, Plus, ScanText, Trash2, Upload } from "lucide-react";
import {
  NETWORK_CASES,
  REGISTRY_SOURCES,
  RegistryConfidence,
} from "../../domain/seed-network-registry";
import { SLD_SOURCE_INDEX } from "../../domain/sld-source-index";
import {
  PDF_SOURCE_REGISTRY,
  filterPdfSourcesForNodes,
} from "../../domain/pdf-source-registry";
import { useProsetStore, type PdfTapPromotion, type SourceIntakeRecord } from "../../store/useProsetStore";
import { buildBridgeExport } from "../../domain/bridge-export";
import { buildUnifiedNetwork } from "../../domain/unified";
import type { UnifiedNetwork } from "../../domain/unified";
import {
  getEffectiveNetworkGraph,
  INVENTORY_MASTER_CASE_ID,
  mergeMasterRelationsIntoCase,
  networkLinesFromGraph,
  networkNodesFromGraph,
} from "../../domain/network-graph";
import type { NetworkNode } from "../../domain/seed-network-registry";
import { normalizeStationName } from "../../domain/normalization";
import { extractPdfText, extractTapFields, type OcrProgress } from "../../lib/ocr";
import { findFieldValue, getEffectiveCtVt, parseCtRatio, parseVtRatio } from "../../domain/instrument-transformers";
import { CROSSCHECK_WORKBOOK_REGISTRY } from "../../domain/crosscheck-workbook-registry";
import type { SourceSnapshot, StudyScenario } from "../../domain/engineering-data";

const confidenceClass: Record<RegistryConfidence, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-orange-50 text-orange-700 border-orange-200",
  missing: "bg-red-50 text-red-700 border-red-200",
};

type SourceIntakeInput = Omit<SourceIntakeRecord, "id" | "stagedAt" | "actor" | "status"> & {
  status?: SourceIntakeRecord["status"];
};

export function SourceIndexView() {
  const activeCaseId = useProsetStore((s) => s.activeNetworkCaseId);
  const openedFromCaseId = useProsetStore((s) => s.openedFromCaseId);
  const openedFromCase = useProsetStore((s) =>
    s.settingCases.find((item) => item.id === s.openedFromCaseId)
  );
  const setActiveCase = useProsetStore((s) => s.setActiveNetworkCase);
  const sourceIntakeRecords = useProsetStore((s) => s.sourceIntakeRecords);
  const addSourceIntakeRecord = useProsetStore((s) => s.addSourceIntakeRecord);
  const updateSourceIntakeRecord = useProsetStore((s) => s.updateSourceIntakeRecord);
  const removeSourceIntakeRecord = useProsetStore((s) => s.removeSourceIntakeRecord);
  const linkToSettingCase = useProsetStore((s) => s.linkToSettingCase);
  const unlinkFromSettingCase = useProsetStore((s) => s.unlinkFromSettingCase);
  const addPdfTapPromotion = useProsetStore((s) => s.addPdfTapPromotion);
  const removePdfTapPromotion = useProsetStore((s) => s.removePdfTapPromotion);
  const updateCtVtOverride = useProsetStore((s) => s.updateCtVtOverride);
  const ctVtOverrides = useProsetStore((s) => s.ctVtOverrides);
  const pdfTapPromotions = useProsetStore((s) => s.pdfTapPromotions);
  const networkGraphOverrides = useProsetStore((s) => s.networkGraphOverrides);
  const sourceSnapshots = useProsetStore((s) => s.sourceSnapshots);
  const studyScenarios = useProsetStore((s) => s.studyScenarios);
  const activeCase =
    NETWORK_CASES.find((item) => item.id === activeCaseId) ?? NETWORK_CASES[0];
  const inventoryCase =
    NETWORK_CASES.find((item) => item.id === INVENTORY_MASTER_CASE_ID) ?? activeCase;
  const sources = REGISTRY_SOURCES.filter((s) => activeCase.sourceIds.includes(s.id));
  const intakeScopeId = openedFromCaseId ?? activeCase.id;
  const stagedSources = sourceIntakeRecords.filter((record) => record.caseId === intakeScopeId);
  const frozenBaselineSourceIds = new Set(
    openedFromCase?.baseline?.evidence.map((item) => item.sourceIntakeId) ?? []
  );
  const proposedRevisionSourceIds = new Set(
    openedFromCase?.proposedDataRevisions.flatMap((revision) =>
      revision.sourceEvidenceIds
    ) ?? []
  );
  const protectedSourceIds = new Set([
    ...frozenBaselineSourceIds,
    ...proposedRevisionSourceIds,
  ]);
  const addCaseScopedSource = (record: SourceIntakeInput) => {
    const recordId = addSourceIntakeRecord({ ...record, caseId: intakeScopeId });
    if (openedFromCaseId) {
      linkToSettingCase(openedFromCaseId, { kind: "source", refId: recordId });
    }
    return recordId;
  };
  const removeCaseScopedSource = (recordId: string) => {
    // Frozen baseline evidence is immutable. Change evidence linked after the
    // freeze remains removable until it is used by a later governed artifact.
    if (protectedSourceIds.has(recordId)) return;
    if (openedFromCaseId) {
      unlinkFromSettingCase(openedFromCaseId, { kind: "source", refId: recordId });
    }
    removeSourceIntakeRecord(recordId);
  };

  // Build available line list from effective network graph (includes user-added
  // relations) so promote picker offers all current lines, not just seed.
  const effectiveNetworkGraph = useMemo(() => {
    const fallbackNetworkGraph = buildUnifiedNetwork(activeCase);
    const base = getEffectiveNetworkGraph(activeCase.id, networkGraphOverrides[activeCase.id], fallbackNetworkGraph);
    const master = getEffectiveNetworkGraph(
      INVENTORY_MASTER_CASE_ID,
      networkGraphOverrides[INVENTORY_MASTER_CASE_ID],
      buildUnifiedNetwork(inventoryCase)
    );
    return mergeMasterRelationsIntoCase(base, master);
  }, [activeCase, inventoryCase, networkGraphOverrides]);
  const effectiveNodes = useMemo(
    () => (effectiveNetworkGraph ? networkNodesFromGraph(effectiveNetworkGraph) : activeCase.nodes),
    [activeCase.nodes, effectiveNetworkGraph]
  );
  const sldStationRows = useMemo(() => getCaseSldStationRows(effectiveNodes), [effectiveNodes]);
  const pdfSources = useMemo(() => filterPdfSourcesForNodes(effectiveNodes), [effectiveNodes]);
  const availableLines = useMemo(() => {
    if (!effectiveNetworkGraph) return [];
    const nodes = networkNodesFromGraph(effectiveNetworkGraph);
    const lines = networkLinesFromGraph(effectiveNetworkGraph);
    return lines.map((line) => {
      const from = nodes.find((n) => n.id === line.fromNodeId);
      const to = nodes.find((n) => n.id === line.toNodeId);
      return {
        id: line.id,
        label: `${from?.shortCode ?? "?"} - ${to?.shortCode ?? "?"} ${line.circuit}`,
      };
    });
  }, [effectiveNetworkGraph]);

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-blue-50 border border-blue-200 p-2">
              <FileSearch className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Source Index</h2>
              <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
                Direktori dokumen sumber yang dipakai PLMS: SLD folder, PDF TAP setting, Excel registry, dan file actual setting.
                Untuk endpoint candidate dan promote SLD, lihat Network Model.
              </p>
            </div>
          </div>
          <select
            value={activeCase.id}
            onChange={(e) => setActiveCase(e.target.value)}
            className="bg-white text-sm px-3 py-1.5 rounded border border-slate-300 focus:border-blue-500 focus:outline-none"
          >
            {NETWORK_CASES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
      </section>

      {openedFromCaseId && openedFromCase && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            Case-scoped source intake
          </div>
          <div className="mt-1 text-sm font-semibold text-emerald-950">
            {openedFromCase.title}
          </div>
          <p className="mt-1 text-xs text-emerald-800">
            {openedFromCase.baseline
              ? "Dokumen baru otomatis ditautkan sebagai evidence perubahan. Frozen baseline tetap utuh dan tidak ikut berubah."
              : "Upload dokumen bersifat opsional untuk membekukan baseline. Jika tidak ada source baru, langsung kembali ke case dan pilih Bekukan baseline."}
          </p>
        </section>
      )}

      <SourceIntakePanel
        caseId={activeCase.id}
        records={stagedSources}
        onAdd={addCaseScopedSource}
        onUpdate={updateSourceIntakeRecord}
        onRemove={removeCaseScopedSource}
        protectedSourceIds={protectedSourceIds}
        frozenBaselineSourceIds={frozenBaselineSourceIds}
        availableLines={availableLines}
        promotions={pdfTapPromotions.filter((p) => p.caseId === activeCase.id)}
        onPromote={addPdfTapPromotion}
        onUnpromote={removePdfTapPromotion}
        networkGraph={effectiveNetworkGraph}
        ctVtOverrides={ctVtOverrides}
        onUpdateCtVt={updateCtVtOverride}
      />

      <BridgeExportPanel
        caseId={activeCase.id}
        caseTitle={activeCase.title}
        networkGraph={effectiveNetworkGraph}
      />

      <EngineeringSnapshotPanel
        snapshots={sourceSnapshots}
        scenarios={studyScenarios}
      />

      <LegacyCrosscheckWorkbookPanel />

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2 bg-slate-50 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">PDF Source Registry</h3>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {PDF_SOURCE_REGISTRY.summary.fileCount} PDFs indexed |{" "}
              {PDF_SOURCE_REGISTRY.summary.byDocumentType["sld"] ?? 0} SLD |{" "}
              {PDF_SOURCE_REGISTRY.summary.byDocumentType["tap_setting"] ?? 0} TAP |{" "}
              {PDF_SOURCE_REGISTRY.summary.byExtractionStatus["scanned_needs_ocr"] ?? 0} needs OCR
            </div>
          </div>
          <span className="text-[10px] px-2 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-700">
            {pdfSources.length} in case scope
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Document</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Extraction</th>
                <th className="text-left px-4 py-2 font-medium">Hints</th>
                <th className="text-left px-4 py-2 font-medium">Preview</th>
              </tr>
            </thead>
            <tbody>
              {pdfSources.slice(0, 16).map((record) => (
                <tr key={record.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-2 align-top max-w-80">
                    <div className="font-semibold text-slate-900 truncate">{record.fileName}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {record.pageCount ?? "?"} page{record.pageCount === 1 ? "" : "s"} | {Math.round(record.sizeBytes / 1024)} KB
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <span className="text-[10px] px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">
                      {record.documentType.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <PdfStatusBadge status={record.extractionStatus} />
                    <div className="text-[10px] text-slate-400 mt-1">{record.textCharCount} chars</div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="flex flex-wrap gap-1 max-w-72">
                      {[...record.stationHints, ...record.relayHints, ...record.functionHints].slice(0, 8).map((hint) => (
                        <span key={hint} className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">
                          {hint}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top text-xs text-slate-600 max-w-96">
                    <div className="line-clamp-2">
                      {record.textPreview || "No text layer. OCR required before automatic TAP/SLD extraction."}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2 bg-slate-50 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">SLD Source Directory Index</h3>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {SLD_SOURCE_INDEX.summary.fileCount} files | {SLD_SOURCE_INDEX.summary.stationCount} station folders | {SLD_SOURCE_INDEX.summary.byExtension[".pdf"] ?? 0} PDF | {SLD_SOURCE_INDEX.summary.byExtension[".vsd"] ?? 0} VSD
            </div>
          </div>
          <span className="text-[10px] px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700">network graph source</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Station Folder</th>
                <th className="text-left px-4 py-2 font-medium">Files</th>
                <th className="text-left px-4 py-2 font-medium">Kinds</th>
                <th className="text-left px-4 py-2 font-medium">Latest Source</th>
              </tr>
            </thead>
            <tbody>
              {sldStationRows.map((row) => (
                <tr key={row.stationFolder} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-2 align-top">
                    <div className="font-semibold text-slate-900">{row.stationFolder}</div>
                    <div className="text-[10px] text-slate-400">{row.singleLineCount} single-line source{row.singleLineCount === 1 ? "" : "s"}</div>
                  </td>
                  <td className="px-4 py-2 align-top text-xs text-slate-600">
                    {row.fileCount} file{row.fileCount === 1 ? "" : "s"}
                    <div className="text-[10px] text-slate-400 mt-0.5">{row.extensions.join(", ")}</div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="flex flex-wrap gap-1">
                      {row.kinds.map((kind) => (
                        <span key={kind} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">{kind.replace(/_/g, " ")}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top text-xs text-slate-600 max-w-96">
                    <div className="truncate">{row.latestFileName}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{formatDate(row.latestModified)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2 bg-slate-50 flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-slate-500" />
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Registry Sources</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {sources.map((source) => (
            <div key={source.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">{source.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{source.kind}</div>
                </div>
                <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded border uppercase tracking-wider ${confidenceClass[source.confidence]}`}>
                  {source.confidence}
                </span>
              </div>
              <div className="text-xs text-slate-600 mt-2">{source.scope}</div>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-500">
                {source.status === "parsed" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                )}
                {source.status}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function EngineeringSnapshotPanel({
  snapshots,
  scenarios,
}: {
  snapshots: SourceSnapshot[];
  scenarios: StudyScenario[];
}) {
  return (
    <section className="bg-white border border-blue-200 rounded-lg overflow-hidden">
      <div className="border-b border-blue-200 px-4 py-3 bg-blue-50 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2">
          <Database className="w-4 h-4 text-blue-700 mt-0.5" />
          <div>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-blue-900">
              Versioned Engineering Sources
            </h3>
            <div className="text-[10px] text-blue-700 mt-0.5">
              Satu file dapat menghasilkan beberapa logical snapshots. Status historical tidak
              sama dengan current engineering truth.
            </div>
          </div>
        </div>
        <span className="text-[10px] px-2 py-1 rounded border border-blue-200 bg-white text-blue-700">
          {snapshots.length} snapshots · {scenarios.length} scenarios
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-white border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Snapshot</th>
              <th className="text-left px-4 py-2 font-semibold">Dataset</th>
              <th className="text-left px-4 py-2 font-semibold">Revision / effective</th>
              <th className="text-left px-4 py-2 font-semibold">Provenance</th>
              <th className="text-left px-4 py-2 font-semibold">State</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((snapshot) => (
              <tr key={snapshot.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-4 py-3 align-top">
                  <div className="font-semibold text-slate-900">{snapshot.label}</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">{snapshot.id}</div>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="text-slate-700">{snapshot.kind}</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {snapshot.sourcePartition ?? "whole source"} · {snapshot.recordCount ?? "?"} records
                  </div>
                </td>
                <td className="px-4 py-3 align-top text-slate-700">
                  <div>{snapshot.networkRevisionId ?? "not applicable"}</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {snapshot.effectiveAt?.slice(0, 10) ??
                      snapshot.effectivePeriodLabel ??
                      "effective date unknown"}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="text-slate-700">{snapshot.sourceSystem}</div>
                  <div className="text-[10px] font-mono text-slate-500 mt-1">
                    {snapshot.checksum.algorithm}:{snapshot.checksum.value}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    captured {snapshot.capturedAt.slice(0, 10)}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <span
                    className={`inline-flex text-[10px] px-2 py-0.5 rounded border ${
                      snapshot.state === "historical"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {snapshot.state}
                  </span>
                  {snapshot.notes[0] && (
                    <div className="text-[10px] text-slate-500 mt-2 max-w-80">
                      {snapshot.notes[0]}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LegacyCrosscheckWorkbookPanel() {
  const registry = CROSSCHECK_WORKBOOK_REGISTRY;
  const distanceCase = registry.legacyCases.distance as {
    localSubstation?: string;
    subjectBay?: string;
    remoteSubstation?: string;
    fault3phKa?: number | null;
    fault1phKa?: number | null;
    cccA?: number | null;
    ctPrimaryA?: number | null;
    ctSecondaryA?: number | null;
    ptPrimaryV?: number | null;
    ptSecondaryV?: number | null;
    selectedLines?: Array<{
      slot: string;
      name: string;
      lengthKm: number | null;
      zOhm: number | null;
      x1Ohm: number | null;
      type: string;
    }>;
    outputs?: Record<string, number | string | null>;
  };
  const ocrGfrCase = registry.legacyCases.ocrGfr as {
    substation?: string;
    bay?: string;
    cccOrTsaA?: number | null;
    ctPrimaryA?: number | null;
    ctSecondaryA?: number | null;
    fault3phA?: number | null;
    fault1phA?: number | null;
    outputs?: Record<string, number | string | null>;
  };

  const selectedLines = distanceCase.selectedLines?.filter((line) => line.name) ?? [];

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-2 bg-slate-50 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Legacy Crosscheck Workbook</h3>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Spreadsheet existing sebagai blueprint PLMS: DIgSILENT DB, IHS fault level, bay selector, Distance, dan OCR/GFR check.
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-[10px] px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700">
            {registry.summary.lineRecordCount} line DB
          </span>
          <span className="text-[10px] px-2 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-700">
            {registry.summary.faultRecordCount} IHS fault
          </span>
          <span className="text-[10px] px-2 py-1 rounded border border-slate-200 bg-white text-slate-600">
            {registry.summary.formulaCount} formulas
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 divide-y xl:divide-y-0 xl:divide-x divide-slate-100">
        <div className="p-4">
          <div className="text-xs font-semibold text-slate-700 mb-3">Active Distance Case</div>
          <div className="space-y-2 text-xs">
            <InfoRow label="GI lokal" value={distanceCase.localSubstation} />
            <InfoRow label="Bay dihitung" value={distanceCase.subjectBay} />
            <InfoRow label="GI lawan" value={distanceCase.remoteSubstation} />
            <InfoRow label="Fault 3ph / 1ph" value={`${formatMaybeNumber(distanceCase.fault3phKa)} / ${formatMaybeNumber(distanceCase.fault1phKa)} kA`} />
            <InfoRow label="CCC" value={`${formatMaybeNumber(distanceCase.cccA)} A`} />
            <InfoRow label="CT / PT" value={`${formatMaybeNumber(distanceCase.ctPrimaryA)}/${formatMaybeNumber(distanceCase.ctSecondaryA)} | ${formatMaybeNumber(distanceCase.ptPrimaryV)}/${formatMaybeNumber(distanceCase.ptSecondaryV)}`} />
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-semibold text-slate-700 mb-3">Selected Corridor Lines</div>
          <div className="space-y-2">
            {selectedLines.map((line) => (
              <div key={`${line.slot}-${line.name}`} className="border border-slate-200 rounded-md p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-900">{line.slot} | {line.name}</div>
                  <span className="text-[10px] text-slate-500">{formatMaybeNumber(line.lengthKm)} km</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  Z {formatMaybeNumber(line.zOhm)} ohm | X1 {formatMaybeNumber(line.x1Ohm)} ohm
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{line.type || "-"}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-semibold text-slate-700 mb-3">Legacy Outputs</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <MetricBox label="Z1 pri/sec" value={`${formatOutput(distanceCase.outputs?.z1PrimaryOhm)} / ${formatOutput(distanceCase.outputs?.z1SecondaryOhm)}`} />
            <MetricBox label="Z2 pri/sec" value={`${formatOutput(distanceCase.outputs?.z2PrimaryOhm)} / ${formatOutput(distanceCase.outputs?.z2SecondaryOhm)}`} />
            <MetricBox label="Z3 pri/sec" value={`${formatOutput(distanceCase.outputs?.z3PrimaryOhm)} / ${formatOutput(distanceCase.outputs?.z3SecondaryOhm)}`} />
            <MetricBox label="tZ1/tZ2/tZ3" value={`${formatOutput(distanceCase.outputs?.tZ1S)} / ${formatOutput(distanceCase.outputs?.tZ2S)} / ${formatOutput(distanceCase.outputs?.tZ3S)} s`} />
            <MetricBox label="OCR pickup" value={`${formatOutput(ocrGfrCase.outputs?.ocrPickupPrimaryA)} A`} />
            <MetricBox label="GFR pickup" value={`${formatOutput(ocrGfrCase.outputs?.gfrPickupPrimaryA)} A`} />
          </div>
          <div className="mt-3 text-[10px] text-slate-500">
            Next bridge: gunakan DB/IHS ini untuk case-scoped scenario readiness dan benchmark Formula Lab terhadap hasil spreadsheet lama.
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1 last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900 text-right">{value ?? "-"}</span>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 rounded-md p-2 bg-slate-50">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-semibold text-slate-900 mt-1">{value}</div>
    </div>
  );
}

function formatMaybeNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number(value).toLocaleString("id-ID", { maximumFractionDigits: 3 });
}

function formatOutput(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return formatMaybeNumber(value);
  return value;
}

const documentTypeOptions: { value: SourceIntakeRecord["documentType"]; label: string }[] = [
  { value: "sld", label: "SLD / single line" },
  { value: "tap_setting", label: "TAP setting PDF" },
  { value: "excel_registry", label: "Excel registry" },
  { value: "relay_export", label: "Relay export / actual" },
  { value: "ba_supporting", label: "BA / supporting doc" },
  { value: "other", label: "Other" },
];

function BridgeExportPanel({
  caseId,
  caseTitle,
  networkGraph,
}: {
  caseId: string;
  caseTitle: string;
  networkGraph: UnifiedNetwork | undefined;
}) {
  const decisions = useProsetStore((s) => s.candidateDecisions);
  const pdfTapPromotions = useProsetStore((s) => s.pdfTapPromotions);

  const exportData = useMemo(() => {
    if (!networkGraph) return null;
    try {
      return buildBridgeExport({ caseId, caseTitle, networkGraph, decisions, pdfTapPromotions });
    } catch (err) {
      console.error("Bridge export build failed", err);
      return null;
    }
  }, [caseId, caseTitle, networkGraph, decisions, pdfTapPromotions]);

  const handleDownload = () => {
    if (!exportData) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `plms-bridge-export-${caseId}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = async () => {
    if (!exportData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    } catch (err) {
      console.error("Clipboard copy failed", err);
    }
  };

  if (!networkGraph) {
    return null;
  }

  return (
    <section className="bg-white border border-violet-200 rounded-lg overflow-hidden">
      <div className="border-b border-violet-200 px-4 py-2 bg-violet-50 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-violet-800">
            NMM Bridge Export
          </h3>
          <div className="text-[10px] text-violet-700 mt-0.5">
            Structured JSON sesuai `docs/08_PLMS_CGMES_BRIDGE.md` di project NMM. Consume via{" "}
            <span className="font-mono">python -m pln_nmm.cli plms-inspect</span>.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyToClipboard}
            disabled={!exportData}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-violet-300 bg-white text-violet-700 hover:bg-violet-100 disabled:opacity-50"
          >
            Copy JSON
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!exportData}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-violet-500 bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            Download JSON
          </button>
        </div>
      </div>

      {exportData ? (
        <div className="p-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-3">
            <BridgeStatTile label="Substations" value={exportData.meta.sourceArtifactCounts.substations} />
            <BridgeStatTile label="Busbars" value={exportData.meta.sourceArtifactCounts.busbars} />
            <BridgeStatTile label="Bays" value={exportData.meta.sourceArtifactCounts.bays} />
            <BridgeStatTile label="Line Relations" value={exportData.meta.sourceArtifactCounts.lineRelations} />
            <BridgeStatTile label="IEDs" value={exportData.meta.sourceArtifactCounts.relayIeds} />
            <BridgeStatTile label="Setting Records" value={exportData.meta.sourceArtifactCounts.protectionSettings} />
            <BridgeStatTile label="LCD+DIST matched" value={exportData.meta.sourceArtifactCounts.lcdDistRecords} />
            <BridgeStatTile label="OCR matched" value={exportData.meta.sourceArtifactCounts.ocrRecords} />
            <BridgeStatTile label="PDF promotions" value={exportData.meta.sourceArtifactCounts.pdfTapPromotions} />
            <BridgeStatTile label="Sources" value={exportData.sources.length} />
          </div>

          <div className="rounded-md border border-violet-100 bg-violet-50/50 p-3">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-violet-700 mb-1">
              Confidence mix
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-700">
                high: {exportData.meta.confidenceMix.high}
              </span>
              <span className="px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700">
                medium: {exportData.meta.confidenceMix.medium}
              </span>
              <span className="px-2 py-0.5 rounded border border-red-300 bg-red-50 text-red-700">
                low: {exportData.meta.confidenceMix.low}
              </span>
            </div>
          </div>

          {exportData.meta.notes.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-100 bg-amber-50/40 p-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 mb-1">
                Notes untuk NMM consumer
              </div>
              <ul className="space-y-1">
                {exportData.meta.notes.map((note, idx) => (
                  <li key={idx} className="text-[11px] text-amber-900 flex gap-2">
                    <span className="text-amber-500">-</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="mt-3">
            <summary className="text-[11px] text-violet-700 cursor-pointer hover:underline">
              Preview first 100 lines of JSON
            </summary>
            <pre className="mt-2 max-h-72 overflow-auto text-[10px] bg-slate-900 text-slate-100 rounded p-3 font-mono">
              {JSON.stringify(exportData, null, 2).split("\n").slice(0, 100).join("\n")}
            </pre>
          </details>
        </div>
      ) : (
        <div className="p-4 text-xs text-slate-500">
          Network Graph belum tersedia untuk case ini. Tambah substation/relation via Network Builder.
        </div>
      )}
    </section>
  );
}

function BridgeStatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-violet-200 bg-violet-50/50 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-violet-600 font-medium">{label}</div>
      <div className="text-sm font-semibold text-violet-900">{value}</div>
    </div>
  );
}

function SourceIntakePanel({
  caseId,
  records,
  onAdd,
  onUpdate,
  onRemove,
  protectedSourceIds,
  frozenBaselineSourceIds,
  availableLines,
  promotions,
  onPromote,
  onUnpromote,
  networkGraph,
  ctVtOverrides,
  onUpdateCtVt,
}: {
  caseId: string;
  records: SourceIntakeRecord[];
  onAdd: (record: SourceIntakeInput) => string;
  onUpdate: (id: string, patch: Partial<SourceIntakeRecord>) => void;
  onRemove: (id: string) => void;
  protectedSourceIds: ReadonlySet<string>;
  frozenBaselineSourceIds: ReadonlySet<string>;
  availableLines: { id: string; label: string }[];
  promotions: PdfTapPromotion[];
  onPromote: (record: Omit<PdfTapPromotion, "id" | "promotedAt" | "actor" | "status"> & { status?: PdfTapPromotion["status"] }) => string;
  onUnpromote: (id: string) => void;
  networkGraph?: UnifiedNetwork;
  ctVtOverrides: ReturnType<typeof useProsetStore.getState>["ctVtOverrides"];
  onUpdateCtVt: ReturnType<typeof useProsetStore.getState>["updateCtVtOverride"];
}) {
  const [fileName, setFileName] = useState("");
  const [sizeBytes, setSizeBytes] = useState<number | undefined>(undefined);
  const [documentType, setDocumentType] = useState<SourceIntakeRecord["documentType"]>("sld");
  const [stationHint, setStationHint] = useState("");
  const [bayHint, setBayHint] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // PDF File object kept in local state only; not persisted. OCR runs once
  // on submit, result text + extracted fields stored on the record.
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);

  const isPdf = pickedFile?.type === "application/pdf" || /\.pdf$/i.test(fileName);

  const runExtraction = async (recordId: string, file: File) => {
    setOcrProgress({ phase: "loading" });
    try {
      const result = await extractPdfText(file, setOcrProgress, { maxPages: 8 });
      const fields = extractTapFields(result.fullText);
      onUpdate(recordId, {
        status: "extracted",
        extractionMethod: result.method,
        extractedTextPreview: result.fullText.slice(0, 500),
        extractedPageCount: result.pageCount,
        extractionDurationMs: Math.round(result.durationMs),
        extractedFields: fields.length > 0 ? fields : undefined,
      });
    } catch (err) {
      console.error("OCR extraction failed", err);
      onUpdate(recordId, {
        status: "extract_failed",
        extractionMethod: "failed",
        note: `OCR error: ${(err as Error).message}`,
      });
    } finally {
      setOcrProgress(null);
    }
  };

  const submit = () => {
    setError(null);
    if (!fileName.trim()) {
      setError("Isi nama file/source atau pilih file lokal dulu.");
      return;
    }
    const willOcr = !!pickedFile && isPdf && documentType !== "relay_export";
    const initialStatus: SourceIntakeRecord["status"] =
      documentType === "relay_export" && fileName.toLowerCase().endsWith(".set")
        ? "unsupported"
        : willOcr
        ? "extracting"
        : "staged";
    const recordId = onAdd({
      caseId,
      fileName: fileName.trim(),
      sizeBytes,
      documentType,
      stationHint: stationHint.trim() || undefined,
      bayHint: bayHint.trim() || undefined,
      note: note.trim() || undefined,
      status: initialStatus,
    });
    if (willOcr && pickedFile) {
      void runExtraction(recordId, pickedFile);
    }
    setFileName("");
    setSizeBytes(undefined);
    setStationHint("");
    setBayHint("");
    setNote("");
    setPickedFile(null);
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-2 bg-slate-50 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Source Intake / Greenfield Staging</h3>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Tempat upload/stage dokumen untuk GI expansion atau data yang belum ada di master inventory. POC ini menyimpan metadata file dulu, parsing otomatis menyusul.
          </div>
        </div>
        <span className="text-[10px] px-2 py-1 rounded border border-cyan-200 bg-cyan-50 text-cyan-700">
          {records.length} staged
        </span>
      </div>

      <div className="p-4 grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_1fr] gap-4">
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3">
          <label className="flex flex-col items-center justify-center gap-2 rounded border border-slate-200 bg-white px-3 py-5 text-center cursor-pointer hover:border-blue-300">
            <Upload className="w-5 h-5 text-blue-600" />
            <div>
              <div className="text-xs font-semibold text-slate-700">Pilih file lokal atau isi source name manual</div>
              <div className="text-[10px] text-slate-500 mt-0.5">PDF, XLSX, CSV, SET, atau dokumen pendukung</div>
            </div>
            <input
              type="file"
              className="hidden"
              accept=".pdf,.xlsx,.csv,.set"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setFileName(file.name);
                setSizeBytes(file.size);
                setPickedFile(file);
              }}
            />
            {pickedFile && isPdf && (
              <div className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 mt-2 flex items-center gap-1.5">
                <ScanText className="w-3 h-3" />
                PDF terdeteksi. OCR auto-run setelah Stage (max 8 halaman).
              </div>
            )}
          </label>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <TextInput label="Source / file name" value={fileName} onChange={setFileName} placeholder="SLD GI Baru.pdf" />
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Document type</span>
              <select
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value as SourceIntakeRecord["documentType"])}
                className="bg-white text-xs px-2 py-1 rounded border border-slate-300 focus:border-blue-500 focus:outline-none"
              >
                {documentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <TextInput label="Station hint" value={stationHint} onChange={setStationHint} placeholder="GIS Kembangan" />
            <TextInput label="Bay / relation hint" value={bayHint} onChange={setBayHint} placeholder="PIK - Kembangan #1" />
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Note</span>
              <input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Dokumen expansion, belum ada di current database"
                className="bg-white text-xs px-2 py-1 rounded border border-slate-300 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>
          {error && <div className="mt-2 text-[11px] text-red-700">{error}</div>}
          <button
            type="button"
            onClick={submit}
            disabled={!!ocrProgress}
            className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            Stage source
          </button>
          {ocrProgress && (
            <div className="mt-2 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>
                {ocrProgress.phase === "loading" && "Loading pdf.js..."}
                {ocrProgress.phase === "text-layer" &&
                  `Text-layer extract page ${ocrProgress.pageNumber ?? "?"}/${ocrProgress.pageCount ?? "?"}`}
                {ocrProgress.phase === "ocr-rendering" &&
                  `Rendering page ${ocrProgress.pageNumber ?? "?"}/${ocrProgress.pageCount ?? "?"} for OCR`}
                {ocrProgress.phase === "ocr-recognizing" &&
                  `OCR recognizing... ${
                    ocrProgress.pageProgress !== undefined
                      ? Math.round(ocrProgress.pageProgress * 100) + "%"
                      : ""
                  }`}
                {ocrProgress.phase === "done" && "Done"}
              </span>
            </div>
          )}
        </div>

        <div className="rounded-md border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 bg-white border-b border-slate-200 text-[11px] text-slate-500">
            Staged sources menjadi input review: buat station/relation di Network Builder, lalu mapping setting diproses lewat Inbox.
          </div>
          {records.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-slate-500">
              Belum ada staged source untuk case ini.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-auto">
              {records.map((record) => {
                const recordPromotions = promotions.filter((p) => p.sourceIntakeId === record.id);
                const isProtectedEvidence = protectedSourceIds.has(record.id);
                const isFrozenBaselineEvidence = frozenBaselineSourceIds.has(record.id);
                return (
                <div key={record.id} className="px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-900 truncate">{record.fileName}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {formatDocumentType(record.documentType)} | {record.sizeBytes ? `${Math.round(record.sizeBytes / 1024)} KB` : "manual metadata"} | {formatDate(record.stagedAt)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        {[record.stationHint, record.bayHint, record.note].filter(Boolean).join(" | ") || "No hints"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isProtectedEvidence && (
                        <span className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-600">
                          {isFrozenBaselineEvidence ? "frozen baseline" : "proposal evidence"}
                        </span>
                      )}
                      <IntakeStatusBadge status={record.status} />
                      <button
                        type="button"
                        onClick={() => onRemove(record.id)}
                        disabled={isProtectedEvidence}
                        title={
                          isProtectedEvidence
                            ? "Evidence ini sudah direferensikan oleh artifact immutable."
                            : "Hapus evidence dari case"
                        }
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-transparent disabled:hover:text-slate-500"
                      >
                        <Trash2 className="w-3 h-3" />
                        remove
                      </button>
                    </div>
                  </div>
                  {record.status === "extracted" && (
                    <div className="mt-2 ml-1 border-l-2 border-emerald-300 pl-2">
                      <div className="flex items-center gap-2 text-[10px] text-emerald-700">
                        <ScanText className="w-3 h-3" />
                        <span className="font-semibold">
                          {record.extractionMethod === "ocr" ? "OCR" : "Text-layer"} extract
                        </span>
                        <span className="text-slate-500">
                          {record.extractedPageCount ?? "?"} pages | {Math.round((record.extractionDurationMs ?? 0) / 100) / 10}s
                        </span>
                      </div>
                      {record.extractedFields && record.extractedFields.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {record.extractedFields.map((f, idx) => (
                            <span
                              key={`${f.field}-${idx}`}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700"
                              title={f.field}
                            >
                              {f.field}: {f.value}{f.unit ? ` ${f.unit}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      {record.extractedTextPreview && (
                        <div className="mt-1 text-[10px] text-slate-500 italic line-clamp-2 font-mono">
                          {record.extractedTextPreview}
                        </div>
                      )}
                    </div>
                  )}
                  {record.status === "extracting" && (
                    <div className="mt-2 ml-1 text-[10px] text-blue-700 flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Extracting...
                    </div>
                  )}
                  {record.status === "extract_failed" && (
                    <div className="mt-2 ml-1 text-[10px] text-red-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3" />
                      OCR failed — coba PDF lain atau cek console
                    </div>
                  )}

                  {/* Promote to line */}
                  {record.status === "extracted" && record.extractedFields && record.extractedFields.length > 0 && (
                    <PromotePanel
                      record={record}
                      caseId={caseId}
                      availableLines={availableLines}
                      promotions={recordPromotions}
                      onPromote={onPromote}
                      onUnpromote={onUnpromote}
                      networkGraph={networkGraph}
                      ctVtOverrides={ctVtOverrides}
                      onUpdateCtVt={onUpdateCtVt}
                    />
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="bg-white text-xs px-2 py-1 rounded border border-slate-300 focus:border-blue-500 focus:outline-none"
      />
    </label>
  );
}

function formatDocumentType(value: SourceIntakeRecord["documentType"]) {
  return documentTypeOptions.find((option) => option.value === value)?.label ?? value;
}

function PromotePanel({
  record,
  caseId,
  availableLines,
  promotions,
  onPromote,
  onUnpromote,
  networkGraph,
  ctVtOverrides,
  onUpdateCtVt,
}: {
  record: SourceIntakeRecord;
  caseId: string;
  availableLines: { id: string; label: string }[];
  promotions: PdfTapPromotion[];
  onPromote: (record: Omit<PdfTapPromotion, "id" | "promotedAt" | "actor" | "status"> & { status?: PdfTapPromotion["status"] }) => string;
  onUnpromote: (id: string) => void;
  networkGraph?: UnifiedNetwork;
  ctVtOverrides: ReturnType<typeof useProsetStore.getState>["ctVtOverrides"];
  onUpdateCtVt: ReturnType<typeof useProsetStore.getState>["updateCtVtOverride"];
}) {
  const handlePromote = (lineId: string) => {
    if (!lineId || !record.extractedFields) return;
    onPromote({
      sourceIntakeId: record.id,
      caseId,
      lineId,
      fileName: record.fileName,
      fields: record.extractedFields.map((f) => ({
        field: f.field,
        value: f.value,
        unit: f.unit,
      })),
      status: "imported",
    });
    promoteInstrumentTransformers(lineId, record, networkGraph, ctVtOverrides, onUpdateCtVt);
  };

  return (
    <div className="mt-2 ml-1 border-l-2 border-violet-300 pl-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-violet-700">
          Promote to line
        </span>
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              handlePromote(e.target.value);
              e.currentTarget.value = "";
            }
          }}
          className="bg-white text-[11px] px-2 py-0.5 rounded border border-violet-300 text-violet-700 hover:bg-violet-50 focus:border-violet-500 focus:outline-none"
        >
          <option value="" disabled>
            Map fields to line...
          </option>
          {availableLines.length === 0 && (
            <option value="" disabled>
              (no lines in case)
            </option>
          )}
          {availableLines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.label}
            </option>
          ))}
        </select>
      </div>
      {promotions.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {promotions.map((p) => {
            const lineLabel = availableLines.find((l) => l.id === p.lineId)?.label ?? p.lineId;
            return (
              <div key={p.id} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="text-violet-700">
                  → {lineLabel} <span className="text-slate-500">({p.fields.length} fields, {p.status})</span>
                </span>
                <button
                  type="button"
                  onClick={() => onUnpromote(p.id)}
                  className="text-slate-400 hover:text-red-600"
                  title="Remove promotion"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function promoteInstrumentTransformers(
  lineId: string,
  record: SourceIntakeRecord,
  networkGraph: UnifiedNetwork | undefined,
  ctVtOverrides: ReturnType<typeof useProsetStore.getState>["ctVtOverrides"],
  onUpdateCtVt: ReturnType<typeof useProsetStore.getState>["updateCtVtOverride"]
) {
  if (!networkGraph || !record.extractedFields) return;
  const relation = networkGraph.lineRelations.find((item) => item.id === lineId);
  if (!relation) return;

  const ct = parseCtRatio(findFieldValue(record.extractedFields, /^CT/i), record.fileName);
  const vt = parseVtRatio(findFieldValue(record.extractedFields, /^(VT|PT)/i), record.fileName);
  if (!ct && !vt) return;

  const relationIeds = networkGraph.relayIeds.filter(
    (ied) => ied.bayId === relation.fromBayId || ied.bayId === relation.toBayId
  );
  for (const ied of relationIeds) {
    const effective = getEffectiveCtVt(ied, ctVtOverrides);
    const nextCt = effective.ct ? undefined : ct ?? undefined;
    const nextVt = effective.vt ? undefined : vt ?? undefined;
    if (!nextCt && !nextVt) continue;
    onUpdateCtVt({
      iedId: ied.id,
      bayId: ied.bayId,
      ct: nextCt,
      vt: nextVt,
      sourceRef: record.fileName,
      status: "imported",
    });
  }
}

function IntakeStatusBadge({ status }: { status: SourceIntakeRecord["status"] }) {
  const cls: Record<SourceIntakeRecord["status"], string> = {
    staged: "border-cyan-200 bg-cyan-50 text-cyan-700",
    unsupported: "border-amber-200 bg-amber-50 text-amber-700",
    extracting: "border-blue-200 bg-blue-50 text-blue-700",
    extracted: "border-emerald-200 bg-emerald-50 text-emerald-700",
    extract_failed: "border-red-200 bg-red-50 text-red-700",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls[status]}`}>
      {status.replace("_", " ")}
    </span>
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

function PdfStatusBadge({ status }: { status: string }) {
  const style: Record<string, string> = {
    text_layer: "bg-emerald-50 text-emerald-700 border-emerald-200",
    scanned_needs_ocr: "bg-amber-50 text-amber-700 border-amber-200",
    encrypted: "bg-red-50 text-red-700 border-red-200",
    unknown: "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <span className={`inline-flex text-[10px] uppercase tracking-wider border rounded px-2 py-0.5 ${style[status] ?? style.unknown}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
