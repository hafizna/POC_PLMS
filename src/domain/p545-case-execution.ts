import {
  calculateP545AuxiliaryBlocks,
  P545_AUXILIARY_RULE_VERSION,
  P545_CILEDUG_ALAM_SUTERA_AUXILIARY_INPUT,
  type P545AuxiliaryBlock,
  type P545AuxiliaryInput,
  type P545AuxiliaryTrace,
} from "./p545-auxiliary-calculation";
import {
  calculateP545DistanceCore,
  P545_CILEDUG_ALAM_SUTERA_BENCHMARK_INPUT,
  P545_DISTANCE_CORE_RULE_VERSION,
  type P545DistanceCoreInput,
  type P545FormulaTrace,
} from "./p545-calculation";
import {
  buildTargetedRecalculationPlan,
  type LineProtectionBlockId,
  type RecalculationBlockPlan,
  type TargetedRecalculationPlan,
} from "./targeted-recalculation";
import type { ProposedDataRevision } from "./case-proposed-revision";
import type { SettingCase } from "./setting-case";
import type { LineRelation, RelayIED, RelaySetting } from "./unified";

export const P545_CASE_ADAPTER_VERSION = "p545-case-adapter.v1" as const;
export const P545_POLICY_VERSION = "p545-policy-from-ciledug-benchmark.v1" as const;

export type P545CaseInputSourceKind =
  | "frozen-baseline"
  | "proposed-revision"
  | "study-scenario"
  | "versioned-policy"
  | "engineering-override";

export type P545CaseInputSource = {
  kind: P545CaseInputSourceKind;
  refId: string;
  locator: string;
  label: string;
};

export type P545CaseInputStatus =
  | "resolved"
  | "missing"
  | "conflict"
  | "overridden";

export type P545CaseInputOverride = {
  key: string;
  value: number | string;
  reason: string;
  evidenceRef: string;
  actor: string;
  at: string;
};

export type P545CaseInput = {
  key: string;
  label: string;
  unit: string;
  valueType: "number" | "string";
  requiredBy: LineProtectionBlockId[];
  status: P545CaseInputStatus;
  value: number | string | null;
  source?: P545CaseInputSource;
  issue?: string;
  override?: P545CaseInputOverride;
};

export type P545CaseExecutionContract = {
  schema: "plms.p545-case-execution-contract.v1";
  id: string;
  adapterVersion: typeof P545_CASE_ADAPTER_VERSION;
  caseId: string;
  baselineId?: string;
  proposedRevisionId?: string;
  studyPackageBindingId?: string;
  subjectLineId?: string;
  localRelayId?: string;
  remoteRelayId?: string;
  plan: TargetedRecalculationPlan;
  status: "blocked" | "ready";
  inputs: P545CaseInput[];
  blockers: string[];
  warnings: string[];
  summary: {
    resolved: number;
    overridden: number;
    missing: number;
    conflicts: number;
    required: number;
  };
};

export type TargetedCalculationOutput = {
  key: string;
  block: LineProtectionBlockId;
  label: string;
  value: number | string;
  unit: string;
};

export type TargetedCalculationComparison = {
  key: string;
  block: LineProtectionBlockId;
  label: string;
  before: number | string | null;
  proposed: number | string;
  delta: number | null;
  unit: string;
  status: "changed" | "unchanged" | "new-value" | "basis-unresolved";
  note?: string;
};

export type TargetedCalculationRun = {
  schema: "plms.targeted-calculation-run.v1";
  id: string;
  caseId: string;
  baselineId: string;
  baselineFingerprint: string;
  proposedRevisionId?: string;
  proposedRevisionFingerprint?: string;
  studyPackageBindingId?: string;
  studyPackageFingerprint?: string;
  subjectLineId: string;
  localRelayId: string;
  relayModel: string;
  createdAt: string;
  createdBy: string;
  status: "proposed";
  adapterVersion: typeof P545_CASE_ADAPTER_VERSION;
  ruleVersions: string[];
  policyVersion: typeof P545_POLICY_VERSION;
  blockDecisions: RecalculationBlockPlan[];
  executedBlocks: LineProtectionBlockId[];
  inputs: P545CaseInput[];
  outputs: TargetedCalculationOutput[];
  comparisons: TargetedCalculationComparison[];
  trace: Array<P545FormulaTrace | P545AuxiliaryTrace>;
  warnings: string[];
  fingerprint: {
    algorithm: "fnv1a32";
    value: string;
  };
};

export type ExecuteP545CaseResult =
  | { ok: true; run: TargetedCalculationRun; contract: P545CaseExecutionContract }
  | { ok: false; errors: string[]; contract: P545CaseExecutionContract };

type ResolvedValue = {
  value: number | string | null;
  status: P545CaseInputStatus;
  source?: P545CaseInputSource;
  issue?: string;
};

const AUXILIARY_BLOCKS = new Set<LineProtectionBlockId>([
  "residual-compensation",
  "resistive-reach",
  "load-blinder-psb",
  "line-differential",
]);

