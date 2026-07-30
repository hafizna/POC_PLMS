import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  Calculator,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  Save,
  TriangleAlert,
} from "lucide-react";
import { NumberInput } from "../shared/NumberInput";
import { useProsetStore } from "../../store/useProsetStore";
import {
  NETWORK_CASES,
  NetworkLine,
} from "../../domain/seed-network-registry";
import {
  LCD_DIST_REGISTRY,
  promoteMatchedLcdDistCandidates,
} from "../../domain/lcd-dist-import";
import {
  getEffectiveNetworkGraph,
  INVENTORY_MASTER_CASE_ID,
  mergeMasterRelationsIntoCase,
  networkLinesFromGraph,
  networkNodesFromGraph,
} from "../../domain/network-graph";
import { buildUnifiedNetwork } from "../../domain/unified";
import type { RelayIED } from "../../domain/unified";
import {
  calculateDistanceSetting,
  DEFAULT_DISTANCE_INPUT,
  DistanceCalculationInput,
  DistanceZoneResult,
} from "../../lib/distance-calculation";
import {
  calculateLegacyCrosscheckBenchmark,
  type LegacyBenchmarkRow,
} from "../../lib/legacy-crosscheck-calculation";
import { getEffectiveCtVt, parseCtRatio, parseVtRatio } from "../../domain/instrument-transformers";
import {
  CALCULATION_TEMPLATES,
  getCalculationTemplate,
  type CalculationFormulaStep,
  type CalculationTemplate,
} from "../../domain/calculation-templates";
import { getMathcadArtifactsForTemplate } from "../../domain/mathcad-template-registry";
import { CROSSCHECK_WORKBOOK_REGISTRY } from "../../domain/crosscheck-workbook-registry";
import {
  buildP545InputContract,
  createP545InputOverride,
  type P545EngineeringInput,
  type P545InputOverride,
  type P545InputSection,
  type P545InputStatus,
} from "../../domain/p545-input-contract";
import { OcrWorkbook } from "./OcrWorkbook";

type InputKey = keyof DistanceCalculationInput;

