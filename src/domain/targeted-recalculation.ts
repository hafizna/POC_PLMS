import {
  CHANGE_ITEM_LABEL,
  requiresProposedDataRevision,
  type ChangeItemKind,
  type SettingCase,
} from "./setting-case";

export type LineProtectionBlockId =
  | "distance-core"
  | "residual-compensation"
  | "resistive-reach"
  | "load-blinder-psb"
  | "line-differential"
  | "autoreclose-policy"
  | "remote-coordination";

export type RecalculationAction =
  | "recalculate"
  | "engineering-review"
  | "carry-forward";

export type RecalculationStepStatus =
  | "complete"
  | "current"
  | "blocked"
  | "pending"
  | "deferred";

export type RecalculationBlockPlan = {
  id: LineProtectionBlockId;
  group: "distance" | "differential" | "policy" | "coordination";
  label: string;
  description: string;
  action: RecalculationAction;
  reasons: ChangeItemKind[];
  requiredData: string[];
  implementation: "formula-ready" | "policy-only" | "review-only";
};

export type TargetedRecalculationPlan = {
  schema: "plms.targeted-recalculation-plan.v1";
  mode:
    | "benchmark-only"
    | "targeted-recalculation"
    | "full-design-deferred"
    | "ineligible-case";
  caseId?: string;
  caseTitle?: string;
  baselineLabel: string;
  changeLabel: string;
  processReadiness: "blocked" | "ready-for-rule-binding" | "deferred";
  runtimeStatus: "benchmark-only" | "live-case-adapter";
  canCreateLiveRun: boolean;
  blockers: string[];
  warnings: string[];
  steps: Array<{
    id: "baseline" | "change-scope" | "data-readiness" | "recalculation";
    label: string;
    status: RecalculationStepStatus;
    detail: string;
  }>;
  blocks: RecalculationBlockPlan[];
};

const BLOCK_DEFINITIONS: Record<
  LineProtectionBlockId,
  Omit<RecalculationBlockPlan, "action" | "reasons">
> = {
  "distance-core": {
    id: "distance-core",
    group: "distance",
    label: "Distance Z1 / Z2 / Z3",
    description: "Forward/reverse reach, CT/VT conversion, timer, and transformer cap.",
    requiredData: [
      "protected and adjacent line R1/X1",
      "topology / remote equivalent",
      "CT/VT",
      "transformer impedance",
      "infeed and scenario",
    ],
    implementation: "formula-ready",
  },
  "residual-compensation": {
    id: "residual-compensation",
    group: "distance",
    label: "Residual Compensation kZ0",
    description: "Ground-distance compensation derived from positive/zero sequence impedance.",
    requiredData: ["R1/X1", "R0/X0", "line section basis"],
    implementation: "formula-ready",
  },
  "resistive-reach": {
    id: "resistive-reach",
    group: "distance",
    label: "Resistive Reach",
    description: "Phase/ground resistive reach using load margin and fault arc criterion.",
    requiredData: ["CCC/load limit", "CT/VT", "fault scenario", "conductor spacing"],
    implementation: "formula-ready",
  },
  "load-blinder-psb": {
    id: "load-blinder-psb",
    group: "distance",
    label: "Load Blinder / Power Swing",
    description: "Load encroachment boundary and power-swing geometry.",
    requiredData: ["normal load criterion", "CT/VT", "system voltage", "policy version"],
    implementation: "formula-ready",
  },
  "line-differential": {
    id: "line-differential",
    group: "differential",
    label: "Line Differential LCD",
    description: "Charging-current compensation and Is1/Is2/k1/k2 selection.",
    requiredData: ["line length", "line susceptance/capacitance", "CT ratios both ends", "relay In"],
    implementation: "formula-ready",
  },
  "autoreclose-policy": {
    id: "autoreclose-policy",
    group: "policy",
    label: "Autoreclose Policy",
    description: "Trip mode, dead time, reclaim time, and pulse time; reviewed as policy, not Mathcad formula.",
    requiredData: ["approved AR policy", "breaker/teleprotection capability", "system condition"],
    implementation: "policy-only",
  },
  "remote-coordination": {
    id: "remote-coordination",
    group: "coordination",
    label: "Remote-end Coordination",
    description: "Review reach/selectivity at local, remote, and affected neighboring endpoints.",
    requiredData: ["affected endpoint matrix", "remote ownership", "maximum/minimum scenario package"],
    implementation: "review-only",
  },
};