export function buildP545CaseExecutionContract(input: {
  settingCase: SettingCase;
  overrides?: readonly P545CaseInputOverride[];
}): P545CaseExecutionContract {
  const settingCase = input.settingCase;
  const plan = buildTargetedRecalculationPlan(settingCase);
  const baseline = settingCase.baseline;
  const latestProposal = last(settingCase.proposedDataRevisions);
  const latestPackage = last(settingCase.studyPackageBindings);
  const blockers = [...plan.blockers];
  const warnings = [...plan.warnings];
  const requiredBlocks = new Set(
    plan.blocks
      .filter((block) => block.action === "recalculate")
      .map((block) => block.id)
  );

  if (!baseline) {
    return finishContract({
      settingCase,
      plan,
      inputs: [],
      blockers,
      warnings,
      latestProposal,
      latestPackage,
    });
  }

  const subjectLine =
    baseline.network.lineRelations.find(
      (line) => line.id === baseline.protectedScope.subjectLineId
    ) ?? baseline.network.lineRelations[0];
  if (!subjectLine) blockers.push("Frozen baseline tidak memiliki subject LineRelation.");

  const localSide = resolveLocalSide(settingCase, subjectLine);
  if (!localSide) blockers.push("Subject bay tidak menunjuk salah satu endpoint line baseline.");
  const localRelay = findRelayAtBay(baseline.network.relayIeds, localSide?.localBayId);
  const remoteRelay = findRelayAtBay(baseline.network.relayIeds, localSide?.remoteBayId);
  if (!localRelay) blockers.push("Relay lokal pada subject bay tidak ditemukan di frozen baseline.");
  if (!remoteRelay) warnings.push("Relay remote tidak ditemukan; LCD CT correction mungkin perlu override.");
  if (localRelay && !/P54[345]/i.test(localRelay.model)) {
    blockers.push(`Relay ${localRelay.model} belum didukung oleh adapter P545 pilot.`);
  }

  const proposed = fieldMap(latestProposal);
  const baselineSource = (locator: string, label = "Frozen case baseline"): P545CaseInputSource => ({
    kind: "frozen-baseline",
    refId: baseline.id,
    locator,
    label,
  });
  const proposalSource = (locator: string): P545CaseInputSource => ({
    kind: "proposed-revision",
    refId: latestProposal?.id ?? "missing-proposal",
    locator,
    label: `Proposed Data Revision v${latestProposal?.version ?? "?"}`,
  });
  const policySource = (locator: string): P545CaseInputSource => ({
    kind: "versioned-policy",
    refId: P545_POLICY_VERSION,
    locator,
    label: "P545 policy validated against Ciledug–Alam Sutera benchmark",
  });

  const protectedValues = subjectLine
    ? resolveProtectedLine(subjectLine, proposed, baselineSource, proposalSource)
    : {};
  const adjacent = subjectLine && localSide
    ? resolveAdjacentLines(baseline.network.lineRelations, subjectLine, localSide)
    : {};
  const relayValues = resolveRelayInputs(localRelay, remoteRelay, proposed, baselineSource, proposalSource);
  const transformer = resolveTransformerInput(
    baseline.network.transformers ?? [],
    localSide?.remoteSubstationId,
    subjectLine?.voltageKv,
    baselineSource
  );
  const scenarioFault = resolveScenarioFault(settingCase, localSide?.localSubstationId);

  const resolved: Record<string, ResolvedValue> = {
    relay_model: value(localRelay?.model ?? null, localRelay ? baselineSource(`relayIeds.${localRelay.id}.model`) : undefined),
    nominal_voltage_kv: value(subjectLine?.voltageKv ?? null, subjectLine ? baselineSource(`lineRelations.${subjectLine.id}.voltageKv`) : undefined),
    ...protectedValues,
    ...adjacent,
    ...relayValues,
    ...transformer,
    ...scenarioFault,
    arc_spacing: missing("Conductor spacing untuk arc-resistance belum tersedia pada frozen technical data."),
    normal_diff_current_a: missing("Normal differential current harus berasal dari approved study/issued LCD basis."),
    frequency_hz: value(50, policySource("system.frequency_hz")),
  };

  const definitions = inputDefinitions();
  const overrides = new Map((input.overrides ?? []).map((item) => [item.key, item]));
  const inputs = definitions.map((definition) => {
    const base = resolved[definition.key] ?? missing("Input belum memiliki resolver 2B.4.");
    const override = overrides.get(definition.key);
    const required = definition.requiredBy.some((block) => requiredBlocks.has(block));
    if (!override) {
      return { ...definition, ...base };
    }
    const overrideError = validateOverride(override, definition.valueType);
    if (overrideError) {
      if (required) blockers.push(`${definition.label}: ${overrideError}`);
      return { ...definition, ...base, issue: overrideError };
    }
    return {
      ...definition,
      status: "overridden" as const,
      value: override.value,
      source: {
        kind: "engineering-override" as const,
        refId: override.evidenceRef,
        locator: definition.key,
        label: `Override by ${override.actor}`,
      },
      override: { ...override },
    };
  });

  for (const item of inputs) {
    if (
      item.requiredBy.some((block) => requiredBlocks.has(block)) &&
      (item.status === "missing" || item.status === "conflict")
    ) {
      blockers.push(`${item.label}: ${item.issue ?? "required input unresolved"}`);
    }
  }
  if (requiredBlocks.size === 0) {
    blockers.push(
      "Case ini tidak memiliki formula block berstatus recalculate; engineering-review decision tidak boleh disimpan sebagai Calculation Run."
    );
  }

  return finishContract({
    settingCase,
    plan,
    inputs,
    blockers,
    warnings,
    latestProposal,
    latestPackage,
    subjectLine,
    localRelay,
    remoteRelay,
  });
}

