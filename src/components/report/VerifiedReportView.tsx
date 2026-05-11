import { useMemo } from "react";
import { FileCheck2, Printer, TriangleAlert } from "lucide-react";
import { NETWORK_CASES } from "../../domain/seed-network-registry";
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
import { summarizeBay } from "../../lib/mismatch-classifier";
import { calculateDistanceSetting, DEFAULT_DISTANCE_INPUT } from "../../lib/distance-calculation";
import { runCoordinationChecks } from "../../lib/coordination-checks";
import { buildUnifiedNetwork } from "../../domain/unified";
import { useProsetStore } from "../../store/useProsetStore";
import { ctRatioText, getEffectiveCtVt, vtRatioText } from "../../domain/instrument-transformers";

export function VerifiedReportView() {
  const activeCaseId = useProsetStore((s) => s.activeNetworkCaseId);
  const activeLineId = useProsetStore((s) => s.activeNetworkLineId);
  const miniNmmOverrides = useProsetStore((s) => s.miniNmmOverrides);
  const ctVtOverrides = useProsetStore((s) => s.ctVtOverrides);
  const comparisonBays = useProsetStore((s) => s.comparisonBays);
  const topology = useProsetStore((s) => s.topology);
  const corridors = useProsetStore((s) => s.corridors);
  const activeCorridorId = useProsetStore((s) => s.activeCorridorId);
  const getEffectiveRelay = useProsetStore((s) => s.getEffectiveRelay);

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
        miniNmmOverrides[INVENTORY_MASTER_CASE_ID],
        masterFallbackMiniNmm
      ),
    [masterFallbackMiniNmm, miniNmmOverrides]
  );
  const miniNmm = useMemo(
    () =>
      mergeMasterRelationsIntoCase(
        getEffectiveMiniNmm(activeCase.id, miniNmmOverrides[activeCase.id], fallbackMiniNmm),
        masterMiniNmm
      ),
    [activeCase.id, fallbackMiniNmm, masterMiniNmm, miniNmmOverrides]
  );
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
  const activeLine = lines.find((line) => line.id === activeLineId) ?? lines[0];
  const from = activeLine ? nodes.find((node) => node.id === activeLine.fromNodeId) : undefined;
  const to = activeLine ? nodes.find((node) => node.id === activeLine.toNodeId) : undefined;
  const promoted = activeLine
    ? promoteMatchedLcdDistCandidates(LCD_DIST_REGISTRY.records, nodes, lines).find(
        (item) => item.matchedLineId === activeLine.id
      )
    : undefined;
  const comparisonBayId = activeLine ? findComparisonBayIdForLine(activeLine.id) : null;
  const relation = activeLine ? miniNmm?.lineRelations.find((item) => item.id === activeLine.id) : undefined;
  const fromIed = relation ? miniNmm?.relayIeds.find((item) => item.bayId === relation.fromBayId) : undefined;
  const toIed = relation ? miniNmm?.relayIeds.find((item) => item.bayId === relation.toBayId) : undefined;
  const fromCtVt = getEffectiveCtVt(fromIed, ctVtOverrides);
  const toCtVt = getEffectiveCtVt(toIed, ctVtOverrides);
  const ctEvidence =
    fromCtVt.ct && toCtVt.ct && fromCtVt.ct.ratioText !== toCtVt.ct.ratioText
      ? `${fromCtVt.ct.ratioText} / ${toCtVt.ct.ratioText}`
      : ctRatioText(fromCtVt.ct ?? toCtVt.ct, promoted?.ctRatio || activeLine?.ctRatio);
  const vtEvidence =
    fromCtVt.vt && toCtVt.vt && fromCtVt.vt.ratioText !== toCtVt.vt.ratioText
      ? `${fromCtVt.vt.ratioText} / ${toCtVt.vt.ratioText}`
      : vtRatioText(fromCtVt.vt ?? toCtVt.vt, promoted?.vtRatio || activeLine?.vtRatio);
  const comparisonBay = comparisonBays.find((item) => item.bay.id === comparisonBayId);
  const comparisonSummary = comparisonBay ? summarizeBay(comparisonBay.parameters) : null;
  const calculation = useMemo(() => {
    if (!activeLine) return calculateDistanceSetting(DEFAULT_DISTANCE_INPUT);
    const lineX = promoted?.lineImpedanceOhm ?? activeLine.lineXOhm ?? DEFAULT_DISTANCE_INPUT.lineLengthKm;
    const lineLength = activeLine.physicalLengthKm ?? lineX;
    const xPerKm = activeLine.physicalLengthKm ? lineX / lineLength : 1;
    return calculateDistanceSetting({
      ...DEFAULT_DISTANCE_INPUT,
      bayName: `${from?.shortCode ?? activeLine.fromNodeId} -> ${to?.shortCode ?? activeLine.toNodeId} ${activeLine.circuit}`,
      relayModel: promoted?.relayLabel ?? activeLine.relayMain ?? DEFAULT_DISTANCE_INPUT.relayModel,
      lineLengthKm: lineLength,
      x1PerKm: xPerKm,
      r1PerKm: xPerKm * 0.15,
      z2DelayS: promoted?.zones.t2 ?? DEFAULT_DISTANCE_INPUT.z2DelayS,
      z3DelayS: promoted?.zones.t3 ?? DEFAULT_DISTANCE_INPUT.z3DelayS,
    });
  }, [activeLine, from, promoted, to]);
  const activeCorridor = corridors.find((item) => item.id === activeCorridorId) ?? corridors[0];
  const diagnostics = activeCorridor
    ? runCoordinationChecks(topology, activeCorridor, getEffectiveRelay)
    : [];
  const issueCount = diagnostics.filter((item) => item.severity === "error" || item.severity === "warning").length;

  if (!activeLine) {
    return (
      <section className="bg-white border border-dashed border-slate-300 rounded-lg p-8 text-center text-sm text-slate-500">
        Pilih line dari Setting Register dulu untuk membuat verified report.
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-lg p-4 print:border-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 print:hidden">
              <FileCheck2 className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Verified Engineering Report</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Draft report untuk satu study penghantar. Gunakan print browser untuk save as PDF.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 print:hidden"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </button>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600 mb-3">Study Context</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ReportTile label="Study case" value={activeCase.title} />
          <ReportTile label="Subject line" value={`${from?.shortCode ?? activeLine.fromNodeId} - ${to?.shortCode ?? activeLine.toNodeId} ${activeLine.circuit}`} />
          <ReportTile label="Relay assets" value={String(relays.length)} />
          <ReportTile label="Lifecycle basis" value={promoted ? "import-backed" : "seed/manual"} />
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600 mb-3">Source Evidence</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-sm">
          <EvidenceRow label="TAP / registry source" value={promoted?.tapDocument || "Belum ada TAP source terpromosi untuk line ini"} />
          <EvidenceRow label="Source row" value={promoted ? `LCD+DIST row ${promoted.sourceRow}` : "-"} />
          <EvidenceRow label="CT / VT" value={`${ctEvidence === "-" ? "CT ?" : ctEvidence} | ${vtEvidence === "-" ? "VT ?" : vtEvidence}`} />
          <EvidenceRow label="Line impedance" value={`${(promoted?.lineImpedanceOhm ?? activeLine.lineXOhm)?.toFixed(3) ?? "?"} ohm`} />
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600 mb-3">Calculation Preview</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left py-2">Zone</th>
                <th className="text-left py-2">X pri</th>
                <th className="text-left py-2">R pri</th>
                <th className="text-left py-2">X sec</th>
                <th className="text-left py-2">RFPP</th>
                <th className="text-left py-2">RFPE</th>
                <th className="text-left py-2">Delay</th>
              </tr>
            </thead>
            <tbody>
              {calculation.zones.map((zone) => (
                <tr key={zone.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="py-2 font-semibold">{zone.id}</td>
                  <td className="py-2 font-mono text-xs">{zone.xPrimaryOhm}</td>
                  <td className="py-2 font-mono text-xs">{zone.rPrimaryOhm}</td>
                  <td className="py-2 font-mono text-xs">{zone.xSecondaryOhm}</td>
                  <td className="py-2 font-mono text-xs">{zone.rfppOhm}</td>
                  <td className="py-2 font-mono text-xs">{zone.rfpeOhm}</td>
                  <td className="py-2 font-mono text-xs">{zone.delayS}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {calculation.warnings.length > 0 && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-semibold flex items-center gap-1.5">
              <TriangleAlert className="w-3.5 h-3.5" />
              Calculation warning
            </div>
            <ul className="mt-1 space-y-1">
              {calculation.warnings.map((warning) => (
                <li key={warning}>- {warning}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600 mb-3">TAP vs Actual</h3>
          {comparisonSummary ? (
            <div className="grid grid-cols-3 gap-2">
              <ReportTile label="Match" value={String(comparisonSummary.match)} />
              <ReportTile label="Cosmetic" value={String(comparisonSummary.cosmetic)} />
              <ReportTile label="Functional" value={String(comparisonSummary.functional)} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">Belum ada comparison dataset untuk line ini.</p>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600 mb-3">Coverage Diagnostics</h3>
          <div className="grid grid-cols-2 gap-2">
            <ReportTile label="Diagnostics" value={String(diagnostics.length)} />
            <ReportTile label="Warnings/errors" value={String(issueCount)} />
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Detail visual tetap dilihat di Coverage Check. Report ini menyimpan ringkasan hasil rule.
          </p>
        </div>
      </section>
    </div>
  );
}

function ReportTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 break-words">{value}</div>
    </div>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-900 break-words">{value}</div>
    </div>
  );
}