const ALL_BLOCKS = Object.keys(BLOCK_DEFINITIONS) as LineProtectionBlockId[];

const REASON_ACTIONS: Record<
  ChangeItemKind,
  Partial<Record<LineProtectionBlockId, Exclude<RecalculationAction, "carry-forward">>>
> = {
  reconductoring: {
    "distance-core": "recalculate",
    "residual-compensation": "recalculate",
    "resistive-reach": "recalculate",
    "load-blinder-psb": "recalculate",
    "line-differential": "recalculate",
    "autoreclose-policy": "engineering-review",
    "remote-coordination": "engineering-review",
  },
  ct_replacement: {
    "distance-core": "recalculate",
    "resistive-reach": "recalculate",
    "load-blinder-psb": "recalculate",
    "line-differential": "recalculate",
    "remote-coordination": "engineering-review",
  },
  vt_replacement: {
    "distance-core": "recalculate",
    "resistive-reach": "recalculate",
    "load-blinder-psb": "recalculate",
    "line-differential": "engineering-review",
    "autoreclose-policy": "engineering-review",
    "remote-coordination": "engineering-review",
  },
  relay_replacement: {
    "distance-core": "recalculate",
    "residual-compensation": "recalculate",
    "resistive-reach": "recalculate",
    "load-blinder-psb": "recalculate",
    "line-differential": "recalculate",
    "autoreclose-policy": "engineering-review",
    "remote-coordination": "engineering-review",
  },
  new_gi_insertion: {
    "distance-core": "recalculate",
    "residual-compensation": "recalculate",
    "resistive-reach": "recalculate",
    "load-blinder-psb": "recalculate",
    "line-differential": "recalculate",
    "autoreclose-policy": "engineering-review",
    "remote-coordination": "engineering-review",
  },
  topology_change: {
    "distance-core": "recalculate",
    "residual-compensation": "engineering-review",
    "resistive-reach": "recalculate",
    "load-blinder-psb": "recalculate",
    "line-differential": "engineering-review",
    "autoreclose-policy": "engineering-review",
    "remote-coordination": "engineering-review",
  },
  remote_side_work: {
    "distance-core": "recalculate",
    "residual-compensation": "engineering-review",
    "resistive-reach": "recalculate",
    "load-blinder-psb": "engineering-review",
    "line-differential": "engineering-review",
    "autoreclose-policy": "engineering-review",
    "remote-coordination": "engineering-review",
  },
  policy_revision: {
    "distance-core": "engineering-review",
    "residual-compensation": "engineering-review",
    "resistive-reach": "engineering-review",
    "load-blinder-psb": "engineering-review",
    "line-differential": "engineering-review",
    "autoreclose-policy": "engineering-review",
    "remote-coordination": "engineering-review",
  },
  data_correction: {
    "distance-core": "engineering-review",
    "residual-compensation": "engineering-review",
    "resistive-reach": "engineering-review",
    "load-blinder-psb": "engineering-review",
    "line-differential": "engineering-review",
  },
  other: {
    "distance-core": "engineering-review",
    "residual-compensation": "engineering-review",
    "resistive-reach": "engineering-review",
    "load-blinder-psb": "engineering-review",
    "line-differential": "engineering-review",
    "autoreclose-policy": "engineering-review",
    "remote-coordination": "engineering-review",
  },
};