export function executeP545CaseCalculation(input: {
  settingCase: SettingCase;
  overrides?: readonly P545CaseInputOverride[];
  runId: string;
  executedAt: string;
  executedBy: string;
}): ExecuteP545CaseResult {
  const contract = buildP545CaseExecutionContract(input);
  if (contract.status !== "ready") {
    return { ok: false, errors: contract.blockers, contract };
  }
  const settingCase = input.settingCase;
  const baseline = settingCase.baseline;
  if (!baseline || !contract.subjectLineId || !contract.localRelayId) {
    return { ok: false, errors: ["Execution identity tidak lengkap."], contract };
  }
  const values = numericValues(contract.inputs);
  const executedBlocks = contract.plan.blocks
    .filter((block) => block.action === "recalculate")
    .map((block) => block.id);
  const outputs: TargetedCalculationOutput[] = [];
  const trace: Array<P545FormulaTrace | P545AuxiliaryTrace> = [];
  const ruleVersions: string[] = [];

  if (executedBlocks.includes("distance-core")) {
    const core = calculateP545DistanceCore(buildDistanceInput(values, settingCase));
    ruleVersions.push(P545_DISTANCE_CORE_RULE_VERSION);
    outputs.push(
      output("distance.z1", "distance-core", "Zone 1 forward", core.outputs.z1SecondaryOhm, "ohm-secondary"),
      output("distance.z2", "distance-core", "Zone 2 forward", core.outputs.z2SecondaryOhm, "ohm-secondary"),
      output("distance.z3", "distance-core", "Zone 3 forward", core.outputs.z3SecondaryOhm, "ohm-secondary"),
      output("distance.z3_reverse", "distance-core", "Zone 3 reverse", core.outputs.z3ReverseSecondaryOhm, "ohm-secondary"),
      output("distance.t1", "distance-core", "Zone 1 timer", core.outputs.t1Seconds, "second"),
      output("distance.t2", "distance-core", "Zone 2 timer", core.outputs.t2Seconds, "second"),
      output("distance.t3", "distance-core", "Zone 3 timer", core.outputs.t3Seconds, "second")
    );
    trace.push(...core.trace);
  }

  if (executedBlocks.some((block) => AUXILIARY_BLOCKS.has(block))) {
    const auxiliary = calculateP545AuxiliaryBlocks(
      buildAuxiliaryInput(values, executedBlocks)
    );
    ruleVersions.push(P545_AUXILIARY_RULE_VERSION);
    appendAuxiliaryOutputs(outputs, auxiliary.outputs, executedBlocks);
    trace.push(
      ...auxiliary.trace.filter((item) => executedBlocks.includes(item.block))
    );
  }

  const localRelay = baseline.network.relayIeds.find((item) => item.id === contract.localRelayId);
  const baselineSetting = baseline.network.relaySettings?.find(
    (item) => item.relayIedId === contract.localRelayId
  );
  const comparisons = buildComparisons(outputs, baselineSetting);
  const latestProposal = last(settingCase.proposedDataRevisions);
  const latestPackage = last(settingCase.studyPackageBindings);
  const payload = {
    schema: "plms.targeted-calculation-run.v1" as const,
    id: input.runId,
    caseId: settingCase.id,
    baselineId: baseline.id,
    baselineFingerprint: baseline.fingerprint.value,
    proposedRevisionId: latestProposal?.id,
    proposedRevisionFingerprint: latestProposal?.fingerprint.value,
    studyPackageBindingId: latestPackage?.id,
    studyPackageFingerprint: latestPackage?.fingerprint.value,
    subjectLineId: contract.subjectLineId,
    localRelayId: contract.localRelayId,
    relayModel: localRelay?.model ?? "unknown",
    createdAt: input.executedAt,
    createdBy: input.executedBy,
    status: "proposed" as const,
    adapterVersion: P545_CASE_ADAPTER_VERSION as typeof P545_CASE_ADAPTER_VERSION,
    ruleVersions: unique(ruleVersions),
    policyVersion: P545_POLICY_VERSION,
    blockDecisions: contract.plan.blocks.map((item) => ({ ...item, reasons: [...item.reasons], requiredData: [...item.requiredData] })),
    executedBlocks,
    inputs: contract.inputs.map((item) => ({ ...item, requiredBy: [...item.requiredBy], override: item.override ? { ...item.override } : undefined, source: item.source ? { ...item.source } : undefined })),
    outputs,
    comparisons,
    trace,
    warnings: unique([
      ...contract.warnings,
      ...(comparisons.some((item) => item.status === "basis-unresolved")
        ? ["Issued distance reach exists, but its primary/secondary basis is not explicit; numeric reach delta is intentionally withheld."]
        : []),
    ]),
  };

  return {
    ok: true,
    contract,
    run: {
      ...payload,
      fingerprint: { algorithm: "fnv1a32", value: fnv1a32(stableStringify(payload)) },
    },
  };
}