export function CalculationView() {
  const activeLineId = useProsetStore((s) => s.activeNetworkLineId);
  const activeCaseId = useProsetStore((s) => s.activeNetworkCaseId);
  const networkGraphOverrides = useProsetStore((s) => s.networkGraphOverrides);
  const ctVtOverrides = useProsetStore((s) => s.ctVtOverrides);
  const setActiveLine = useProsetStore((s) => s.setActiveNetworkLine);
  const addCalculationSnapshot = useProsetStore((s) => s.addCalculationSnapshot);
  const activeStudy = useProsetStore((s) => s.studies.find((study) => study.id === s.activeStudyId));
  const [side, setSide] = useState<"from" | "to">("from");
  const [selectedTemplateId, setSelectedTemplateId] = useState("distance-line-150kv");
  const [savedSnapshotId, setSavedSnapshotId] = useState<string | null>(null);
  const [input, setInput] = useState<DistanceCalculationInput>(
    DEFAULT_DISTANCE_INPUT
  );
  const selectedTemplate = getCalculationTemplate(selectedTemplateId);
  const result = useMemo(() => calculateDistanceSetting(input), [input]);
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
    [networkGraphOverrides, masterFallbackNetworkGraph]
  );
  const networkGraph = useMemo(
    () =>
      mergeMasterRelationsIntoCase(
        getEffectiveNetworkGraph(activeCase.id, networkGraphOverrides[activeCase.id], fallbackNetworkGraph),
        masterNetworkGraph
      ),
    [activeCase.id, networkGraphOverrides, fallbackNetworkGraph, masterNetworkGraph]
  );
  const nodes = useMemo(
    () => (networkGraph ? networkNodesFromGraph(networkGraph) : activeCase.nodes),
    [activeCase.nodes, networkGraph]
  );
  const lines = useMemo(
    () => (networkGraph ? networkLinesFromGraph(networkGraph) : activeCase.lines),
    [activeCase.lines, networkGraph]
  );
  const activeLine = lines.find((line) => line.id === activeLineId);
  const relation = networkGraph?.lineRelations.find((r) => r.id === activeLineId);
  const fromIed = relation
    ? networkGraph?.relayIeds.find((i) => i.bayId === relation.fromBayId)
    : undefined;
  const toIed = relation
    ? networkGraph?.relayIeds.find((i) => i.bayId === relation.toBayId)
    : undefined;
  const calcIed: RelayIED | undefined = side === "from" ? fromIed : toIed;
  const promotedLine = useMemo(
    () =>
      activeCase
        ? promoteMatchedLcdDistCandidates(
          LCD_DIST_REGISTRY.records,
          nodes,
          lines
        ).find((line) => line.matchedLineId === activeLineId)
        : undefined,
    [activeCase, nodes, lines, activeLineId]
  );
  const fromNode = activeLine
    ? nodes.find((node) => node.id === activeLine.fromNodeId)
    : null;
  const toNode = activeLine
    ? nodes.find((node) => node.id === activeLine.toNodeId)
    : null;
  const localNode = side === "from" ? fromNode : toNode;
  const remoteNode = side === "from" ? toNode : fromNode;

  useEffect(() => {
    if (!activeLine || !fromNode || !toNode) return;
    // Prefer per-IED CT/VT from network graph (clean data) over the fused
    // "3000/5 at DKS, 3000/1 at DM" string on NetworkLine.
    const ct =
      getEffectiveCtVt(calcIed, ctVtOverrides).ct ??
      parseCtRatio(promotedLine?.ctRatio || activeLine.ctRatio);
    const vt =
      getEffectiveCtVt(calcIed, ctVtOverrides).vt ??
      parseVtRatio(promotedLine?.vtRatio || activeLine.vtRatio);
    const xTotal =
      promotedLine?.lineImpedanceOhm ??
      activeLine.lineXOhm ??
      DEFAULT_DISTANCE_INPUT.lineLengthKm;
    const lineLength = activeLine.physicalLengthKm ?? xTotal;
    const xPerKm = activeLine.physicalLengthKm ? xTotal / lineLength : 1;

    const localCode = (side === "from" ? fromNode : toNode).shortCode;
    const remoteCode = (side === "from" ? toNode : fromNode).shortCode;
    const iedLabel = calcIed ? `${calcIed.make} ${calcIed.model}` : undefined;

    setInput((current) => ({
      ...current,
      bayName: `${localCode} -> ${remoteCode} ${activeLine.circuit}`,
      relayModel: iedLabel || promotedLine?.relayLabel || activeLine.relayMain || current.relayModel,
      lineLengthKm: Number(lineLength.toFixed(3)),
      x1PerKm: Number(xPerKm.toFixed(6)),
      r1PerKm: Number((xPerKm * 0.15).toFixed(6)),
      ctPrimaryA: ct?.primaryA ?? current.ctPrimaryA,
      ctSecondaryA: ct?.secondaryA ?? current.ctSecondaryA,
      vtPrimaryKv: vt?.primaryKv ?? current.vtPrimaryKv,
      vtSecondaryV: vt?.secondaryV ?? current.vtSecondaryV,
      nextLineXOhm: inferNextLineX(lines, activeLine.id, side),
      nextLineROhm: Number((inferNextLineX(lines, activeLine.id, side) * 0.15).toFixed(3)),
      z1Percent:
        promotedLine?.lineImpedanceOhm && promotedLine.zones.z1
          ? Number(((promotedLine.zones.z1 / promotedLine.lineImpedanceOhm) * 100).toFixed(1))
          : current.z1Percent,
      z2Percent:
        promotedLine?.lineImpedanceOhm && promotedLine.zones.z2
          ? Number(((promotedLine.zones.z2 / promotedLine.lineImpedanceOhm) * 100).toFixed(1))
          : current.z2Percent,
      z2DelayS: promotedLine?.zones.t2 ?? current.z2DelayS,
      z3DelayS: promotedLine?.zones.t3 ?? current.z3DelayS,
    }));
  }, [activeLine, activeCase, fromNode, toNode, promotedLine, calcIed, side, ctVtOverrides]);

  const updateNumber = (key: InputKey, value: number) => {
    setSavedSnapshotId(null);
    setInput((current) => ({ ...current, [key]: value }));
  };

  const handleSaveCalculationSnapshot = () => {
    if (!activeLine || selectedTemplate.status !== "executable") return;
    const outputValues = buildDistanceOutputValues(result);
    const inputValues = buildDistanceInputValues(input);
    const snapshotId = addCalculationSnapshot({
      caseId: activeCase.id,
      lineId: activeLine.id,
      templateId: selectedTemplate.id,
      templateName: selectedTemplate.name,
      functionIds: selectedTemplate.functionIds,
      sourceRef: `PLMS Calculation Workbook | ${input.bayName}`,
      inputValues,
      outputValues,
      warnings: result.warnings,
      note: "Draft TAP setting generated from executable distance workbook.",
    });
    setSavedSnapshotId(snapshotId);
  };

  return (
    <div className="space-y-4">
      {activeStudy?.sourceBridge?.kind === "legacy_crosscheck_workbook" && (
        <LegacyCrosscheckBenchmarkPanel />
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Calculation Workbook
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
              Prototype workbook untuk mereplikasi cara kerja template Mathcad:
              input engineering, formula, intermediate result, final setting,
              dan warning validasi dalam satu workflow yang bisa diaudit.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Template</span>
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="bg-white text-xs px-2 py-1.5 rounded border border-slate-300 focus:border-blue-500 focus:outline-none min-w-56"
              >
                {CALCULATION_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.shortName} - {template.status}
                  </option>
                ))}
              </select>
            </label>
            <TemplateStatusBadge template={selectedTemplate} />
            {selectedTemplateId === "distance-line-150kv" && (
              <button
                type="button"
                onClick={handleSaveCalculationSnapshot}
                disabled={!activeLine || selectedTemplate.status !== "executable"}
                className={`inline-flex items-center gap-1.5 rounded border px-3 py-2 text-xs font-medium transition-colors ${activeLine && selectedTemplate.status === "executable"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed"
                  }`}
                title={
                  selectedTemplate.status !== "executable"
                    ? "Template blueprint belum bisa disimpan sebagai draft TAP"
                    : activeLine
                      ? "Simpan hasil hitung ke Setting Register"
                      : "Pilih line dulu"
                }
              >
                <Save className="w-3.5 h-3.5" />
                Save draft TAP
              </button>
            )}
          </div>
        </div>
        <TemplateOverview template={selectedTemplate} />
        {!activeLine && (
          <div className="mt-4 border border-amber-200 bg-amber-50 rounded-md px-3 py-2 text-xs text-amber-900 flex items-center justify-between gap-3 flex-wrap">
            <div>
              Belum ada line yang dipilih. Pilih dari dropdown atau dari Line Registry.
            </div>
            <select
              className="bg-white text-xs px-2 py-1 rounded border border-amber-300 focus:border-blue-500 focus:outline-none"
              value=""
              onChange={(e) => setActiveLine(e.target.value)}
            >
              <option value="" disabled>
                Pilih line...
              </option>
              {NETWORK_CASES.flatMap((c) =>
                (c.id === activeCase.id ? lines : c.lines).map((line) => {
                  const caseNodes = c.id === activeCase.id ? nodes : c.nodes;
                  const f = caseNodes.find((n) => n.id === line.fromNodeId);
                  const t = caseNodes.find((n) => n.id === line.toNodeId);
                  return (
                    <option key={line.id} value={line.id}>
                      {f?.shortCode} - {t?.shortCode} {line.circuit}
                    </option>
                  );
                })
              )}
            </select>
          </div>
        )}
        {activeLine && (
          <div className="mt-4 border border-blue-200 bg-blue-50 rounded-md px-3 py-2 text-xs text-blue-900 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                Context:{" "}
                <span className="font-semibold">
                  {localNode?.shortCode} -&gt; {remoteNode?.shortCode} {activeLine.circuit}
                </span>
                <span className="text-blue-700">
                  {" "}
                  | IED:{" "}
                  {calcIed
                    ? `${calcIed.make} ${calcIed.model}`
                    : activeLine.relayMain || "unknown"}{" "}
                  | Xline{" "}
                  {(promotedLine?.lineImpedanceOhm ?? activeLine.lineXOhm)?.toFixed(3) ?? "?"} ohm
                </span>
              </div>
              {fromIed && toIed && (
                <div className="inline-flex rounded border border-blue-300 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSide("from")}
                    className={`px-2 py-0.5 text-[11px] ${side === "from" ? "bg-blue-600 text-white" : "bg-white text-blue-700"
                      }`}
                  >
                    {fromNode?.shortCode} side
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide("to")}
                    className={`px-2 py-0.5 text-[11px] border-l border-blue-300 ${side === "to" ? "bg-blue-600 text-white" : "bg-white text-blue-700"
                      }`}
                  >
                    {toNode?.shortCode} side
                  </button>
                </div>
              )}
            </div>
            <span className="text-blue-700">
              Prefilled dari {calcIed ? "network graph IED" : promotedLine ? "promoted LCD+DIST" : "registry"}.
            </span>
            {savedSnapshotId && (
              <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                Saved to Setting Register
              </span>
            )}
          </div>
        )}

        {selectedTemplate.status !== "executable" && (
          <TemplateBlueprintPanel template={selectedTemplate} />
        )}

        {selectedTemplate.status === "executable" && selectedTemplateId === "distance-line-150kv" && (
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              label="Bay"
              value={input.bayName}
              sub={input.relayModel}
              icon={<FileText className="w-4 h-4 text-slate-400" />}
            />
            <SummaryCard
              label="Line Z1"
              value={`${result.lineZOhm.toFixed(3)} ohm`}
              sub={`R ${result.lineROhm.toFixed(3)} | X ${result.lineXOhm.toFixed(3)}`}
              icon={<Calculator className="w-4 h-4 text-blue-600" />}
              tone="blue"
            />
            <SummaryCard
              label="Angle"
              value={`${result.lineAngleDeg.toFixed(2)} deg`}
              sub="Positive sequence"
              icon={<GitCompareArrows className="w-4 h-4 text-amber-600" />}
              tone="amber"
            />
            <SummaryCard
              label="Validation"
              value={result.warnings.length === 0 ? "Clear" : `${result.warnings.length} warning`}
              sub="Live calculation checks"
              icon={
                result.warnings.length === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <TriangleAlert className="w-4 h-4 text-red-600" />
                )
              }
              tone={result.warnings.length === 0 ? "emerald" : "red"}
            />
          </div>
        )}
      </div>

      {selectedTemplateId === "distance-line-150kv" && (
        <P545PilotInputContractPanel />
      )}

      {selectedTemplate.status !== "executable" ? (
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
          <TemplateInputSpecPanel template={selectedTemplate} />
          <div className="space-y-4">
            <TemplateFormulaPanel template={selectedTemplate} />
            <MathcadBridgePanel template={selectedTemplate} />
          </div>
        </div>
      ) : selectedTemplateId === "ocr-gfr-backup-150kv" ? (
        <OcrWorkbook
          lineId={activeLineId || ""}
          caseId={activeCase.id}
          onSave={addCalculationSnapshot}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-4">
          <div className="space-y-4">
            <InputSection title="Data Line">
              <TextInput
                label="Bay"
                value={input.bayName}
                onChange={(value) =>
                  setInput((current) => ({ ...current, bayName: value }))
                }
              />
              <TextInput
                label="Relay"
                value={input.relayModel}
                onChange={(value) =>
                  setInput((current) => ({ ...current, relayModel: value }))
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  label="Voltage"
                  value={input.nominalVoltageKv}
                  onChange={(v) => updateNumber("nominalVoltageKv", v)}
                  unit="kV"
                  step={1}
                />
                <NumberInput
                  label="Length"
                  value={input.lineLengthKm}
                  onChange={(v) => updateNumber("lineLengthKm", v)}
                  unit="km"
                  step={0.1}
                />
                <NumberInput
                  label="R1/km"
                  value={input.r1PerKm}
                  onChange={(v) => updateNumber("r1PerKm", v)}
                  unit="ohm/km"
                />
                <NumberInput
                  label="X1/km"
                  value={input.x1PerKm}
                  onChange={(v) => updateNumber("x1PerKm", v)}
                  unit="ohm/km"
                />
              </div>
            </InputSection>

            <InputSection title="CT/VT dan Next Line">
              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  label="CT primary"
                  value={input.ctPrimaryA}
                  onChange={(v) => updateNumber("ctPrimaryA", v)}
                  unit="A"
                  step={100}
                />
                <NumberInput
                  label="CT secondary"
                  value={input.ctSecondaryA}
                  onChange={(v) => updateNumber("ctSecondaryA", v)}
                  unit="A"
                  step={1}
                />
                <NumberInput
                  label="VT primary"
                  value={input.vtPrimaryKv}
                  onChange={(v) => updateNumber("vtPrimaryKv", v)}
                  unit="kV"
                  step={1}
                />
                <NumberInput
                  label="VT secondary"
                  value={input.vtSecondaryV}
                  onChange={(v) => updateNumber("vtSecondaryV", v)}
                  unit="V"
                  step={1}
                />
                <NumberInput
                  label="Next R"
                  value={input.nextLineROhm}
                  onChange={(v) => updateNumber("nextLineROhm", v)}
                  unit="ohm"
                />
                <NumberInput
                  label="Next X"
                  value={input.nextLineXOhm}
                  onChange={(v) => updateNumber("nextLineXOhm", v)}
                  unit="ohm"
                />
              </div>
            </InputSection>

            <InputSection title="Rule Setting">
              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  label="Z1 reach"
                  value={input.z1Percent}
                  onChange={(v) => updateNumber("z1Percent", v)}
                  unit="%"
                  step={1}
                />
                <NumberInput
                  label="Z2 reach"
                  value={input.z2Percent}
                  onChange={(v) => updateNumber("z2Percent", v)}
                  unit="%"
                  step={1}
                />
                <NumberInput
                  label="Z3 own line"
                  value={input.z3OwnLinePercent}
                  onChange={(v) => updateNumber("z3OwnLinePercent", v)}
                  unit="%"
                  step={5}
                />
                <NumberInput
                  label="Z3 next line"
                  value={input.z3NextLinePercent}
                  onChange={(v) => updateNumber("z3NextLinePercent", v)}
                  unit="%"
                  step={5}
                />
                <NumberInput
                  label="RFPP factor"
                  value={input.rfppMultiplier}
                  onChange={(v) => updateNumber("rfppMultiplier", v)}
                  unit="x X"
                  step={0.1}
                />
                <NumberInput
                  label="RFPE factor"
                  value={input.rfpeMultiplier}
                  onChange={(v) => updateNumber("rfpeMultiplier", v)}
                  unit="x X"
                  step={0.1}
                />
                <NumberInput
                  label="tZ2"
                  value={input.z2DelayS}
                  onChange={(v) => updateNumber("z2DelayS", v)}
                  unit="s"
                  step={0.1}
                />
                <NumberInput
                  label="tZ3"
                  value={input.z3DelayS}
                  onChange={(v) => updateNumber("z3DelayS", v)}
                  unit="s"
                  step={0.1}
                />
              </div>
            </InputSection>
          </div>

          <div className="space-y-4">
            <CalculationSteps result={result} formulaSteps={selectedTemplate.formulaSteps} />
            <ZoneResultTable zones={result.zones} />
            <MathcadBridgePanel template={selectedTemplate} />
            <ValidationPanel warnings={result.warnings} />
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateStatusBadge({ template }: { template: CalculationTemplate }) {
  const cls: Record<CalculationTemplate["status"], string> = {
    executable: "text-emerald-700 bg-emerald-50 border-emerald-200",
    blueprint: "text-blue-700 bg-blue-50 border-blue-200",
    blocked: "text-amber-700 bg-amber-50 border-amber-200",
  };
  return (
    <div className={`flex items-center gap-2 text-xs border rounded-md px-3 py-2 ${cls[template.status]}`}>
      <BookOpenCheck className="w-4 h-4" />
      {template.status === "executable" ? "Executable" : "Template blueprint"}
    </div>
  );
}

function TemplateOverview({ template }: { template: CalculationTemplate }) {
  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold text-slate-900">{template.name}</div>
          <div className="text-[11px] text-slate-600 mt-0.5 max-w-4xl">{template.purpose}</div>
        </div>
        <div className="flex flex-wrap gap-1">
          {template.functionIds.map((fn) => (
            <span key={fn} className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-white text-blue-700">
              {fn}
            </span>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-slate-500 mt-1">{template.scope}</div>
    </div>
  );
}

function TemplateBlueprintPanel({ template }: { template: CalculationTemplate }) {
  return (
    <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
      <div className="flex items-start gap-2">
        <ClipboardList className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold">Template belum executable.</div>
          <div className="mt-0.5 text-blue-800">
            Struktur input, formula, output, asumsi, dan benchmark sudah disiapkan. Langkah berikutnya adalah mengisi formula engine dan benchmark terhadap template Mathcad existing.
          </div>
          {template.nextImplementationStep && (
            <div className="mt-1 text-blue-700">Next: {template.nextImplementationStep}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function inferNextLineX(
  lines: NetworkLine[],
  lineId: string,
  side: "from" | "to"
): number {
  const line = lines.find((item) => item.id === lineId);
  if (!line) return DEFAULT_DISTANCE_INPUT.nextLineXOhm;
  const remoteNodeId = side === "from" ? line.toNodeId : line.fromNodeId;
  const localNodeId = side === "from" ? line.fromNodeId : line.toNodeId;
  const nextLine = lines.find(
    (item) =>
      item.id !== line.id &&
      (item.fromNodeId === remoteNodeId || item.toNodeId === remoteNodeId) &&
      item.fromNodeId !== localNodeId &&
      item.toNodeId !== localNodeId
  );
  return nextLine?.lineXOhm ?? DEFAULT_DISTANCE_INPUT.nextLineXOhm;
}

function InputSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4">
      <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600 mb-3">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </label>
  );
}

function CalculationSteps({
  result,
  formulaSteps,
}: {
  result: ReturnType<typeof calculateDistanceSetting>;
  formulaSteps: CalculationFormulaStep[];
}) {
  const steps = [
    {
      label: formulaSteps.find((step) => step.id === "line-impedance")?.label ?? "Line impedance",
      formula: formulaSteps.find((step) => step.id === "line-impedance")?.expression ?? "Zline = length x (R1/km + jX1/km)",
      value: `R ${result.lineROhm.toFixed(3)} ohm, X ${result.lineXOhm.toFixed(3)} ohm, angle ${result.lineAngleDeg.toFixed(2)} deg`,
    },
    {
      label: formulaSteps.find((step) => step.id === "secondary-conversion")?.label ?? "Secondary conversion",
      formula: formulaSteps.find((step) => step.id === "secondary-conversion")?.expression ?? "Zsecondary = Zprimary x (CTR / VTR)",
      value: `CTR ${result.ctRatio.toFixed(2)}, VTR ${result.vtRatio.toFixed(2)}, factor ${result.secondaryFactor.toFixed(6)}`,
    },
    {
      label: formulaSteps.find((step) => step.id === "load-check")?.label ?? "Load check",
      formula: formulaSteps.find((step) => step.id === "load-check")?.expression ?? "Zload = kV^2 / MVA",
      value:
        result.loadImpedanceOhm === null
          ? "Load data belum lengkap"
          : `${result.loadImpedanceOhm.toFixed(3)} ohm primary`,
    },
  ];

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-2 bg-slate-50">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">
          Calculation Trace
        </h3>
      </div>
      <div className="divide-y divide-slate-100">
        {steps.map((step, index) => (
          <div key={step.label} className="px-4 py-3 grid grid-cols-[32px_1fr] gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center text-xs font-semibold">
              {index + 1}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">{step.label}</div>
              <div className="font-mono text-xs text-slate-500 mt-0.5">{step.formula}</div>
              <div className="text-xs text-slate-700 mt-1">{step.value}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TemplateInputSpecPanel({ template }: { template: CalculationTemplate }) {
  const grouped = template.inputs.reduce<Record<string, typeof template.inputs>>((acc, input) => {
    acc[input.source] = [...(acc[input.source] ?? []), input];
    return acc;
  }, {});
  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-2 bg-slate-50">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Template Inputs</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {Object.entries(grouped).map(([source, inputs]) => (
          <div key={source} className="px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">{source}</div>
            <div className="space-y-1.5">
              {inputs.map((input) => (
                <div key={input.key} className="flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="font-medium text-slate-800">{input.label}</div>
                    {input.note && <div className="text-[10px] text-slate-500 mt-0.5">{input.note}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {input.unit && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-500">
                        {input.unit}
                      </span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${input.required
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}>
                      {input.required ? "required" : "optional"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TemplateFormulaPanel({ template }: { template: CalculationTemplate }) {
  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-2 bg-slate-50">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Formula Blueprint</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {template.formulaSteps.map((step, index) => (
          <div key={step.id} className="px-4 py-3 grid grid-cols-[32px_1fr] gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center text-xs font-semibold">
              {index + 1}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">{step.label}</div>
              <div className="font-mono text-xs text-slate-500 mt-0.5">{step.expression}</div>
              <div className="text-xs text-slate-700 mt-1">{step.description}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Expected outputs</div>
        <div className="flex flex-wrap gap-1.5">
          {template.outputs.map((output) => (
            <span key={output.key} className="text-[10px] px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-600">
              {output.label}{output.unit ? ` (${output.unit})` : ""} {"->"} {output.target}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function LegacyCrosscheckBenchmarkPanel() {
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
    keyFormulas?: Record<string, string>;
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
  const lines = distanceCase.selectedLines?.filter((line) => line.name) ?? [];
  const benchmark = calculateLegacyCrosscheckBenchmark(registry);
  const parityTone =
    benchmark.summary.gapCount === 0 && benchmark.summary.missingCount === 0
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <section className="bg-white border border-emerald-200 rounded-lg overflow-hidden">
      <div className="border-b border-emerald-100 px-4 py-3 bg-emerald-50 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="rounded-md border border-emerald-200 bg-white p-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Legacy Crosscheck Benchmark</h3>
            <p className="mt-0.5 max-w-3xl text-xs text-slate-600">
              Study ini dibuat dari spreadsheet crosscheck existing. Angka di bawah menjadi target parity:
              PLMS harus bisa memilih bay, menarik DB DIgSILENT/IHS, menyusun L1-L4, lalu menghasilkan setting yang dapat dibandingkan.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 text-[10px]">
          <span className="rounded border border-emerald-200 bg-white px-2 py-1 text-emerald-700">{registry.summary.lineRecordCount} line DB</span>
          <span className="rounded border border-emerald-200 bg-white px-2 py-1 text-emerald-700">{registry.summary.faultRecordCount} fault rows</span>
          <span className="rounded border border-emerald-200 bg-white px-2 py-1 text-emerald-700">{registry.summary.formulaCount} formulas</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr_1fr] divide-y xl:divide-y-0 xl:divide-x divide-slate-100">
        <div className="p-4">
          <div className="text-xs font-semibold text-slate-700 mb-3">Excel Input Context</div>
          <div className="space-y-2 text-xs">
            <BenchmarkRow label="Local GI" value={distanceCase.localSubstation} />
            <BenchmarkRow label="Subject bay" value={distanceCase.subjectBay} />
            <BenchmarkRow label="Remote GI" value={distanceCase.remoteSubstation} />
            <BenchmarkRow label="Fault 3ph / 1ph" value={`${formatMaybeNumber(distanceCase.fault3phKa)} / ${formatMaybeNumber(distanceCase.fault1phKa)} kA`} />
            <BenchmarkRow label="CCC ref" value={`${formatMaybeNumber(distanceCase.cccA)} A`} />
            <BenchmarkRow label="CT / PT" value={`${formatMaybeNumber(distanceCase.ctPrimaryA)}/${formatMaybeNumber(distanceCase.ctSecondaryA)} | ${formatMaybeNumber(distanceCase.ptPrimaryV)}/${formatMaybeNumber(distanceCase.ptSecondaryV)}`} />
          </div>
          <div className="mt-3 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
            Ini adalah versi Excel dari “Create Study”: user memilih GI dan bay, lalu workbook mencari remote GI, fault current, dan line sekitar.
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-semibold text-slate-700 mb-3">L1-L4 Corridor Selector</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {lines.map((line) => (
              <div key={`${line.slot}-${line.name}`} className="rounded-md border border-slate-200 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-900">{line.slot} | {line.name}</div>
                  <span className="text-[10px] text-slate-500">{formatMaybeNumber(line.lengthKm)} km</span>
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  Z {formatMaybeNumber(line.zOhm)} ohm | X1 {formatMaybeNumber(line.x1Ohm)} ohm
                </div>
                <div className="mt-0.5 truncate text-[10px] text-slate-400">{line.type || "-"}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[10px] text-slate-500">
            Formula selector: L1 dari subject/manual override, L2 ruas terdekat dari GI lawan, L3 ruas terpanjang, L4 ruas terpendek berikutnya.
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-semibold text-slate-700 mb-3">Legacy Output Target</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <BenchmarkMetric label="Z1 pri/sec" value={`${formatOutput(distanceCase.outputs?.z1PrimaryOhm)} / ${formatOutput(distanceCase.outputs?.z1SecondaryOhm)}`} />
            <BenchmarkMetric label="Z2 pri/sec" value={`${formatOutput(distanceCase.outputs?.z2PrimaryOhm)} / ${formatOutput(distanceCase.outputs?.z2SecondaryOhm)}`} />
            <BenchmarkMetric label="Z3 pri/sec" value={`${formatOutput(distanceCase.outputs?.z3PrimaryOhm)} / ${formatOutput(distanceCase.outputs?.z3SecondaryOhm)}`} />
            <BenchmarkMetric label="tZ1/tZ2/tZ3" value={`${formatOutput(distanceCase.outputs?.tZ1S)} / ${formatOutput(distanceCase.outputs?.tZ2S)} / ${formatOutput(distanceCase.outputs?.tZ3S)} s`} />
            <BenchmarkMetric label="OCR pickup" value={`${formatOutput(ocrGfrCase.outputs?.ocrPickupPrimaryA)} A`} />
            <BenchmarkMetric label="GFR pickup" value={`${formatOutput(ocrGfrCase.outputs?.gfrPickupPrimaryA)} A`} />
          </div>
          <div className={`mt-3 rounded border px-3 py-2 text-[11px] ${parityTone}`}>
            Benchmark Mode: PLMS menghitung ulang dari input DB/IHS/PROSES dan membandingkan hasilnya dengan output Excel.
            {benchmark.summary.gapCount === 0
              ? " Distance dan OCR/GFR benchmark sudah parity untuk case ini."
              : ` Masih ada ${benchmark.summary.gapCount} gap yang perlu ditutup.`}
          </div>
        </div>
      </div>

      <div className="border-t border-emerald-100 bg-white">
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs font-semibold text-slate-900">PLMS vs Excel Parity</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Formula benchmark mengikuti selector workbook: L1-L4, Z2/Z3 min-max cap, secondary factor CCC/PT, dan OCR/GFR pickup.
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
              {benchmark.summary.matchCount} match
            </span>
            <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
              {benchmark.summary.warnCount} warn
            </span>
            <span className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700">
              {benchmark.summary.gapCount} gap
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
              max {formatMaybeNumber(benchmark.summary.maxAbsDeltaPct)}%
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] border-t border-slate-100">
          <BenchmarkComparisonTable title="Distance" rows={benchmark.distanceRows} />
          <div className="border-t xl:border-t-0 xl:border-l border-slate-100">
            <BenchmarkComparisonTable title="OCR/GFR" rows={benchmark.ocrGfrRows} compact />
            <div className="px-4 pb-4">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
                  Formula trace
                </div>
                <div className="space-y-1">
                  {benchmark.formulas.map((formula) => (
                    <div key={formula.label} className="grid grid-cols-[52px_1fr] gap-2 text-[10px]">
                      <span className="font-semibold text-slate-700">{formula.label}</span>
                      <span className="font-mono text-slate-500">{formula.expression}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BenchmarkRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1 last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value ?? "-"}</span>
    </div>
  );
}

function BenchmarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function BenchmarkComparisonTable({
  title,
  rows,
  compact = false,
}: {
  title: string;
  rows: LegacyBenchmarkRow[];
  compact?: boolean;
}) {
  return (
    <div className="p-4">
      <div className="text-xs font-semibold text-slate-700 mb-2">{title}</div>
      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-2 py-2 font-medium">Output</th>
              <th className="text-right px-2 py-2 font-medium">PLMS</th>
              <th className="text-right px-2 py-2 font-medium">Excel</th>
              <th className="text-right px-2 py-2 font-medium">Delta</th>
              {!compact && <th className="text-right px-2 py-2 font-medium">Delta %</th>}
              <th className="text-left px-2 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="px-2 py-1.5 text-slate-700 whitespace-nowrap">
                  {row.label}
                  {row.unit ? <span className="text-slate-400"> ({row.unit})</span> : null}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-900">{formatMaybeNumber(row.plms)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-600">{formatMaybeNumber(row.excel)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-600">{formatSigned(row.delta)}</td>
                {!compact && (
                  <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                    {row.deltaPct === null ? "-" : `${formatSigned(row.deltaPct)}%`}
                  </td>
                )}
                <td className="px-2 py-1.5">
                  <BenchmarkStatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BenchmarkStatusBadge({ status }: { status: LegacyBenchmarkRow["status"] }) {
  const cls: Record<LegacyBenchmarkRow["status"], string> = {
    match: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
    gap: "border-red-200 bg-red-50 text-red-700",
    missing: "border-slate-200 bg-slate-50 text-slate-500",
  };
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${cls[status]}`}>
      {status}
    </span>
  );
}

function formatSigned(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const formatted = formatMaybeNumber(Math.abs(value));
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
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

const P545_SECTION_LABELS: Record<P545InputSection, string> = {
  identity: "Relay identity",
  line: "Protected line",
  "instrument-transformer": "CT / VT",
  "operating-limit": "Operating limits",
  "fault-study": "Fault study",
  "adjacent-network": "Adjacent network",
};

function P545PilotInputContractPanel() {
  const sourceSnapshots = useProsetStore((state) => state.sourceSnapshots);
  const studyScenarios = useProsetStore((state) => state.studyScenarios);
  const activeStudyId = useProsetStore((state) => state.activeStudyId);
  const activeStudy = useProsetStore((state) =>
    state.studies.find((study) => study.id === state.activeStudyId)
  );
  const currentPersona = useProsetStore((state) => state.currentPersona);
  const setStudyScenario = useProsetStore((state) => state.setStudyScenario);
  const scenarioId = activeStudy?.scenarioId;
  const [overrides, setOverrides] = useState<P545InputOverride[]>([]);
  const [overrideKey, setOverrideKey] = useState("relay_model");
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideError, setOverrideError] = useState("");
  const contract = useMemo(
    () =>
      buildP545InputContract({
        snapshots: sourceSnapshots,
        scenarios: studyScenarios,
        scenarioId,
        overrides,
      }),
    [sourceSnapshots, studyScenarios, scenarioId, overrides]
  );
  const reviewableInputs = contract.inputs.filter(
    (input) => input.status !== "resolved" && input.status !== "blocked"
  );

  useEffect(() => {
    setOverrides([]);
    setOverrideError("");
  }, [scenarioId]);

  useEffect(() => {
    if (
      reviewableInputs.length > 0 &&
      !reviewableInputs.some((input) => input.key === overrideKey)
    ) {
      setOverrideKey(reviewableInputs[0].key);
      setOverrideValue("");
    }
  }, [reviewableInputs, overrideKey]);

  const applyOverride = () => {
    try {
      const override = createP545InputOverride({
        contract,
        inputKey: overrideKey,
        rawValue: overrideValue,
        reason: overrideReason,
        actor: currentPersona,
      });
      setOverrides((current) => [
        ...current.filter((item) => item.inputKey !== override.inputKey),
        override,
      ]);
      setOverrideValue("");
      setOverrideReason("");
      setOverrideError("");
    } catch (error) {
      setOverrideError(error instanceof Error ? error.message : "Override is invalid.");
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900">
              P545 Pilot Input Contract
            </h3>
            <P545ContractStatusBadge status={contract.status} />
            <span className="text-[10px] rounded border border-blue-200 bg-blue-50 text-blue-700 px-1.5 py-0.5">
              MVP 2B.1
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 max-w-3xl">
            Ciledug → Alam Sutera #1. Ini adalah gerbang input typed/unit-aware
            sebelum formula P545 dipindahkan dari Mathcad; belum terhubung ke
            tombol Save draft TAP.
          </p>
        </div>
        <label className="flex flex-col gap-1 min-w-72">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            Study scenario
          </span>
          <select
            value={scenarioId ?? ""}
            disabled={!activeStudyId}
            onChange={(event) =>
              activeStudyId &&
              setStudyScenario(activeStudyId, event.target.value || null)
            }
            className="bg-white text-xs px-2 py-1.5 rounded border border-slate-300 focus:border-blue-500 focus:outline-none"
          >
            <option value="">No scenario — fault input blocked</option>
            {studyScenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex flex-wrap gap-2">
          <P545SummaryChip label="Resolved" value={contract.summary.resolved} tone="emerald" />
          <P545SummaryChip label="Conflict" value={contract.summary.conflicts} tone="amber" />
          <P545SummaryChip label="Missing" value={contract.summary.missing} tone="red" />
          <P545SummaryChip label="Blocked" value={contract.summary.blocked} tone="slate" />
          <P545SummaryChip label="Override" value={contract.summary.overridden} tone="blue" />
        </div>
        {contract.scenarioIssues.length > 0 && (
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
            {contract.scenarioIssues.map((issue) => (
              <div
                key={`${issue.code}-${issue.message}`}
                className={`rounded border px-2.5 py-2 text-[11px] ${
                  issue.severity === "error"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <span className="font-semibold">{issue.code}</span>: {issue.message}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
        {(Object.keys(P545_SECTION_LABELS) as P545InputSection[]).map((section) => {
          const inputs = contract.inputs.filter((input) => input.section === section);
          if (inputs.length === 0) return null;
          return (
            <div key={section} className="rounded border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex items-center justify-between">
                <h4 className="text-[10px] uppercase tracking-wider font-semibold text-slate-600">
                  {P545_SECTION_LABELS[section]}
                </h4>
                <span className="text-[10px] text-slate-400">{inputs.length} input</span>
              </div>
              <div className="divide-y divide-slate-100">
                {inputs.map((input) => (
                  <P545InputRow
                    key={input.key}
                    input={input}
                    onClearOverride={() =>
                      setOverrides((current) =>
                        current.filter((item) => item.inputKey !== input.key)
                      )
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs font-semibold text-slate-800">
              Engineer override
            </div>
            <div className="text-[11px] text-slate-500">
              Kandidat asli tetap disimpan. Alasan minimal 8 karakter dan actor/timestamp dicatat.
            </div>
          </div>
          <span className="text-[10px] text-slate-500">
            Session draft · backend approval menyusul saat staging/dev
          </span>
        </div>
        {reviewableInputs.length === 0 ? (
          <div className="mt-2 text-xs text-emerald-700">
            Tidak ada conflict/missing input yang dapat dioverride.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-[240px_180px_1fr_auto] gap-2">
            <select
              value={overrideKey}
              onChange={(event) => {
                setOverrideKey(event.target.value);
                setOverrideValue("");
                setOverrideError("");
              }}
              className="bg-white text-xs px-2 py-2 rounded border border-slate-300 focus:border-blue-500 focus:outline-none"
            >
              {reviewableInputs.map((input) => (
                <option key={input.key} value={input.key}>
                  {input.label} ({input.status})
                </option>
              ))}
            </select>
            <input
              value={overrideValue}
              onChange={(event) => setOverrideValue(event.target.value)}
              placeholder="Selected value"
              className="bg-white text-xs px-2 py-2 rounded border border-slate-300 focus:border-blue-500 focus:outline-none"
            />
            <input
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              placeholder="Engineering reason and evidence..."
              className="bg-white text-xs px-2 py-2 rounded border border-slate-300 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={applyOverride}
              className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              Apply override
            </button>
          </div>
        )}
        {overrideError && (
          <div className="mt-2 text-xs text-red-700">{overrideError}</div>
        )}
      </div>
    </section>
  );
}

function P545InputRow({
  input,
  onClearOverride,
}: {
  input: P545EngineeringInput;
  onClearOverride: () => void;
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-800">{input.label}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{input.description}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <P545InputStatusBadge status={input.status} />
          {input.status === "overridden" && (
            <button
              type="button"
              onClick={onClearOverride}
              className="text-[10px] text-blue-600 hover:underline"
            >
              clear
            </button>
          )}
        </div>
      </div>
      {input.value !== null && (
        <div className="mt-1.5 font-mono text-xs text-slate-900">
          {formatP545Value(input.value)}{" "}
          <span className="text-slate-400">{input.unit}</span>
        </div>
      )}
      {input.issue && (
        <div className="mt-1.5 text-[10px] text-amber-700">{input.issue}</div>
      )}
      {input.candidates.length > 0 && (
        <div className="mt-2 space-y-1">
          {input.candidates.map((candidate) => (
            <div
              key={candidate.id}
              className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-600"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-slate-800">
                  {formatP545Value(candidate.value)} {candidate.unit}
                </span>
                <span>{formatP545Date(candidate.source.capturedAt)}</span>
              </div>
              <div className="mt-0.5 truncate" title={`${candidate.source.sourceRef} · ${candidate.source.locator}`}>
                {candidate.source.label} · {candidate.source.locator}
              </div>
              {(candidate.source.snapshotId || candidate.source.scenarioId) && (
                <div className="mt-0.5 text-slate-400 truncate">
                  {candidate.source.snapshotId ?? "no snapshot"}
                  {candidate.source.scenarioId ? ` · ${candidate.source.scenarioId}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {input.override && (
        <div className="mt-2 rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] text-blue-800">
          {input.override.actor} · {formatP545Date(input.override.at)} · {input.override.reason}
        </div>
      )}
    </div>
  );
}

function P545ContractStatusBadge({
  status,
}: {
  status: "blocked" | "needs-review" | "ready";
}) {
  const cls = {
    blocked: "border-red-200 bg-red-50 text-red-700",
    "needs-review": "border-amber-200 bg-amber-50 text-amber-700",
    ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  }[status];
  return (
    <span className={`text-[10px] rounded border px-1.5 py-0.5 ${cls}`}>
      {status.replace("-", " ")}
    </span>
  );
}

function P545InputStatusBadge({ status }: { status: P545InputStatus }) {
  const cls: Record<P545InputStatus, string> = {
    resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
    conflict: "border-amber-200 bg-amber-50 text-amber-700",
    missing: "border-red-200 bg-red-50 text-red-700",
    blocked: "border-slate-300 bg-slate-100 text-slate-600",
    overridden: "border-blue-200 bg-blue-50 text-blue-700",
  };
  return (
    <span className={`text-[10px] rounded border px-1.5 py-0.5 ${cls[status]}`}>
      {status}
    </span>
  );
}

function P545SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "red" | "slate" | "blue";
}) {
  const cls = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
  }[tone];
  return (
    <span className={`text-[10px] rounded border px-2 py-1 ${cls}`}>
      {label}: <span className="font-semibold">{value}</span>
    </span>
  );
}

function formatP545Value(value: number | string) {
  return typeof value === "number"
    ? value.toLocaleString("id-ID", { maximumFractionDigits: 7 })
    : value;
}

function formatP545Date(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function MathcadBridgePanel({ template }: { template: CalculationTemplate }) {
  const artifacts = getMathcadArtifactsForTemplate(template.id);
  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-2 bg-slate-50 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Mathcad Bridge</h3>
        <span className="text-[10px] text-slate-500">benchmark readiness</span>
      </div>
      <div className="px-4 py-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Assumptions</div>
          <ul className="space-y-1.5">
            {template.assumptions.map((assumption) => (
              <li key={assumption} className="text-xs text-slate-700 flex gap-2">
                <span className="text-slate-400">-</span>
                <span>{assumption}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Benchmark against Mathcad</div>
          <div className="space-y-2">
            {template.benchmarkAgainst.map((benchmark) => (
              <div key={benchmark.requiredArtifact} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-800">{benchmark.requiredArtifact}</div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">
                    {benchmark.status.replace(/-/g, " ")}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 mt-1">{benchmark.comparisonMethod}</div>
                <div className="text-[10px] text-slate-500 mt-1">Tolerance: {benchmark.tolerance}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
            Indexed XMCD samples
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-white text-slate-500">
            {artifacts.length} artifact{artifacts.length === 1 ? "" : "s"}
          </span>
        </div>
        {artifacts.length === 0 ? (
          <div className="text-xs text-slate-500">
            Belum ada file Mathcad yang di-index untuk template ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            {artifacts.map((artifact) => (
              <div key={artifact.id} className="rounded border border-slate-200 bg-white px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 truncate" title={artifact.fileName}>
                      {artifact.vendor} {artifact.relayFamily} | {artifact.fileName}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {artifact.generator || "Mathcad"} | rev {artifact.revision || "-"} | {Math.round(artifact.fileSizeBytes / 1024)} kB
                    </div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">
                    {artifact.functionGroup}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-slate-600 line-clamp-2">
                  {artifact.textPreview.slice(0, 3).join(" | ")}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {artifact.variableCandidates.slice(0, 8).map((item) => (
                    <span
                      key={`${artifact.id}-${item.name}-${item.value}`}
                      className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600"
                      title={item.unit ? `${item.name} = ${item.value} ${item.unit}` : `${item.name} = ${item.value}`}
                    >
                      {item.name}={formatTemplateNumber(item.value)}
                      {item.unit ? ` ${item.unit}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function formatTemplateNumber(value: number) {
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function ZoneResultTable({ zones }: { zones: DistanceZoneResult[] }) {
  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-2 bg-slate-50 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">
          Final TAP Preview
        </h3>
        <span className="text-[10px] text-slate-500">Primary and secondary ohm</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white border-b border-slate-200 text-xs text-slate-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Zone</th>
              <th className="text-left px-4 py-2 font-medium">Formula</th>
              <th className="text-left px-4 py-2 font-medium">X pri</th>
              <th className="text-left px-4 py-2 font-medium">R pri</th>
              <th className="text-left px-4 py-2 font-medium">X sec</th>
              <th className="text-left px-4 py-2 font-medium">RFPP</th>
              <th className="text-left px-4 py-2 font-medium">RFPE</th>
              <th className="text-left px-4 py-2 font-medium">Delay</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((zone) => (
              <tr key={zone.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-4 py-2 font-semibold text-slate-900">{zone.id}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{zone.formula}</td>
                <td className="px-4 py-2 font-mono text-xs">{zone.xPrimaryOhm}</td>
                <td className="px-4 py-2 font-mono text-xs">{zone.rPrimaryOhm}</td>
                <td className="px-4 py-2 font-mono text-xs">{zone.xSecondaryOhm}</td>
                <td className="px-4 py-2 font-mono text-xs">{zone.rfppOhm}</td>
                <td className="px-4 py-2 font-mono text-xs">{zone.rfpeOhm}</td>
                <td className="px-4 py-2 font-mono text-xs">{zone.delayS}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ValidationPanel({ warnings }: { warnings: string[] }) {
  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">
          Engineering Validation
        </h3>
        <span
          className={`text-[10px] px-2 py-1 rounded border ${warnings.length === 0
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-red-50 text-red-700 border-red-200"
            }`}
        >
          {warnings.length === 0 ? "No warning" : `${warnings.length} warning`}
        </span>
      </div>
      {warnings.length === 0 ? (
        <p className="text-sm text-slate-600 mt-3">
          Semua rule dasar POC terpenuhi. Hasil ini masih perlu benchmark terhadap
          template Mathcad existing sebelum dipakai sebagai calculation resmi.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {warnings.map((warning) => (
            <li key={warning} className="flex gap-2 text-sm text-red-800 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function buildDistanceInputValues(input: DistanceCalculationInput): Record<string, number | string | null> {
  return {
    bayName: input.bayName,
    relayModel: input.relayModel,
    nominalVoltageKv: input.nominalVoltageKv,
    lineLengthKm: input.lineLengthKm,
    r1PerKm: input.r1PerKm,
    x1PerKm: input.x1PerKm,
    nextLineROhm: input.nextLineROhm,
    nextLineXOhm: input.nextLineXOhm,
    ctPrimaryA: input.ctPrimaryA,
    ctSecondaryA: input.ctSecondaryA,
    vtPrimaryKv: input.vtPrimaryKv,
    vtSecondaryV: input.vtSecondaryV,
    z1Percent: input.z1Percent,
    z2Percent: input.z2Percent,
    z3OwnLinePercent: input.z3OwnLinePercent,
    z3NextLinePercent: input.z3NextLinePercent,
    rfppMultiplier: input.rfppMultiplier,
    rfpeMultiplier: input.rfpeMultiplier,
    z2DelayS: input.z2DelayS,
    z3DelayS: input.z3DelayS,
    loadMw: input.loadMw,
    loadPowerFactor: input.loadPowerFactor,
  };
}

function buildDistanceOutputValues(
  result: ReturnType<typeof calculateDistanceSetting>
): Record<string, number | string | null> {
  const values: Record<string, number | string | null> = {
    lineROhm: result.lineROhm,
    lineXOhm: result.lineXOhm,
    lineZOhm: result.lineZOhm,
    lineAngleDeg: result.lineAngleDeg,
    ctRatio: result.ctRatio,
    vtRatio: result.vtRatio,
    secondaryFactor: result.secondaryFactor,
    loadImpedanceOhm: result.loadImpedanceOhm,
  };
  for (const zone of result.zones) {
    const prefix = zone.id.toLowerCase();
    values[`${prefix}XPrimaryOhm`] = zone.xPrimaryOhm;
    values[`${prefix}RPrimaryOhm`] = zone.rPrimaryOhm;
    values[`${prefix}XSecondaryOhm`] = zone.xSecondaryOhm;
    values[`${prefix}RSecondaryOhm`] = zone.rSecondaryOhm;
    values[`${prefix}RfppOhm`] = zone.rfppOhm;
    values[`${prefix}RfpeOhm`] = zone.rfpeOhm;
    values[`${prefix}DelayS`] = zone.delayS;
    values[`${prefix}Formula`] = zone.formula;
  }
  return values;
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
  tone?: "emerald" | "amber" | "red" | "blue";
}) {
  const toneClass = {
    emerald: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200",
    red: "bg-red-50 border-red-200",
    blue: "bg-blue-50 border-blue-200",
  }[tone ?? "emerald"];
  const baseClass = tone ? toneClass : "bg-slate-50 border-slate-200";

  return (
    <div className={`border rounded-md p-3 ${baseClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-900 truncate">{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5 truncate">{sub}</div>
    </div>
  );
}