export function buildTargetedRecalculationPlan(
  settingCase: SettingCase | undefined
): TargetedRecalculationPlan {
  if (!settingCase) return noCasePlan();
  if (settingCase.caseType === "crosscheck" || settingCase.caseType === "data_correction") {
    return ineligiblePlan(settingCase);
  }

  const baseline = settingCase.baseline;
  const hasIssuedBaseline = Boolean(
    baseline?.revisionBindings.issuedSettingRevisionId ||
      baseline?.evidence.some((item) => item.documentType === "tap_setting")
  );
  const fullDesign =
    settingCase.primaryReason === "new_gi_insertion" && !hasIssuedBaseline;
  const latestProposal = settingCase.proposedDataRevisions[
    settingCase.proposedDataRevisions.length - 1
  ];
  const latestImpact = settingCase.impactAssessments[
    settingCase.impactAssessments.length - 1
  ];
  const latestStudyPackage = settingCase.studyPackageBindings[
    settingCase.studyPackageBindings.length - 1
  ];
  const latestStudyBinding = settingCase.studyBindings[
    settingCase.studyBindings.length - 1
  ];
  const physicalChange = requiresProposedDataRevision(settingCase.changeItems);
  const proposalReady =
    !physicalChange || latestProposal?.status === "ready_for_impact";
  const impactReady =
    latestImpact?.status === "ready_for_study" ||
    latestImpact?.status === "ready_without_study";
  const scenarioReady =
    latestImpact?.status === "ready_without_study" ||
    latestStudyPackage?.status === "compatible" ||
    latestStudyBinding?.status === "compatible";
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!baseline) blockers.push("Baseline aktif belum dibekukan di Setting Case.");
  if (baseline && !hasIssuedBaseline) {
    blockers.push("Issued setting revision/TAP baseline belum terikat ke case.");
  }
  if (physicalChange && !proposalReady) {
    blockers.push("Proposed technical-data revision belum ready for impact.");
  }
  if (!impactReady) {
    blockers.push("Affected endpoint/function matrix belum dikonfirmasi atau masih blocked.");
  }
  if (impactReady && !scenarioReady) {
    blockers.push("Approved maximum/minimum/normal Study Scenario Package belum compatible.");
  }
  if (settingCase.changeItems.some((item) => item.kind === "relay_replacement")) {
    warnings.push(
      "Relay replacement juga membutuhkan capability/conversion review; native vendor conversion bukan bagian fokus Distance/LCD ini."
    );
  }
  warnings.push(
    "Rule P545 memiliki parity benchmark 55/55; hasil live tetap proposed engineering output dan memerlukan review."
  );

  const blocks = buildBlocks(settingCase.changeItems.map((item) => item.kind));
  const mode = fullDesign ? "full-design-deferred" : "targeted-recalculation";
  const processReadiness = fullDesign
    ? "deferred"
    : blockers.length === 0
      ? "ready-for-rule-binding"
      : "blocked";

  return {
    schema: "plms.targeted-recalculation-plan.v1",
    mode,
    caseId: settingCase.id,
    caseTitle: settingCase.title,
    baselineLabel: baseline
      ? hasIssuedBaseline
        ? baseline.revisionBindings.issuedSettingRevisionId ??
          baseline.evidence.find((item) => item.documentType === "tap_setting")?.fileName ??
          baseline.id
        : `${baseline.id} (issued setting unresolved)`
      : "No frozen baseline",
    changeLabel: settingCase.changeItems
      .map((item) => CHANGE_ITEM_LABEL[item.kind])
      .join(" + "),
    processReadiness,
    runtimeStatus: "live-case-adapter",
    canCreateLiveRun:
      processReadiness === "ready-for-rule-binding" &&
      settingCase.stage === "calculation",
    blockers,
    warnings,
    steps: [
      step(
        "baseline",
        "Issued baseline",
        baseline && hasIssuedBaseline ? "complete" : "blocked",
        baseline && hasIssuedBaseline
          ? "Frozen network/data snapshot and issued setting evidence are bound."
          : "Freeze baseline and bind the active issued TAP/setting revision."
      ),
      step(
        "change-scope",
        "Change scope",
        fullDesign ? "deferred" : proposalReady ? "complete" : baseline ? "current" : "pending",
        fullDesign
          ? "New-bay design from zero is outside the current recalculation target."
          : proposalReady
            ? "Before/after change items are structurally ready."
            : "Complete proposed technical changes for the selected reason."
      ),
      step(
        "data-readiness",
        "Impact & scenario",
        impactReady && scenarioReady ? "complete" : proposalReady ? "current" : "pending",
        impactReady && scenarioReady
          ? "Affected endpoints/functions and required scenarios are compatible."
          : "Confirm affected endpoints and bind approved scenario conditions."
      ),
      step(
        "recalculation",
        "Proposed recalculation",
        fullDesign
          ? "deferred"
          : blockers.length === 0
            ? "current"
            : "blocked",
        blockers.length === 0
          ? settingCase.stage === "calculation"
            ? "Process inputs are ready for the live P545 case adapter."
            : "Process inputs are ready; advance the case to Calculation to create a live run."
          : "Calculation cannot start until process/data blockers are closed."
      ),
    ],
    blocks,
  };
}