function inputDefinitions(): Array<Pick<P545CaseInput, "key" | "label" | "unit" | "valueType" | "requiredBy">> {
  const distance: LineProtectionBlockId[] = ["distance-core"];
  const residual: LineProtectionBlockId[] = ["residual-compensation"];
  const resistive: LineProtectionBlockId[] = ["resistive-reach"];
  const load: LineProtectionBlockId[] = ["load-blinder-psb"];
  const lcd: LineProtectionBlockId[] = ["line-differential"];
  const protectedAll = [...distance, ...residual, ...resistive, ...load, ...lcd];
  return [
    def("relay_model", "Relay model", "model", "string", [...distance, ...residual, ...resistive, ...load, ...lcd]),
    def("nominal_voltage_kv", "Nominal voltage", "kV", "number", [...distance, ...resistive, ...load, ...lcd]),
    def("line_length_km", "Protected line length", "km", "number", protectedAll),
    def("line_r1_ohm", "Protected line R1 total", "ohm-primary", "number", [...distance, ...residual]),
    def("line_x1_ohm", "Protected line X1 total", "ohm-primary", "number", [...distance, ...residual]),
    def("line_r0_ohm", "Protected line R0 total", "ohm-primary", "number", residual),
    def("line_x0_ohm", "Protected line X0 total", "ohm-primary", "number", residual),
    def("forward_length_km", "Forward adjacent length", "km", "number", distance),
    def("forward_r1_ohm", "Forward adjacent R1 total", "ohm-primary", "number", distance),
    def("forward_x1_ohm", "Forward adjacent X1 total", "ohm-primary", "number", distance),
    def("reverse_length_km", "Reverse adjacent length", "km", "number", distance),
    def("reverse_r1_ohm", "Reverse adjacent R1 total", "ohm-primary", "number", distance),
    def("reverse_x1_ohm", "Reverse adjacent X1 total", "ohm-primary", "number", distance),
    def("second_forward_length_km", "Second forward length", "km", "number", distance),
    def("second_forward_r1_ohm", "Second forward R1 total", "ohm-primary", "number", distance),
    def("second_forward_x1_ohm", "Second forward X1 total", "ohm-primary", "number", distance),
    def("ct_primary_a", "Local CT primary", "A", "number", [...distance, ...resistive, ...load, ...lcd]),
    def("ct_secondary_a", "Local CT secondary", "A", "number", [...distance, ...resistive, ...load, ...lcd]),
    def("vt_primary_kv", "Local VT primary", "kV", "number", [...distance, ...resistive, ...load, ...lcd]),
    def("vt_secondary_v", "Local VT secondary", "V", "number", [...distance, ...resistive, ...load, ...lcd]),
    def("remote_ct_primary_a", "Remote CT primary", "A", "number", lcd),
    def("remote_ct_secondary_a", "Remote CT secondary", "A", "number", lcd),
    def("transformer_mva", "Remote transformer rating", "MVA", "number", distance),
    def("transformer_reactance_pct", "Remote transformer reactance", "%", "number", distance),
    def("continuous_current_a", "Continuous current criterion", "A", "number", [...resistive, ...load]),
    def("fault_3ph_ka", "3-phase fault current", "kA", "number", resistive),
    def("arc_spacing", "Arc conductor spacing", "m", "number", resistive),
    def("line_c1_nf_per_km", "Positive-sequence capacitance C1", "nF/km", "number", lcd),
    def("normal_diff_current_a", "Normal differential current", "A-primary", "number", lcd),
    def("frequency_hz", "System frequency", "Hz", "number", lcd),
  ];
}

function resolveProtectedLine(
  line: LineRelation,
  proposed: Map<string, number | string>,
  baselineSource: (locator: string) => P545CaseInputSource,
  proposalSource: (locator: string) => P545CaseInputSource
): Record<string, ResolvedValue> {
  return {
    line_length_km: proposedOrBaseline(proposed, "line.physical_length_km", line.physicalLengthKm, baselineSource, proposalSource, `lineRelations.${line.id}.physicalLengthKm`),
    line_r1_ohm: proposedOrBaseline(proposed, "line.r1_ohm", line.r1Ohm, baselineSource, proposalSource, `lineRelations.${line.id}.r1Ohm`),
    line_x1_ohm: proposedOrBaseline(proposed, "line.x1_ohm", line.x1Ohm ?? line.lineXOhm, baselineSource, proposalSource, `lineRelations.${line.id}.x1Ohm`),
    line_r0_ohm: proposedOrBaseline(proposed, "line.r0_ohm", line.r0Ohm, baselineSource, proposalSource, `lineRelations.${line.id}.r0Ohm`),
    line_x0_ohm: proposedOrBaseline(proposed, "line.x0_ohm", line.x0Ohm, baselineSource, proposalSource, `lineRelations.${line.id}.x0Ohm`),
    continuous_current_a: proposedOrBaseline(proposed, "line.current_rating_a", line.currentRatingKa === undefined ? undefined : line.currentRatingKa * 1000, baselineSource, proposalSource, `lineRelations.${line.id}.currentRatingKa`),
    line_c1_nf_per_km: proposed.has("line.c1_nf_per_km")
      ? value(proposed.get("line.c1_nf_per_km") ?? null, proposalSource("line.c1_nf_per_km"))
      : missing("C1 belum tersedia pada LineRelation baseline; isi dari technical revision/evidence."),
  };
}

