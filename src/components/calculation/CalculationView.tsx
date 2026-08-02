import { useEffect, useMemo, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  LockKeyhole,
  Play,
  TriangleAlert,
} from "lucide-react";
import { NumberInput } from "../shared/NumberInput";
import { useProsetStore } from "../../store/useProsetStore";
import { NetworkLine } from "../../domain/seed-network-registry";
import {
  LCD_DIST_REGISTRY,
  promoteMatchedLcdDistCandidates,
} from "../../domain/lcd-dist-import";
import {
  INVENTORY_MASTER_CASE_ID,
  networkLinesFromGraph,
  networkNodesFromGraph,
} from "../../domain/network-graph";
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
import {
  calculateP545DistanceCore,
  type ComplexValue,
  type P545FormulaTrace,
  type P545ParityRow,
} from "../../domain/p545-calculation";
import {
  calculateP545AuxiliaryBlocks,
  type P545AuxiliaryBlock,
  type P545AuxiliaryParityRow,
  type P545AuxiliaryTrace,
} from "../../domain/p545-auxiliary-calculation";
import {
  buildTargetedRecalculationPlan,
  type RecalculationAction,
  type RecalculationStepStatus,
  type TargetedRecalculationPlan,
} from "../../domain/targeted-recalculation";
import {
  buildP545CaseExecutionContract,
  type P545CaseInputOverride,
} from "../../domain/p545-case-execution";
import type { SettingCase } from "../../domain/setting-case";
import { deriveStudyNetwork, getConfirmedMasterNetwork } from "../../domain/study-network";

type InputKey = keyof DistanceCalculationInput;