function buildBlocks(reasons: ChangeItemKind[]): RecalculationBlockPlan[] {
  return ALL_BLOCKS.map((id) => {
    const affectedBy = reasons.filter((reason) => REASON_ACTIONS[reason][id]);
    const actions = affectedBy.map((reason) => REASON_ACTIONS[reason][id]);
    const action: RecalculationAction = actions.includes("recalculate")
      ? "recalculate"
      : actions.includes("engineering-review")
        ? "engineering-review"
        : "carry-forward";
    return {
      ...BLOCK_DEFINITIONS[id],
      action,
      reasons: affectedBy,
    };
  });
}

function noCasePlan(): TargetedRecalculationPlan {
  return {
    schema: "plms.targeted-recalculation-plan.v1",
    mode: "benchmark-only",
    baselineLabel: "No Setting Case context",
    changeLabel: "No declared change",
    processReadiness: "blocked",
    runtimeStatus: "benchmark-only",
    canCreateLiveRun: false,
    blockers: [
      "Targeted recalculation harus dibuka dari Setting Change Case agar baseline dan perubahan dapat ditelusuri.",
    ],
    warnings: ["Formula panels below are benchmark/reference evidence only."],
    steps: [
      step("baseline", "Issued baseline", "blocked", "Start a Setting Change Case and freeze its issued baseline."),
      step("change-scope", "Change scope", "pending", "Select reconductoring, CT/VT, relay, topology, remote work, or policy revision."),
      step("data-readiness", "Impact & scenario", "pending", "Readiness is evaluated inside the case."),
      step("recalculation", "Proposed recalculation", "blocked", "Global benchmark mode cannot create a live run."),
    ],
    blocks: buildBlocks([]),
  };
}

function ineligiblePlan(settingCase: SettingCase): TargetedRecalculationPlan {
  return {
    ...noCasePlan(),
    mode: "ineligible-case",
    caseId: settingCase.id,
    caseTitle: settingCase.title,
    baselineLabel: settingCase.baseline?.id ?? "No frozen baseline",
    changeLabel: CHANGE_ITEM_LABEL[settingCase.primaryReason],
    blockers: [
      settingCase.caseType === "crosscheck"
        ? "Crosscheck Case memverifikasi actual setting dan tidak membuat proposed recalculation."
        : "Data-correction Case tidak boleh menerbitkan setting tanpa Setting Change Case terpisah.",
    ],
  };
}

function step(
  id: TargetedRecalculationPlan["steps"][number]["id"],
  label: string,
  status: RecalculationStepStatus,
  detail: string
): TargetedRecalculationPlan["steps"][number] {
  return { id, label, status, detail };
}