function resolveAdjacentLines(
  lines: readonly LineRelation[],
  subject: LineRelation,
  side: NonNullable<ReturnType<typeof resolveLocalSide>>
): Record<string, ResolvedValue> {
  const forwardCandidates = lines.filter(
    (line) => line.id !== subject.id && touches(line, side.remoteSubstationId)
  );
  const reverseCandidates = lines.filter(
    (line) => line.id !== subject.id && touches(line, side.localSubstationId)
  );
  const forward = forwardCandidates.length === 1 ? forwardCandidates[0] : undefined;
  const reverse = reverseCandidates.length === 1 ? reverseCandidates[0] : undefined;
  const forwardFarEnd = forward
    ? otherEnd(forward, side.remoteSubstationId)
    : undefined;
  const secondCandidates = forwardFarEnd
    ? lines.filter((line) => line.id !== subject.id && line.id !== forward?.id && touches(line, forwardFarEnd))
    : [];
  const second = secondCandidates.length === 1 ? secondCandidates[0] : undefined;
  return {
    ...lineEquivalent("forward", forward, forwardCandidates.length),
    ...lineEquivalent("reverse", reverse, reverseCandidates.length),
    ...lineEquivalent("second_forward", second, secondCandidates.length),
  };
}

function lineEquivalent(prefix: string, line: LineRelation | undefined, candidateCount: number): Record<string, ResolvedValue> {
  const unresolved = candidateCount > 1
    ? conflict(`${candidateCount} candidate branches ditemukan; governing equivalent harus dipilih/diisi eksplisit.`)
    : missing("Adjacent line/equivalent belum tersedia pada frozen topology.");
  const source = line
    ? { kind: "frozen-baseline" as const, refId: line.id, locator: `lineRelations.${line.id}`, label: "Frozen adjacent topology" }
    : undefined;
  return {
    [`${prefix}_length_km`]: line ? value(line.physicalLengthKm ?? null, source) : unresolved,
    [`${prefix}_r1_ohm`]: line ? value(line.r1Ohm ?? null, source) : unresolved,
    [`${prefix}_x1_ohm`]: line ? value(line.x1Ohm ?? line.lineXOhm ?? null, source) : unresolved,
  };
}

function resolveRelayInputs(
  local: RelayIED | undefined,
  remote: RelayIED | undefined,
  proposed: Map<string, number | string>,
  baselineSource: (locator: string) => P545CaseInputSource,
  proposalSource: (locator: string) => P545CaseInputSource
): Record<string, ResolvedValue> {
  return {
    ct_primary_a: proposedOrBaseline(proposed, "ct.primary_a", local?.ct?.primaryA, baselineSource, proposalSource, `relayIeds.${local?.id ?? "?"}.ct.primaryA`),
    ct_secondary_a: proposedOrBaseline(proposed, "ct.secondary_a", local?.ct?.secondaryA, baselineSource, proposalSource, `relayIeds.${local?.id ?? "?"}.ct.secondaryA`),
    vt_primary_kv: proposedOrBaseline(proposed, "vt.primary_kv", local?.vt?.primaryKv, baselineSource, proposalSource, `relayIeds.${local?.id ?? "?"}.vt.primaryKv`),
    vt_secondary_v: proposedOrBaseline(proposed, "vt.secondary_v", local?.vt?.secondaryV, baselineSource, proposalSource, `relayIeds.${local?.id ?? "?"}.vt.secondaryV`),
    remote_ct_primary_a: value(remote?.ct?.primaryA ?? null, remote ? baselineSource(`relayIeds.${remote.id}.ct.primaryA`) : undefined),
    remote_ct_secondary_a: value(remote?.ct?.secondaryA ?? null, remote ? baselineSource(`relayIeds.${remote.id}.ct.secondaryA`) : undefined),
  };
}

function resolveTransformerInput(
  transformers: readonly { id: string; substationId: string; xOhm?: number }[],
  remoteSubstationId: string | undefined,
  voltageKv: number | undefined,
  baselineSource: (locator: string) => P545CaseInputSource
): Record<string, ResolvedValue> {
  const candidates = transformers.filter((item) => item.substationId === remoteSubstationId && item.xOhm !== undefined);
  if (candidates.length !== 1 || !voltageKv) {
    const issue = candidates.length > 1
      ? conflict("Lebih dari satu transformer candidate; governing transformer harus dipilih.")
      : missing("Remote transformer MVA dan reactance percent belum tersedia di frozen baseline.");
    return { transformer_mva: issue, transformer_reactance_pct: issue };
  }
  const transformer = candidates[0];
  const syntheticMva = 100;
  const reactancePct = ((transformer.xOhm ?? 0) * syntheticMva * 100) / voltageKv ** 2;
  const source = baselineSource(`transformers.${transformer.id}.xOhm`);
  return {
    transformer_mva: value(syntheticMva, source),
    transformer_reactance_pct: value(reactancePct, source),
  };
}