export function CalculationView() {
  const activeLineId = useProsetStore((s) => s.activeNetworkLineId);
  const networkGraphOverrides = useProsetStore((s) => s.networkGraphOverrides);
  const ctVtOverrides = useProsetStore((s) => s.ctVtOverrides);
  const ensureStudyForLine = useProsetStore((s) => s.ensureStudyForLine);
  const addCalculationSnapshot = useProsetStore((s) => s.addCalculationSnapshot);
  const linkToSettingCase = useProsetStore((s) => s.linkToSettingCase);
  const activeStudy = useProsetStore((s) => s.studies.find((study) => study.id === s.activeStudyId));
  // If a Setting Case's protected scope points at the line currently open
  // here, treat that as the case this calculation belongs to — saved
  // snapshots are linked back to it (BUSINESS_PROCESS_BLUEPRINT.md §8,
  // `Execute calculation` writes a CalculationRun bound to the case).
  const linkedSettingCase = useProsetStore((s) =>
    s.openedFromCaseId
      ? s.settingCases.find((item) => item.id === s.openedFromCaseId)
      : undefined
  );
  const [side, setSide] = useState<"from" | "to">("from");
  const [selectedTemplateId, setSelectedTemplateId] = useState("distance-line-150kv");
  const [savedSnapshotId, setSavedSnapshotId] = useState<string | null>(null);
  const [input, setInput] = useState<DistanceCalculationInput>(
    DEFAULT_DISTANCE_INPUT
  );
  const selectedTemplate = getCalculationTemplate(selectedTemplateId);
  const targetedPlan = useMemo(
    () => buildTargetedRecalculationPlan(linkedSettingCase),
    [linkedSettingCase]
  );
  const result = useMemo(() => calculateDistanceSetting(input), [input]);
  const masterNetworkGraph = useMemo(
    () => getConfirmedMasterNetwork(networkGraphOverrides[INVENTORY_MASTER_CASE_ID]),
    [networkGraphOverrides]
  );
  const studyResolution = useMemo(
    () => deriveStudyNetwork(masterNetworkGraph, activeStudy),
    [activeStudy, masterNetworkGraph]
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
  const masterNodes = useMemo(() => networkNodesFromGraph(masterNetworkGraph), [masterNetworkGraph]);
  const masterLines = useMemo(() => networkLinesFromGraph(masterNetworkGraph), [masterNetworkGraph]);
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
      promoteMatchedLcdDistCandidates(
          LCD_DIST_REGISTRY.records,
          nodes,
          lines
        ).find((line) => line.matchedLineId === activeLineId),
    [nodes, lines, activeLineId]
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
  }, [activeLine, fromNode, toNode, promotedLine, calcIed, side, ctVtOverrides]);

  const updateNumber = (key: InputKey, value: number) => {
    setSavedSnapshotId(null);
    setInput((current) => ({ ...current, [key]: value }));
  };

  const handleSaveCalculationSnapshot = () => {
    if (!activeLine || selectedTemplate.status !== "executable") return;
    const outputValues = buildDistanceOutputValues(result);
    const inputValues = buildDistanceInputValues(input);
    const snapshotId = addCalculationSnapshot({
      caseId: INVENTORY_MASTER_CASE_ID,
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
    if (linkedSettingCase) {
      linkToSettingCase(linkedSettingCase.id, { kind: "calculation", refId: snapshotId });
    }
    setSavedSnapshotId(snapshotId);
  };

  if (!studyResolution.ready || !activeLine) {
    return (
      <div className="space-y-4">
        <TargetedRecalculationOverview plan={targetedPlan} />
        <TargetedCaseExecutionPanel settingCase={linkedSettingCase} />
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-950">Pilih Study berbasis bay/line untuk formula reference</h2>
          <p className="mt-1 text-xs text-amber-800">
            Targeted Recalculation operasional harus dibuka dari Setting Case. Pilihan di bawah hanya menyiapkan line context untuk formula reference; tidak ada fallback ke DKS-DM-PIK-MKB.
          </p>
          {studyResolution.blockers.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-red-800">
              {studyResolution.blockers.map((message) => <li key={message}>- {message}</li>)}
            </ul>
          )}
          <select
            className="mt-4 w-full max-w-xl rounded border border-amber-300 bg-white px-3 py-2 text-sm focus:border-brand-accent focus:outline-none"
            value=""
            onChange={(event) => {
              if (event.target.value) void ensureStudyForLine(event.target.value);
            }}
          >
            <option value="" disabled>Pilih bay/line untuk dianalisis...</option>
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TargetedRecalculationOverview plan={targetedPlan} />
      <TargetedCaseExecutionPanel settingCase={linkedSettingCase} />

      {activeStudy?.sourceBridge?.kind === "legacy_crosscheck_workbook" && (
        <LegacyCrosscheckBenchmarkPanel />
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Line Protection Formula Workspace
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
              Evidence dan formula lab untuk Distance + Line Differential.
              Proposed recalculation hanya boleh dibuat dari baseline issued,
              declared change, dan scenario yang sudah ready di Setting Case.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Current focus</span>
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="bg-white text-xs px-2 py-1.5 rounded border border-slate-300 focus:border-brand-accent focus:outline-none min-w-56"
              >
                {CALCULATION_TEMPLATES.filter(
                  (template) => template.id === "distance-line-150kv"
                ).map((template) => (
                  <option key={template.id} value={template.id}>
                    Distance + Differential P545
                  </option>
                ))}
              </select>
            </label>
            <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
              Formula parity 55/55
            </span>
            {selectedTemplateId === "distance-line-150kv" && (
              <button
                type="button"
                onClick={handleSaveCalculationSnapshot}
                disabled
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400"
                title="Snapshot formula-lab legacy tidak memenuhi gate case"
              >
                <LockKeyhole className="w-3.5 h-3.5" />
                Legacy snapshot disabled
              </button>
            )}
          </div>
        </div>
        <TemplateOverview template={selectedTemplate} />
        {activeLine && (
          <div className="mt-4 border border-brand-accent/40 bg-brand-accent/10 rounded-md px-3 py-2 text-xs text-brand-accent-dark flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                Context:{" "}
                <span className="font-semibold">
                  {localNode?.shortCode} -&gt; {remoteNode?.shortCode} {activeLine.circuit}
                </span>
                <span className="text-brand-accent-dark">
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
                <div className="inline-flex rounded border border-brand-accent/40 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSide("from")}
                    className={`px-2 py-0.5 text-[11px] ${side === "from" ? "bg-brand-ink text-white" : "bg-white text-brand-accent-dark"
                      }`}
                  >
                    {fromNode?.shortCode} side
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide("to")}
                    className={`px-2 py-0.5 text-[11px] border-l border-brand-accent/40 ${side === "to" ? "bg-brand-ink text-white" : "bg-white text-brand-accent-dark"
                      }`}
                  >
                    {toNode?.shortCode} side
                  </button>
                </div>
              )}
            </div>
            <span className="text-brand-accent-dark">
              Prefilled dari {calcIed ? "network graph IED" : promotedLine ? "promoted LCD+DIST" : "registry"}.
            </span>
            {linkedSettingCase && (
              <span className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                Case: {linkedSettingCase.title}
              </span>
            )}
            {savedSnapshotId && (
              <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                Saved to Setting Register
                {linkedSettingCase ? ` & ${linkedSettingCase.title}` : ""}
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
              icon={<Calculator className="w-4 h-4 text-brand-accent-dark" />}
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
        <div className="space-y-4">
          <P545PilotInputContractPanel />
          <P545DistanceCoreParityPanel />
          <P545AuxiliaryParityPanel />
        </div>
      )}

      {selectedTemplate.status !== "executable" ? (
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
          <TemplateInputSpecPanel template={selectedTemplate} />
          <div className="space-y-4">
            <TemplateFormulaPanel template={selectedTemplate} />
            <MathcadBridgePanel template={selectedTemplate} />
          </div>
        </div>
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

type CaseOverrideDraft = {
  value: string;
  reason: string;
  evidenceRef: string;
  at: string;
};

function TargetedCaseExecutionPanel({
  settingCase,
}: {
  settingCase: SettingCase | undefined;
}) {
  const persona = useProsetStore((state) => state.currentPersona);
  const runP545TargetedCalculation = useProsetStore(
    (state) => state.runP545TargetedCalculation
  );
  const allRuns = useProsetStore((state) => state.targetedCalculationRuns);
  const [drafts, setDrafts] = useState<Record<string, CaseOverrideDraft>>({});
  const [runErrors, setRunErrors] = useState<string[]>([]);
  const [lastRunId, setLastRunId] = useState<string | null>(null);

  const baseContract = useMemo(
    () =>
      settingCase
        ? buildP545CaseExecutionContract({ settingCase })
        : undefined,
    [settingCase]
  );
  const overrides = useMemo<P545CaseInputOverride[]>(() => {
    if (!baseContract) return [];
    return Object.entries(drafts).flatMap(([key, draft]) => {
      if (!draft.value.trim()) return [];
      const definition = baseContract.inputs.find((item) => item.key === key);
      if (!definition) return [];
      const parsedValue =
        definition.valueType === "number"
          ? Number(draft.value.replace(",", "."))
          : draft.value;
      return [
        {
          key,
          value: parsedValue,
          reason: draft.reason,
          evidenceRef: draft.evidenceRef,
          actor: persona,
          at: draft.at,
        },
      ];
    });
  }, [baseContract, drafts, persona]);
  const contract = useMemo(
    () =>
      settingCase
        ? buildP545CaseExecutionContract({ settingCase, overrides })
        : undefined,
    [settingCase, overrides]
  );
  const requiredBlockIds = useMemo(
    () =>
      new Set(
        contract?.plan.blocks
          .filter((block) => block.action === "recalculate")
          .map((block) => block.id) ?? []
      ),
    [contract]
  );
  const editableInputs =
    contract?.inputs.filter(
      (item) =>
        item.requiredBy.some((block) => requiredBlockIds.has(block)) &&
        (item.status === "missing" ||
          item.status === "conflict" ||
          item.status === "overridden")
    ) ?? [];
  const latestRun = useMemo(
    () =>
      allRuns.find(
        (run) =>
          run.id === lastRunId ||
          (!lastRunId && run.caseId === settingCase?.id)
      ),
    [allRuns, lastRunId, settingCase?.id]
  );

  const updateDraft = (
    key: string,
    patch: Partial<Omit<CaseOverrideDraft, "at">>
  ) => {
    setDrafts((current) => ({
      ...current,
      [key]: {
        value: current[key]?.value ?? "",
        reason: current[key]?.reason ?? "",
        evidenceRef: current[key]?.evidenceRef ?? "",
        at: current[key]?.at ?? new Date().toISOString(),
        ...patch,
      },
    }));
  };

  if (!settingCase || !contract) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <LockKeyhole className="h-4 w-4 text-slate-500" /> Live case execution
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          Buka workspace ini dari Setting Change Case. Formula lab tetap dapat
          dilihat sebagai benchmark, tetapi tidak dapat membuat run operasional.
        </p>
      </section>
    );
  }

  const canRun =
    settingCase.stage === "calculation" && contract.status === "ready";

  return (
    <section className="overflow-hidden rounded-xl border border-indigo-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-indigo-200 bg-indigo-50 px-5 py-4">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
            Live P545 case adapter
          </div>
          <h2 className="mt-1 text-sm font-semibold text-indigo-950">
            Immutable Targeted Calculation Run
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-indigo-800">
            Input di-resolve dari frozen baseline, proposed revision, scenario,
            dan override engineer. Hanya block berstatus recalculate yang dieksekusi.
          </p>
        </div>
        <span
          className={`rounded border px-2 py-1 text-[10px] font-semibold ${
            contract.status === "ready"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {contract.status}
        </span>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <ExecutionMetric label="Required" value={contract.summary.required} />
          <ExecutionMetric label="Resolved" value={contract.summary.resolved} />
          <ExecutionMetric label="Override" value={contract.summary.overridden} />
          <ExecutionMetric label="Missing" value={contract.summary.missing} />
          <ExecutionMetric label="Conflict" value={contract.summary.conflicts} />
        </div>

        {settingCase.stage !== "calculation" && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Case masih berada pada stage <span className="font-semibold">{settingCase.stage}</span>.
            Contract dapat direview sekarang, tetapi run baru dapat dibuat pada stage Calculation.
          </div>
        )}

        {contract.blockers.length > 0 && (
          <div className="mt-3 space-y-1 rounded border border-red-200 bg-red-50 p-3">
            {contract.blockers.map((message) => (
              <div key={message} className="flex items-start gap-2 text-xs text-red-800">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {message}
              </div>
            ))}
          </div>
        )}

        {editableInputs.length > 0 && (
          <div className="mt-4 overflow-hidden rounded border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Engineering input resolution
              </h3>
              <p className="mt-1 text-[11px] text-slate-500">
                Override wajib memiliki alasan dan evidence reference; nilainya disimpan bersama run.
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {editableInputs.map((item) => {
                const draft = drafts[item.key] ?? {
                  value: "",
                  reason: "",
                  evidenceRef: "",
                  at: "",
                };
                return (
                  <div key={item.key} className="grid gap-2 px-3 py-3 lg:grid-cols-[220px_150px_1fr_1fr]">
                    <div>
                      <div className="text-xs font-medium text-slate-800">{item.label}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {item.key} · {item.unit} · {item.status}
                      </div>
                      {item.issue && (
                        <div className="mt-1 text-[10px] text-amber-700">{item.issue}</div>
                      )}
                    </div>
                    <input
                      value={draft.value}
                      onChange={(event) => updateDraft(item.key, { value: event.target.value })}
                      inputMode={item.valueType === "number" ? "decimal" : undefined}
                      placeholder={`Value (${item.unit})`}
                      className="rounded border border-slate-300 px-2.5 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                    />
                    <input
                      value={draft.reason}
                      onChange={(event) => updateDraft(item.key, { reason: event.target.value })}
                      placeholder="Engineering reason (min. 8 karakter)"
                      className="rounded border border-slate-300 px-2.5 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                    />
                    <input
                      value={draft.evidenceRef}
                      onChange={(event) => updateDraft(item.key, { evidenceRef: event.target.value })}
                      placeholder="Evidence/source reference"
                      className="rounded border border-slate-300 px-2.5 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canRun}
            onClick={() => {
              const result = runP545TargetedCalculation(settingCase.id, overrides);
              if (!result.ok) {
                setRunErrors(result.errors);
                return;
              }
              setRunErrors([]);
              setLastRunId(result.run.id);
            }}
            className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" /> Create proposed run
          </button>
          <span className="text-[11px] text-slate-500">
            Adapter {contract.adapterVersion} · {contract.plan.blocks.filter((item) => item.action === "recalculate").length} executed block
          </span>
        </div>

        {runErrors.map((message) => (
          <div key={message} className="mt-2 text-xs text-red-700">{message}</div>
        ))}

        {latestRun && (
          <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-emerald-900">Proposed run tersimpan</div>
                <div className="mt-1 text-[10px] text-emerald-700">
                  {latestRun.id} · {latestRun.outputs.length} output · {latestRun.executedBlocks.join(", ")}
                </div>
              </div>
              <span className="rounded border border-emerald-300 bg-white px-2 py-1 font-mono text-[10px] text-emerald-800">
                {latestRun.fingerprint.value}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {latestRun.outputs.map((item) => (
                <div key={item.key} className="rounded border border-emerald-200 bg-white px-2.5 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-emerald-600">{item.label}</div>
                  <div className="mt-1 font-mono text-xs font-semibold text-emerald-950">
                    {typeof item.value === "number" ? item.value.toPrecision(8) : item.value} {item.unit}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ExecutionMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function TargetedRecalculationOverview({
  plan,
}: {
  plan: TargetedRecalculationPlan;
}) {
  const activeBlocks = plan.blocks.filter((block) => block.action !== "carry-forward");
  const readinessClass = {
    blocked: "border-red-200 bg-red-50 text-red-700",
    "ready-for-rule-binding": "border-emerald-200 bg-emerald-50 text-emerald-700",
    deferred: "border-slate-200 bg-slate-100 text-slate-600",
  }[plan.processReadiness];

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-gradient-to-r from-brand-ink to-brand-ink-2 px-5 py-5 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold">Targeted Recalculation - Line Protection</h1>
              <span className="rounded border border-brand-accent/30 bg-brand-accent/10 px-2 py-0.5 text-[10px] font-semibold text-brand-accent">
                Distance + Differential
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">
              Mulai dari issued setting aktif, deklarasikan perubahan, hitung ulang
              hanya block terdampak, lalu hasilkan proposed revision. Existing Z1-Z3
              dipakai sebagai baseline pembanding, bukan input rumus baru.
            </p>
          </div>
          <span className={`rounded border px-2 py-1 text-[10px] font-semibold ${readinessClass}`}>
            {plan.processReadiness.replace(/-/g, " ")}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 border-b border-slate-200 md:grid-cols-3">
        <RecalculationModeCard
          title="Targeted recalculation"
          description="Issued baseline + change set + affected block calculation."
          status={plan.mode === "targeted-recalculation" ? "active" : "target"}
        />
        <RecalculationModeCard
          title="Full design from zero"
          description="New bay tanpa issued baseline; data dan coordination contract lebih luas."
          status="deferred"
        />
        <RecalculationModeCard
          title="Actual setting check"
          description="Tetap melalui Crosscheck Case dan native relay readback, bukan halaman ini."
          status="separate"
        />
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
          {plan.steps.map((step, index) => (
            <RecalculationStepCard
              key={step.id}
              index={index + 1}
              label={step.label}
              status={step.status}
              detail={step.detail}
            />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[320px_1fr]">
          <div className="space-y-2">
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                Issued baseline
              </div>
              <div className="mt-1 break-words text-xs font-medium text-slate-800">
                {plan.baselineLabel}
              </div>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                Declared change
              </div>
              <div className="mt-1 text-xs font-medium text-slate-800">
                {plan.changeLabel || "No declared change"}
              </div>
            </div>
            <div className="rounded border border-brand-accent/40 bg-brand-accent/10 px-3 py-2 text-[11px] text-brand-accent-dark">
              <span className="font-semibold">{activeBlocks.length}</span> block perlu
              recalculation/review; {plan.blocks.length - activeBlocks.length} block dapat
              carry-forward dengan provenance baseline.
            </div>
          </div>

          <div className="overflow-hidden rounded border border-slate-200">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Affected calculation blocks
              </h2>
              <span className="text-[10px] text-slate-500">reason-driven matrix v1</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="border-b border-slate-200 text-[9px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Block</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">Required data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plan.blocks.map((block) => (
                    <tr key={block.id} className={block.action === "carry-forward" ? "opacity-60" : ""}>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-slate-800">{block.label}</div>
                        <div className="mt-0.5 text-[9px] text-slate-500">
                          {block.group} - {block.implementation}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <RecalculationActionBadge action={block.action} />
                        {block.reasons.length > 0 && (
                          <div className="mt-1 text-[9px] text-slate-500">
                            {block.reasons.join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-slate-600">
                        {block.requiredData.join("; ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {(plan.blockers.length > 0 || plan.warnings.length > 0) && (
          <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
            {plan.blockers.length > 0 && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-red-800">
                  <LockKeyhole className="h-3.5 w-3.5" /> Recalculation blocked
                </div>
                <ul className="mt-1.5 space-y-1 text-[11px] text-red-800">
                  {plan.blockers.map((blocker) => <li key={blocker}>- {blocker}</li>)}
                </ul>
              </div>
            )}
            {plan.warnings.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                  <TriangleAlert className="h-3.5 w-3.5" /> Current boundary
                </div>
                <ul className="mt-1.5 space-y-1 text-[11px] text-amber-800">
                  {plan.warnings.map((warning) => <li key={warning}>- {warning}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function RecalculationModeCard({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status: "active" | "target" | "deferred" | "separate";
}) {
  const cls = {
    active: "border-brand-accent bg-brand-accent/10",
    target: "border-slate-200 bg-white",
    deferred: "border-slate-200 bg-slate-50",
    separate: "border-slate-200 bg-white",
  }[status];
  return (
    <div className={`border-b px-4 py-3 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 ${cls}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-800">{title}</div>
        <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] text-slate-500">
          {status}
        </span>
      </div>
      <div className="mt-1 text-[10px] leading-4 text-slate-500">{description}</div>
    </div>
  );
}

function RecalculationStepCard({
  index,
  label,
  status,
  detail,
}: {
  index: number;
  label: string;
  status: RecalculationStepStatus;
  detail: string;
}) {
  const cls: Record<RecalculationStepStatus, string> = {
    complete: "border-emerald-200 bg-emerald-50 text-emerald-800",
    current: "border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark",
    blocked: "border-red-200 bg-red-50 text-red-800",
    pending: "border-slate-200 bg-slate-50 text-slate-600",
    deferred: "border-slate-200 bg-slate-100 text-slate-500",
  };
  return (
    <div className={`rounded border px-3 py-2 ${cls[status]}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current/20 bg-white/70 text-[9px] font-bold">
          {index}
        </span>
        <div className="text-[10px] font-semibold uppercase tracking-wider">{label}</div>
      </div>
      <div className="mt-1.5 text-[10px] leading-4 opacity-80">{detail}</div>
    </div>
  );
}

function RecalculationActionBadge({ action }: { action: RecalculationAction }) {
  const cls: Record<RecalculationAction, string> = {
    recalculate: "border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark",
    "engineering-review": "border-amber-200 bg-amber-50 text-amber-700",
    "carry-forward": "border-slate-200 bg-slate-50 text-slate-500",
  };
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-semibold ${cls[action]}`}>
      {action}
    </span>
  );
}

function TemplateOverview({ template }: { template: CalculationTemplate }) {
  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs font-semibold text-slate-900">Legacy reference worksheet - {template.name}</div>
            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] text-amber-700">
              not a live Calculation Run
            </span>
          </div>
          <div className="text-[11px] text-slate-600 mt-0.5 max-w-4xl">
            {template.purpose} Gunakan bagian ini untuk inspeksi/reference; rule P545 parity dan Input Contract berada di panel setelahnya.
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {template.functionIds.map((fn) => (
            <span key={fn} className="text-[10px] px-1.5 py-0.5 rounded border border-brand-accent/40 bg-white text-brand-accent-dark">
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
    <div className="mt-4 rounded-md border border-brand-accent/40 bg-brand-accent/10 px-3 py-2 text-xs text-brand-accent-dark">
      <div className="flex items-start gap-2">
        <ClipboardList className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold">Template belum executable.</div>
          <div className="mt-0.5 text-brand-accent-dark">
            Struktur input, formula, output, asumsi, dan benchmark sudah disiapkan. Langkah berikutnya adalah mengisi formula engine dan benchmark terhadap template Mathcad existing.
          </div>
          {template.nextImplementationStep && (
            <div className="mt-1 text-brand-accent-dark">Next: {template.nextImplementationStep}</div>
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
        className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent/30"
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
            <div className="w-7 h-7 rounded-full bg-brand-accent/10 text-brand-accent-dark border border-brand-accent/40 flex items-center justify-center text-xs font-semibold">
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
            <div className="w-7 h-7 rounded-full bg-brand-accent/10 text-brand-accent-dark border border-brand-accent/40 flex items-center justify-center text-xs font-semibold">
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
          <div className="mt-3 rounded border border-brand-accent/40 bg-brand-accent/10 px-3 py-2 text-[11px] text-brand-accent-dark">
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

function P545DistanceCoreParityPanel() {
  const result = useMemo(() => calculateP545DistanceCore(), []);
  const output = result.outputs;

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900">
              P545 Distance Core - Mathcad Parity
            </h3>
            <span className="text-[10px] rounded border border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark px-1.5 py-0.5">
              MVP 2B.2
            </span>
            <span
              className={`text-[10px] rounded border px-1.5 py-0.5 ${
                result.parity.status === "pass"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {result.parity.status.toUpperCase()} {result.parity.matched}/{result.parity.rows.length}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 max-w-3xl">
            Native TypeScript port untuk blok distance Ciledug - Alam Sutera #1.
            Formula dan intermediate result dibandingkan dengan saved result di XMCD,
            tanpa pembulatan pada jalur hitung.
          </p>
        </div>
        <div className="text-right text-[10px] text-slate-500">
          <div className="font-mono text-slate-700">{result.ruleVersion}</div>
          <div>{result.source.generator} - worksheet {result.source.worksheetVersion}</div>
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <P545CoreMetric label="Z1 forward" value={output.z1SecondaryOhm} unit="ohm sec" />
        <P545CoreMetric label="Z2 forward" value={output.z2SecondaryOhm} unit="ohm sec" />
        <P545CoreMetric label="Z3 forward" value={output.z3SecondaryOhm} unit="ohm sec" />
        <P545CoreMetric label="Z3 reverse" value={output.z3ReverseSecondaryOhm} unit="ohm sec" />
        <P545CoreMetric label="Line angle" value={output.lineAngleDeg} unit="degree" />
        <P545CoreMetric
          label="tZ1 / tZ2 / tZ3"
          value={`${output.t1Seconds} / ${output.t2Seconds} / ${output.t3Seconds}`}
          unit="second"
        />
      </div>

      <div className="mx-4 mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
        Ini masih <span className="font-semibold">benchmark replay</span> dari input historis XMCD,
        bukan live recommended setting. Issuance tetap diblokir sampai P545 Input Contract
        berstatus ready dan engineer menyetujui topology/adjacent equivalent, VT, relay identity,
        serta fault-study scenario.
      </div>

      <div className="border-t border-slate-200">
        <div className="px-4 py-2 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-slate-600">
            Saved-result delta report
          </h4>
          <span className="text-[10px] text-slate-500">
            absolute tolerance {formatP545Exact(result.parity.tolerance)} - display uses round-trip numbers
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="border-y border-slate-200 bg-white text-[9px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">XMCD saved</th>
                <th className="px-3 py-2 font-medium">PLMS actual</th>
                <th className="px-3 py-2 font-medium">Abs delta</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.parity.rows.map((row) => (
                <P545ParityTableRow key={row.key} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details className="border-t border-slate-200">
        <summary className="cursor-pointer bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-100">
          Formula trace ({result.trace.length} intermediate steps)
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="border-b border-slate-200 text-[9px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Key</th>
                <th className="px-3 py-2 font-medium">Formula</th>
                <th className="px-3 py-2 font-medium">Full-precision result</th>
                <th className="px-3 py-2 font-medium">XMCD locator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.trace.map((step) => (
                <P545TraceTableRow key={step.key} step={step} />
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[10px] text-slate-500">
        Source digest: <span className="font-mono">{result.source.validationDigest}</span> - {result.source.sourceFile}
      </div>
    </section>
  );
}

const P545_AUXILIARY_BLOCKS: Array<
  Exclude<P545AuxiliaryBlock, "autoreclose-policy">
> = [
  "residual-compensation",
  "resistive-reach",
  "load-blinder-psb",
  "line-differential",
];

const P545_AUXILIARY_BLOCK_LABELS: Record<P545AuxiliaryBlock, string> = {
  "residual-compensation": "Residual compensation kZ0",
  "resistive-reach": "Resistive reach",
  "load-blinder-psb": "Load blinder / power swing",
  "line-differential": "Line differential LCD",
  "autoreclose-policy": "Autoreclose policy",
};

function P545AuxiliaryParityPanel() {
  const result = useMemo(() => calculateP545AuxiliaryBlocks(), []);
  const output = result.outputs;
  const ar = output.autoreclosePolicy;

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900">
              P545 Auxiliary Blocks - Mathcad Parity
            </h3>
            <span className="text-[10px] rounded border border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark px-1.5 py-0.5">
              MVP 2B.3
            </span>
            <span
              className={`text-[10px] rounded border px-1.5 py-0.5 ${
                result.parity.status === "pass"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {result.parity.status.toUpperCase()} {result.parity.matched}/{result.parity.rows.length}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 max-w-3xl">
            Port lanjutan untuk residual compensation, resistive reach, load
            blinder/power swing, dan line differential. Autoreclose ditampilkan
            sebagai extracted policy karena worksheet tidak memiliki ekspresi kalkulasi AR.
          </p>
        </div>
        <div className="text-right text-[10px] text-slate-500">
          <div className="font-mono text-slate-700">{result.ruleVersion}</div>
          <div>
            max delta {formatP545Exact(result.parity.maxAbsoluteDelta)} - tolerance {formatP545Exact(result.parity.tolerance)}
          </div>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
        <P545AuxiliaryMetric
          label="kZ0"
          value={`${formatP545Exact(output.residualCompensation.magnitude)} / ${formatP545Exact(output.residualCompensation.angleDeg)} deg`}
          sub="magnitude / angle"
        />
        <P545AuxiliaryMetric
          label="Phase reach Z1 / Z2 / Z3"
          value={`${formatP545Exact(output.resistiveReach.phaseReachByZone.z1)} / ${formatP545Exact(output.resistiveReach.phaseReachByZone.z2)} / ${formatP545Exact(output.resistiveReach.phaseReachByZone.z3)}`}
          sub="ohm secondary"
        />
        <P545AuxiliaryMetric
          label="Ground reach Z1 / Z2 / Z3"
          value={`${formatP545Exact(output.resistiveReach.groundReachByZone.z1)} / ${formatP545Exact(output.resistiveReach.groundReachByZone.z2)} / ${formatP545Exact(output.resistiveReach.groundReachByZone.z3)}`}
          sub="ohm secondary"
        />
        <P545AuxiliaryMetric
          label="Blinder / PSB"
          value={`${formatP545Exact(output.loadBlinderAndPowerSwing.blinderSecondaryOhm)} / ${formatP545Exact(output.loadBlinderAndPowerSwing.deltaRSecondaryOhm)}`}
          sub="ZB / delta R-X, ohm secondary"
        />
        <P545AuxiliaryMetric
          label="LCD Is1 / Is2"
          value={`${formatP545Exact(output.lineDifferential.selectedIs1SecondaryA)} / ${formatP545Exact(output.lineDifferential.is2SecondaryA)}`}
          sub={`A secondary - k1 ${output.lineDifferential.slopeK1} / k2 ${output.lineDifferential.slopeK2}`}
        />
      </div>

      <div className="mx-4 mb-4 grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-3">
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          Semua angka masih benchmark replay. `Ihs3f = 26.240 A`, CT/VT,
          CCC, sequence impedance, dan line susceptance berasal dari worksheet historis;
          live Calculation Run tetap harus mengambil nilai dari input contract/scenario yang disetujui.
        </div>
        <div className="rounded border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] text-violet-900 min-w-72">
          <div className="font-semibold">Autoreclose - extracted policy</div>
          <div className="mt-0.5">
            Mode {ar.tripMode} - dead {ar.deadTime1Seconds}s - reclaim {ar.reclaimTimeSeconds}s - pulse {ar.pulseTimeSeconds}s
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 divide-y divide-slate-200">
        {P545_AUXILIARY_BLOCKS.map((block) => {
          const rows = result.parity.rows.filter((row) => row.block === block);
          const trace = result.trace.filter((step) => step.block === block);
          const summary = result.parity.byBlock[block];
          return (
            <details key={block}>
              <summary className="cursor-pointer bg-slate-50 px-4 py-3 hover:bg-slate-100 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-700">
                  {P545_AUXILIARY_BLOCK_LABELS[block]}
                </span>
                <span
                  className={`text-[10px] rounded border px-1.5 py-0.5 ${
                    summary.mismatched === 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {summary.matched}/{rows.length} match - {trace.length} steps
                </span>
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="border-b border-slate-200 bg-white text-[9px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Result</th>
                      <th className="px-3 py-2 font-medium">XMCD saved</th>
                      <th className="px-3 py-2 font-medium">PLMS actual</th>
                      <th className="px-3 py-2 font-medium">Abs delta</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <P545ParityTableRow key={row.key} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[9px] uppercase tracking-wider font-semibold text-slate-500">
                Intermediate formula trace
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <tbody className="divide-y divide-slate-100">
                    {trace.map((step) => (
                      <P545AuxiliaryTraceRow key={step.key} step={step} />
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </div>

      <details className="border-t border-slate-200">
        <summary className="cursor-pointer bg-violet-50 px-4 py-3 text-xs font-semibold text-violet-800 hover:bg-violet-100">
          Autoreclose policy evidence - not a calculated parity block
        </summary>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          {result.trace
            .filter((step) => step.block === "autoreclose-policy")
            .map((step) => (
              <div key={step.key} className="rounded border border-violet-100 bg-white px-3 py-2">
                <div className="text-[10px] font-semibold text-violet-900">{step.label}</div>
                <div className="mt-1 font-mono text-xs text-slate-800">
                  {formatP545AuxiliaryValue(step.value)} {step.unit}
                </div>
                <div className="mt-1 text-[9px] text-slate-500">{step.sourceLocator}</div>
              </div>
            ))}
        </div>
      </details>
    </section>
  );
}

function P545AuxiliaryMetric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-[11px] font-semibold text-slate-900 break-words">{value}</div>
      <div className="mt-0.5 text-[9px] text-slate-400">{sub}</div>
    </div>
  );
}

function P545AuxiliaryTraceRow({ step }: { step: P545AuxiliaryTrace }) {
  return (
    <tr>
      <td className="px-4 py-2 align-top min-w-40">
        <div className="font-mono font-semibold text-slate-800">{step.key}</div>
        <div className="text-[9px] text-slate-500">{step.label}</div>
      </td>
      <td className="px-3 py-2 align-top font-mono text-slate-700 min-w-72">{step.formula}</td>
      <td className="px-3 py-2 align-top font-mono text-slate-700 whitespace-nowrap">
        {formatP545AuxiliaryValue(step.value)} {step.unit}
      </td>
      <td className="px-3 py-2 align-top text-slate-500">{step.sourceLocator}</td>
    </tr>
  );
}

function formatP545AuxiliaryValue(value: P545AuxiliaryTrace["value"]) {
  if (typeof value === "string") return value;
  return formatP545TraceValue(value);
}

function P545CoreMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string;
  unit: string;
}) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-xs font-semibold text-slate-900">
        {typeof value === "number" ? formatP545Exact(value) : value}
      </div>
      <div className="text-[9px] text-slate-400">{unit}</div>
    </div>
  );
}

function P545ParityTableRow({
  row,
}: {
  row: P545ParityRow | P545AuxiliaryParityRow;
}) {
  const badge = {
    exact: "border-emerald-200 bg-emerald-50 text-emerald-700",
    "within-tolerance": "border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark",
    mismatch: "border-red-200 bg-red-50 text-red-700",
  }[row.status];
  return (
    <tr>
      <td className="px-4 py-2">
        <div className="font-medium text-slate-800">{row.label}</div>
        <div className="text-[9px] text-slate-400">{row.sourceLocator} - {row.unit}</div>
      </td>
      <td className="px-3 py-2 font-mono text-slate-700">{formatP545Exact(row.expected)}</td>
      <td className="px-3 py-2 font-mono text-slate-700">{formatP545Exact(row.actual)}</td>
      <td className="px-3 py-2 font-mono text-slate-700">{formatP545Exact(row.absoluteDelta)}</td>
      <td className="px-3 py-2">
        <span className={`rounded border px-1.5 py-0.5 text-[9px] ${badge}`}>
          {row.status}
        </span>
      </td>
    </tr>
  );
}

function P545TraceTableRow({ step }: { step: P545FormulaTrace }) {
  return (
    <tr>
      <td className="px-4 py-2 align-top">
        <div className="font-mono font-semibold text-slate-800">{step.key}</div>
        <div className="text-[9px] text-slate-500">{step.label}</div>
      </td>
      <td className="px-3 py-2 align-top font-mono text-slate-700 min-w-72">
        {step.formula}
      </td>
      <td className="px-3 py-2 align-top font-mono text-slate-700 whitespace-nowrap">
        {formatP545TraceValue(step.value)} {step.unit}
      </td>
      <td className="px-3 py-2 align-top text-slate-500">{step.sourceLocator}</td>
    </tr>
  );
}

function formatP545TraceValue(value: number | ComplexValue) {
  return typeof value === "number"
    ? formatP545Exact(value)
    : `${formatP545Exact(value.re)} + j${formatP545Exact(value.im)}`;
}

function formatP545Exact(value: number) {
  return Number.isFinite(value) ? value.toString() : "invalid";
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
            <span className="text-[10px] rounded border border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark px-1.5 py-0.5">
              MVP 2B.1
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 max-w-3xl">
            Ciledug → Alam Sutera #1. Ini adalah gerbang input typed/unit-aware
            untuk menjalankan rule P545 yang sudah dipindahkan dari Mathcad.
            Report parity di bawah masih benchmark replay. Live Calculation Run
            tetap terkunci sampai contract case berstatus ready dan adapter 2B.4 tersedia.
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
            className="bg-white text-xs px-2 py-1.5 rounded border border-slate-300 focus:border-brand-accent focus:outline-none"
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
              className="bg-white text-xs px-2 py-2 rounded border border-slate-300 focus:border-brand-accent focus:outline-none"
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
              className="bg-white text-xs px-2 py-2 rounded border border-slate-300 focus:border-brand-accent focus:outline-none"
            />
            <input
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              placeholder="Engineering reason and evidence..."
              className="bg-white text-xs px-2 py-2 rounded border border-slate-300 focus:border-brand-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={applyOverride}
              className="rounded border border-brand-accent/40 bg-brand-accent/10 px-3 py-2 text-xs font-medium text-brand-accent-dark hover:bg-brand-accent/20"
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
              className="text-[10px] text-brand-accent-dark hover:text-brand-ink hover:underline"
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
        <div className="mt-2 rounded border border-brand-accent/40 bg-brand-accent/10 px-2 py-1.5 text-[10px] text-brand-accent-dark">
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
    overridden: "border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark",
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
    blue: "border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark",
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
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark">
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
    blue: "bg-brand-accent/10 border-brand-accent/40",
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