function resolveScenarioFault(
  settingCase: SettingCase,
  localSubstationId: string | undefined
): Record<string, ResolvedValue> {
  const packageBinding = last(settingCase.studyPackageBindings);
  const maximum = packageBinding?.scenarioBindings.find(
    (item) => item.status === "compatible" && item.scenario.condition === "maximum"
  );
  const result = maximum?.faultSnapshot && localSubstationId
    ? (maximum.faultSnapshot as typeof maximum.faultSnapshot & {
        faultLevelResults?: Array<{ substationId: string; fault3PhaseKa?: number }>;
      }).faultLevelResults?.find((item) => item.substationId === localSubstationId)
    : undefined;
  return {
    fault_3ph_ka: result?.fault3PhaseKa !== undefined
      ? value(result.fault3PhaseKa, {
          kind: "study-scenario",
          refId: maximum?.id ?? "scenario",
          locator: `faultLevelResults.${localSubstationId}.fault3PhaseKa`,
          label: maximum?.scenario.name ?? "Maximum Study Scenario",
        })
      : missing("Compatible maximum scenario belum membawa numeric fault result untuk local bus."),
  };
}

function buildDistanceInput(values: Record<string, number>, settingCase: SettingCase): P545DistanceCoreInput {
  void settingCase;
  return {
    ...P545_CILEDUG_ALAM_SUTERA_BENCHMARK_INPUT,
    protectedLine: section("L1", "Protected line", values.line_r1_ohm, values.line_x1_ohm, values.line_length_km),
    forwardAdjacentLine: section("L2", "Forward adjacent", values.forward_r1_ohm, values.forward_x1_ohm, values.forward_length_km),
    reverseAdjacentLine: section("L3", "Reverse adjacent", values.reverse_r1_ohm, values.reverse_x1_ohm, values.reverse_length_km),
    secondForwardAdjacentLine: section("L4", "Second forward adjacent", values.second_forward_r1_ohm, values.second_forward_x1_ohm, values.second_forward_length_km),
    transformer: {
      ratedMva: values.transformer_mva,
      reactancePercent: values.transformer_reactance_pct,
      systemVoltageKv: values.nominal_voltage_kv,
      sourceLocator: "case-contract.transformer",
    },
    ct: { primaryA: values.ct_primary_a, secondaryA: values.ct_secondary_a, sourceLocator: "case-contract.local-ct" },
    vt: { primaryV: values.vt_primary_kv * 1000, secondaryV: values.vt_secondary_v, sourceLocator: "case-contract.local-vt" },
  };
}

function buildAuxiliaryInput(
  values: Record<string, number>,
  executedBlocks: LineProtectionBlockId[]
): P545AuxiliaryInput {
  const benchmark = P545_CILEDUG_ALAM_SUTERA_AUXILIARY_INPUT;
  const needsResidual = executedBlocks.includes("residual-compensation");
  const needsResistive = executedBlocks.includes("resistive-reach");
  const needsLoad = executedBlocks.includes("load-blinder-psb");
  const needsLcd = executedBlocks.includes("line-differential");
  const needsInstrumentTransformers = needsResistive || needsLoad || needsLcd;
  const length = values.line_length_km;
  const r1PerKm = needsResidual
    ? values.line_r1_ohm / length
    : benchmark.protectedLine.r1OhmPerKm;
  const x1PerKm = needsResidual
    ? values.line_x1_ohm / length
    : benchmark.protectedLine.x1OhmPerKm;
  return {
    ...benchmark,
    protectedLine: {
      r1OhmPerKm: r1PerKm,
      x1OhmPerKm: x1PerKm,
      lengthKm: length,
      r0AdditionalOhmPerKm: needsResidual
        ? values.line_r0_ohm / length - r1PerKm
        : benchmark.protectedLine.r0AdditionalOhmPerKm,
      x0ToX1Multiplier: needsResidual
        ? values.line_x0_ohm / values.line_x1_ohm
        : benchmark.protectedLine.x0ToX1Multiplier,
    },
    instrumentTransformers: {
      ctPrimaryA: needsInstrumentTransformers
        ? values.ct_primary_a
        : benchmark.instrumentTransformers.ctPrimaryA,
      ctSecondaryA: needsInstrumentTransformers
        ? values.ct_secondary_a
        : benchmark.instrumentTransformers.ctSecondaryA,
      vtPrimaryV: needsInstrumentTransformers
        ? values.vt_primary_kv * 1000
        : benchmark.instrumentTransformers.vtPrimaryV,
      vtSecondaryV: needsInstrumentTransformers
        ? values.vt_secondary_v
        : benchmark.instrumentTransformers.vtSecondaryV,
    },
    loadAndFault: {
      continuousCurrentPrimaryA:
        needsResistive || needsLoad
          ? values.continuous_current_a
          : benchmark.loadAndFault.continuousCurrentPrimaryA,
      relayNominalCurrentA: needsInstrumentTransformers
        ? values.ct_secondary_a
        : benchmark.loadAndFault.relayNominalCurrentA,
      systemVoltageV: needsInstrumentTransformers
        ? values.nominal_voltage_kv * 1000
        : benchmark.loadAndFault.systemVoltageV,
      fault3PhasePrimaryA: needsResistive
        ? values.fault_3ph_ka * 1000
        : benchmark.loadAndFault.fault3PhasePrimaryA,
      arcConductorSpacing: needsResistive
        ? values.arc_spacing
        : benchmark.loadAndFault.arcConductorSpacing,
    },
    lineDifferential: {
      ...benchmark.lineDifferential,
      normalDifferentialPrimaryA: needsLcd
        ? values.normal_diff_current_a
        : benchmark.lineDifferential.normalDifferentialPrimaryA,
      lineSusceptanceMicroSiemensPerKm:
        needsLcd
          ? 2 * Math.PI * values.frequency_hz * values.line_c1_nf_per_km * 0.001
          : benchmark.lineDifferential.lineSusceptanceMicroSiemensPerKm,
      ctAPrimaryA: needsLcd
        ? values.ct_primary_a
        : benchmark.lineDifferential.ctAPrimaryA,
      ctASecondaryA: needsLcd
        ? values.ct_secondary_a
        : benchmark.lineDifferential.ctASecondaryA,
      ctBPrimaryA: needsLcd
        ? values.remote_ct_primary_a
        : benchmark.lineDifferential.ctBPrimaryA,
      ctBSecondaryA: needsLcd
        ? values.remote_ct_secondary_a
        : benchmark.lineDifferential.ctBSecondaryA,
    },
  };
}

function appendAuxiliaryOutputs(
  target: TargetedCalculationOutput[],
  outputs: ReturnType<typeof calculateP545AuxiliaryBlocks>["outputs"],
  blocks: LineProtectionBlockId[]
) {
  if (blocks.includes("residual-compensation")) {
    target.push(
      output("distance.kz0_magnitude", "residual-compensation", "kZ0 magnitude", outputs.residualCompensation.magnitude, "ratio"),
      output("distance.kz0_angle", "residual-compensation", "kZ0 angle", outputs.residualCompensation.angleDeg, "degree")
    );
  }
  if (blocks.includes("resistive-reach")) {
    for (const zone of ["z1", "z2", "z3"] as const) {
      target.push(
        output(`distance.phase_reach_${zone}`, "resistive-reach", `Phase resistive reach ${zone.toUpperCase()}`, outputs.resistiveReach.phaseReachByZone[zone], "ohm-secondary"),
        output(`distance.ground_reach_${zone}`, "resistive-reach", `Ground resistive reach ${zone.toUpperCase()}`, outputs.resistiveReach.groundReachByZone[zone], "ohm-secondary")
      );
    }
  }
  if (blocks.includes("load-blinder-psb")) {
    target.push(
      output("distance.load_blinder", "load-blinder-psb", "Load blinder", outputs.loadBlinderAndPowerSwing.blinderSecondaryOhm, "ohm-secondary"),
      output("distance.psb_delta_r", "load-blinder-psb", "Power swing delta R", outputs.loadBlinderAndPowerSwing.deltaRSecondaryOhm, "ohm-secondary")
    );
  }
  if (blocks.includes("line-differential")) {
    target.push(
      output("lcd.is1", "line-differential", "LCD Is1", outputs.lineDifferential.selectedIs1SecondaryA, "A-secondary"),
      output("lcd.is2", "line-differential", "LCD Is2", outputs.lineDifferential.is2SecondaryA, "A-secondary"),
      output("lcd.k1", "line-differential", "LCD slope k1", outputs.lineDifferential.slopeK1, "ratio"),
      output("lcd.k2", "line-differential", "LCD slope k2", outputs.lineDifferential.slopeK2, "ratio"),
      output("lcd.ct_correction_local", "line-differential", "LCD CT correction local", outputs.lineDifferential.ctCorrectionA, "ratio"),
      output("lcd.ct_correction_remote", "line-differential", "LCD CT correction remote", outputs.lineDifferential.ctCorrectionB, "ratio")
    );
  }
}

function buildComparisons(outputs: TargetedCalculationOutput[], baseline: RelaySetting | undefined): TargetedCalculationComparison[] {
  const timerMap = new Map([
    ["distance.t1", baseline?.zones.find((item) => item.id === "Z1")?.timeDelayPpS],
    ["distance.t2", baseline?.zones.find((item) => item.id === "Z2")?.timeDelayPpS],
    ["distance.t3", baseline?.zones.find((item) => item.id === "Z3")?.timeDelayPpS],
  ]);
  return outputs.map((item) => {
    const before = timerMap.get(item.key);
    if (before !== undefined && typeof item.value === "number") {
      const delta = item.value - before;
      return { ...item, before, proposed: item.value, delta, status: Math.abs(delta) <= 1e-12 ? "unchanged" : "changed" };
    }
    if (item.key.startsWith("distance.z") && baseline) {
      return {
        ...item,
        before: null,
        proposed: item.value,
        delta: null,
        status: "basis-unresolved",
        note: "Issued reach exists, but its primary/secondary basis is not encoded in RelaySetting.",
      };
    }
    return { ...item, before: null, proposed: item.value, delta: null, status: "new-value" };
  });
}

function finishContract(input: {
  settingCase: SettingCase;
  plan: TargetedRecalculationPlan;
  inputs: P545CaseInput[];
  blockers: string[];
  warnings: string[];
  latestProposal?: ProposedDataRevision;
  latestPackage?: SettingCase["studyPackageBindings"][number];
  subjectLine?: LineRelation;
  localRelay?: RelayIED;
  remoteRelay?: RelayIED;
}): P545CaseExecutionContract {
  const blockers = unique(input.blockers);
  const requiredBlockIds = new Set(input.plan.blocks.filter((item) => item.action === "recalculate").map((item) => item.id));
  return {
    schema: "plms.p545-case-execution-contract.v1",
    id: `p545-contract-${input.settingCase.id}`,
    adapterVersion: P545_CASE_ADAPTER_VERSION,
    caseId: input.settingCase.id,
    baselineId: input.settingCase.baseline?.id,
    proposedRevisionId: input.latestProposal?.id,
    studyPackageBindingId: input.latestPackage?.id,
    subjectLineId: input.subjectLine?.id,
    localRelayId: input.localRelay?.id,
    remoteRelayId: input.remoteRelay?.id,
    plan: input.plan,
    status: blockers.length === 0 ? "ready" : "blocked",
    inputs: input.inputs,
    blockers,
    warnings: unique(input.warnings),
    summary: {
      resolved: input.inputs.filter((item) => item.status === "resolved").length,
      overridden: input.inputs.filter((item) => item.status === "overridden").length,
      missing: input.inputs.filter((item) => item.status === "missing").length,
      conflicts: input.inputs.filter((item) => item.status === "conflict").length,
      required: input.inputs.filter((item) => item.requiredBy.some((block) => requiredBlockIds.has(block))).length,
    },
  };
}

function resolveLocalSide(settingCase: SettingCase, line: LineRelation | undefined) {
  if (!line) return undefined;
  const bayId = settingCase.protectedScope.subjectBayId;
  if (bayId === line.fromBayId) {
    return { localBayId: line.fromBayId, remoteBayId: line.toBayId, localSubstationId: line.fromSubstationId, remoteSubstationId: line.toSubstationId };
  }
  if (bayId === line.toBayId) {
    return { localBayId: line.toBayId, remoteBayId: line.fromBayId, localSubstationId: line.toSubstationId, remoteSubstationId: line.fromSubstationId };
  }
  return undefined;
}

function findRelayAtBay(relays: readonly RelayIED[], bayId: string | undefined) {
  return relays.find((item) => item.bayId === bayId && /DIST|LCD/i.test(item.functionGroup)) ?? relays.find((item) => item.bayId === bayId);
}

function fieldMap(revision: ProposedDataRevision | undefined) {
  return new Map(revision?.fieldChanges.map((item) => [item.fieldKey, item.proposedValue]) ?? []);
}

function proposedOrBaseline(
  proposed: Map<string, number | string>,
  key: string,
  baselineValue: number | string | undefined,
  baselineSource: (locator: string) => P545CaseInputSource,
  proposalSource: (locator: string) => P545CaseInputSource,
  baselineLocator: string
): ResolvedValue {
  if (proposed.has(key)) return value(proposed.get(key) ?? null, proposalSource(key));
  return value(baselineValue ?? null, baselineValue === undefined ? undefined : baselineSource(baselineLocator));
}

function def(key: string, label: string, unit: string, valueType: "number" | "string", requiredBy: LineProtectionBlockId[]) {
  return { key, label, unit, valueType, requiredBy };
}

function value(raw: number | string | null, source?: P545CaseInputSource): ResolvedValue {
  return raw === null || raw === undefined
    ? missing("Value belum tersedia pada bound case data.")
    : { value: raw, status: "resolved", source };
}

function missing(issue: string): ResolvedValue {
  return { value: null, status: "missing", issue };
}

function conflict(issue: string): ResolvedValue {
  return { value: null, status: "conflict", issue };
}

function validateOverride(override: P545CaseInputOverride, valueType: "number" | "string") {
  if (override.reason.trim().length < 8) return "Override reason minimal 8 karakter.";
  if (!override.evidenceRef.trim()) return "Override wajib memiliki evidence reference.";
  if (valueType === "number" && (typeof override.value !== "number" || !Number.isFinite(override.value) || override.value <= 0)) {
    return "Override angka harus finite dan lebih besar dari nol.";
  }
  if (valueType === "string" && (typeof override.value !== "string" || !override.value.trim())) {
    return "Override teks tidak boleh kosong.";
  }
  return undefined;
}

function numericValues(inputs: P545CaseInput[]) {
  const result: Record<string, number> = {};
  for (const item of inputs) {
    if (typeof item.value === "number") result[item.key] = item.value;
  }
  return result;
}

function section(id: "L1" | "L2" | "L3" | "L4", label: string, rTotal: number, xTotal: number, length: number) {
  return { id, label, r1OhmPerKm: rTotal / length, x1OhmPerKm: xTotal / length, lengthKm: length, sourceLocator: `case-contract.${id}` };
}

function output(key: string, block: LineProtectionBlockId, label: string, value: number | string, unit: string): TargetedCalculationOutput {
  return { key, block, label, value, unit };
}

function touches(line: LineRelation, substationId: string) {
  return line.fromSubstationId === substationId || line.toSubstationId === substationId;
}

function otherEnd(line: LineRelation, substationId: string) {
  return line.fromSubstationId === substationId ? line.toSubstationId : line.fromSubstationId;
}

function last<T>(items: readonly T[]): T | undefined {
  return items[items.length - 1];
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
