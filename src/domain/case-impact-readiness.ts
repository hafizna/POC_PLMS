import type { SettingCaseBaseline } from "./case-baseline";
import type { ProposedDataRevision } from "./case-proposed-revision";
import type { ChangeItemKind, SettingCase } from "./setting-case";
import type { ProtectionFunctionId } from "./unified";
import { parseCtRatio, parseVtRatio } from "./instrument-transformers";

export type ImpactEndpointRole = "local" | "remote" | "neighbor";

export type ImpactEndpoint = {
  readonly substationId: string;
  readonly substationLabel: string;
  readonly bayId: string;
  readonly bayLabel: string;
  readonly relayIedId?: string;
  readonly relayLabel?: string;
  readonly role: ImpactEndpointRole;
  readonly ownerUnit?: string;
  readonly requiredAction: "recalculate_or_review" | "coordination_review";
};

export type ImpactedProtectionFunction = {
  readonly function: ProtectionFunctionId;
  readonly source: "installed" | "rule_inferred";
  readonly reasons: readonly ChangeItemKind[];
};

export type StudyDisposition =
  | "new_study_required"
  | "approved_scenario_reuse_candidate"
  | "not_required"
  | "engineering_decision_required";

export type ImpactReadinessIssue = {
  readonly id: string;
  readonly severity: "blocker" | "warning" | "info";
  readonly category:
    | "baseline"
    | "scope"
    | "ownership"
    | "relay"
    | "instrument"
    | "electrical"
    | "proposal"
    | "study";
  readonly entityId?: string;
  readonly message: string;
  readonly resolutionHint?: string;
};

export type CaseImpactAssessment = {
  readonly id: string;
  readonly settingCaseId: string;
  readonly baselineId: string;
  readonly proposedRevisionId?: string;
  readonly version: number;
  readonly evaluatedAt: string;
  readonly evaluatedBy: string;
  readonly matrixVersion: "case-impact-v1";
  readonly endpoints: readonly ImpactEndpoint[];
  readonly protectionFunctions: readonly ImpactedProtectionFunction[];
  readonly study: {
    readonly suggestedDisposition: StudyDisposition;
    readonly selectedDisposition: StudyDisposition;
    readonly rationale: readonly string[];
  };
  readonly issues: readonly ImpactReadinessIssue[];
  readonly confirmation: {
    readonly confirmed: boolean;
    readonly note?: string;
  };
  readonly status:
    | "draft_confirmation"
    | "blocked"
    | "ready_for_study"
    | "ready_without_study";
  readonly fingerprint: {
    readonly algorithm: "fnv1a32";
    readonly value: string;
  };
};

export type CaseImpactAssessmentInput = {
  confirmed: boolean;
  confirmationNote?: string;
  selectedStudyDisposition?: StudyDisposition;
};

const EXPANDED_SCOPE_REASONS = new Set<ChangeItemKind>([
  "reconductoring",
  "new_gi_insertion",
  "topology_change",
  "remote_side_work",
  "policy_revision",
]);

const INFERRED_FUNCTIONS: Partial<
  Record<ChangeItemKind, readonly ProtectionFunctionId[]>
> = {
  reconductoring: ["OCR", "GFR", "DIST", "LCD"],
  ct_replacement: ["OCR", "GFR", "LCD", "DIST", "CBF"],
  vt_replacement: ["DIST", "SYNC", "AR", "PSB"],
  relay_replacement: ["DIST", "LCD", "OCR", "GFR", "AR", "SYNC", "CBF", "TELE"],
  new_gi_insertion: ["DIST", "LCD", "OCR", "GFR", "AR", "SYNC", "TELE"],
  topology_change: ["DIST", "LCD", "OCR", "GFR", "AR", "SYNC", "TELE"],
  remote_side_work: ["DIST", "LCD", "OCR", "GFR", "AR", "SYNC", "TELE"],
};

export function buildCaseImpactAssessment(input: {
  settingCase: SettingCase;
  baseline: SettingCaseBaseline;
  proposedRevision?: ProposedDataRevision;
  assessmentInput: CaseImpactAssessmentInput;
  version: number;
  id: string;
  evaluatedAt: string;
  evaluatedBy: string;
}): CaseImpactAssessment {
  const reasons = input.settingCase.changeItems.map((item) => item.kind);
  const subjectRelation =
    input.baseline.network.lineRelations.find(
      (item) => item.id === input.baseline.protectedScope.subjectLineId
    ) ?? input.baseline.network.lineRelations[0];
  const endpoints = deriveEndpoints(input.settingCase, input.baseline, subjectRelation?.id);
  const protectionFunctions = deriveFunctions(
    input.baseline,
    endpoints,
    reasons
  );
  const studySuggestion = suggestStudyDisposition(reasons);
  const selectedStudyDisposition =
    input.assessmentInput.selectedStudyDisposition ??
    (studySuggestion.disposition === "engineering_decision_required"
      ? "engineering_decision_required"
      : studySuggestion.disposition);
  const issues = evaluateIssues({
    settingCase: input.settingCase,
    baseline: input.baseline,
    proposedRevision: input.proposedRevision,
    endpoints,
    protectionFunctions,
    subjectRelationId: subjectRelation?.id,
    suggestedStudyDisposition: studySuggestion.disposition,
    selectedStudyDisposition,
  });

  if (
    studySuggestion.disposition === "new_study_required" &&
    selectedStudyDisposition !== "new_study_required"
  ) {
    issues.push({
      id: "study-hard-rule-conflict",
      severity: "blocker",
      category: "study",
      message:
        "Perubahan topology/reconductoring membutuhkan study baru; disposition reuse tidak dapat dipilih.",
    });
  }
  if (selectedStudyDisposition === "engineering_decision_required") {
    issues.push({
      id: "study-decision-unresolved",
      severity: "blocker",
      category: "study",
      message: "Engineer belum menetapkan apakah perlu study baru, reuse, atau tidak diperlukan.",
      resolutionHint: "Pilih disposition study dan dokumentasikan alasannya.",
    });
  }

  const confirmed = input.assessmentInput.confirmed;
  if (!confirmed) {
    issues.push({
      id: "impact-scope-unconfirmed",
      severity: "blocker",
      category: "scope",
      message: "Affected endpoint dan fungsi proteksi belum dikonfirmasi engineer.",
    });
  }
  const hasBlocker = issues.some((item) => item.severity === "blocker");
  const status: CaseImpactAssessment["status"] = !confirmed
    ? "draft_confirmation"
    : hasBlocker
      ? "blocked"
      : selectedStudyDisposition === "not_required"
        ? "ready_without_study"
        : "ready_for_study";

  const payload = {
    settingCaseId: input.settingCase.id,
    baselineId: input.baseline.id,
    proposedRevisionId: input.proposedRevision?.id,
    version: input.version,
    matrixVersion: "case-impact-v1" as const,
    endpoints,
    protectionFunctions,
    study: {
      suggestedDisposition: studySuggestion.disposition,
      selectedDisposition: selectedStudyDisposition,
      rationale: studySuggestion.rationale,
    },
    issues,
    confirmation: {
      confirmed,
      note: input.assessmentInput.confirmationNote?.trim() || undefined,
    },
    status,
  };

  return {
    id: input.id,
    ...payload,
    evaluatedAt: input.evaluatedAt,
    evaluatedBy: input.evaluatedBy,
    fingerprint: {
      algorithm: "fnv1a32",
      value: fnv1a32(stableStringify(payload)),
    },
  };
}

function deriveEndpoints(
  settingCase: SettingCase,
  baseline: SettingCaseBaseline,
  subjectRelationId?: string
): ImpactEndpoint[] {
  const network = baseline.network;
  const subjectRelation = network.lineRelations.find(
    (item) => item.id === subjectRelationId
  );
  if (!subjectRelation) return [];

  const endpointByBay = new Map<string, ImpactEndpoint>();
  const localBayId =
    baseline.protectedScope.subjectBayId === subjectRelation.toBayId
      ? subjectRelation.toBayId
      : subjectRelation.fromBayId;
  const remoteBayId =
    localBayId === subjectRelation.fromBayId
      ? subjectRelation.toBayId
      : subjectRelation.fromBayId;
  addEndpoint(endpointByBay, baseline, localBayId, "local", settingCase.owningUnit);
  addEndpoint(endpointByBay, baseline, remoteBayId, "remote", settingCase.remoteUnit);

  const expand = settingCase.changeItems.some((item) =>
    EXPANDED_SCOPE_REASONS.has(item.kind)
  );
  if (expand) {
    const subjectSubstationIds = new Set([
      subjectRelation.fromSubstationId,
      subjectRelation.toSubstationId,
    ]);
    for (const relation of network.lineRelations) {
      if (relation.id === subjectRelation.id) continue;
      if (
        !subjectSubstationIds.has(relation.fromSubstationId) &&
        !subjectSubstationIds.has(relation.toSubstationId)
      ) {
        continue;
      }
      addEndpoint(endpointByBay, baseline, relation.fromBayId, "neighbor");
      addEndpoint(endpointByBay, baseline, relation.toBayId, "neighbor");
    }
  }
  return [...endpointByBay.values()];
}

function addEndpoint(
  endpointByBay: Map<string, ImpactEndpoint>,
  baseline: SettingCaseBaseline,
  bayId: string,
  role: ImpactEndpointRole,
  ownerUnit?: string
) {
  if (endpointByBay.has(bayId)) return;
  const bay = baseline.network.bays.find((item) => item.id === bayId);
  if (!bay) return;
  const substation = baseline.network.substations.find(
    (item) => item.id === bay.substationId
  );
  const relay = baseline.network.relayIeds.find((item) => item.bayId === bayId);
  endpointByBay.set(bayId, {
    substationId: bay.substationId,
    substationLabel: substation?.shortCode ?? bay.substationId,
    bayId,
    bayLabel: bay.rawName,
    relayIedId: relay?.id,
    relayLabel: relay ? `${relay.make} ${relay.model}`.trim() : undefined,
    role,
    ownerUnit,
    requiredAction:
      role === "neighbor" ? "coordination_review" : "recalculate_or_review",
  });
}

function deriveFunctions(
  baseline: SettingCaseBaseline,
  endpoints: ImpactEndpoint[],
  reasons: ChangeItemKind[]
): ImpactedProtectionFunction[] {
  const endpointRelayIds = new Set(
    endpoints.map((item) => item.relayIedId).filter(Boolean) as string[]
  );
  const installed = new Set<ProtectionFunctionId>(
    baseline.network.protectionFunctions
      .filter((item) => endpointRelayIds.has(item.relayIedId))
      .map((item) => item.function)
  );
  for (const relation of baseline.network.lineRelations) {
    for (const functionId of relation.protectionFunctionIds) installed.add(functionId);
  }
  const inferred = new Map<ProtectionFunctionId, ChangeItemKind[]>();
  for (const reason of reasons) {
    for (const functionId of INFERRED_FUNCTIONS[reason] ?? []) {
      inferred.set(functionId, [...(inferred.get(functionId) ?? []), reason]);
    }
  }
  const all = new Set<ProtectionFunctionId>([...installed, ...inferred.keys()]);
  return [...all]
    .sort()
    .map((functionId) => ({
      function: functionId,
      source: installed.has(functionId) ? "installed" : "rule_inferred",
      reasons: inferred.get(functionId) ?? reasons,
    }));
}

function suggestStudyDisposition(reasons: ChangeItemKind[]): {
  disposition: StudyDisposition;
  rationale: string[];
} {
  if (
    reasons.some((reason) =>
      ["reconductoring", "new_gi_insertion", "topology_change"].includes(reason)
    )
  ) {
    return {
      disposition: "new_study_required",
      rationale: [
        "Topology atau parameter elektrik primer berubah.",
        "Network/fault snapshot lama tidak boleh diasumsikan tetap berlaku.",
      ],
    };
  }
  if (reasons.includes("remote_side_work") || reasons.includes("data_correction")) {
    return {
      disposition: "engineering_decision_required",
      rationale: [
        "Kebutuhan study bergantung pada field/topology remote atau data yang dikoreksi.",
      ],
    };
  }
  if (
    reasons.some((reason) =>
      ["ct_replacement", "vt_replacement", "relay_replacement", "policy_revision"].includes(
        reason
      )
    )
  ) {
    return {
      disposition: "approved_scenario_reuse_candidate",
      rationale: [
        "Primary network tidak dinyatakan berubah.",
        "Scenario hanya boleh direuse bila revision compatibility dan masa berlakunya lolos gate berikutnya.",
      ],
    };
  }
  return {
    disposition: "engineering_decision_required",
    rationale: ["Change item belum memiliki aturan study yang deterministik."],
  };
}

function evaluateIssues(input: {
  settingCase: SettingCase;
  baseline: SettingCaseBaseline;
  proposedRevision?: ProposedDataRevision;
  endpoints: ImpactEndpoint[];
  protectionFunctions: ImpactedProtectionFunction[];
  subjectRelationId?: string;
  suggestedStudyDisposition: StudyDisposition;
  selectedStudyDisposition: StudyDisposition;
}): ImpactReadinessIssue[] {
  const issues: ImpactReadinessIssue[] = input.baseline.issues.map((issue) => ({
    id: `baseline-${issue.code}`,
    severity: issue.severity === "error" ? "blocker" : "warning",
    category: "baseline",
    message: issue.message,
  }));
  if (!input.subjectRelationId) {
    issues.push({
      id: "subject-relation-missing",
      severity: "blocker",
      category: "scope",
      message: "Subject line/bay lawan tidak dapat diselesaikan dari baseline.",
    });
  }
  if (input.endpoints.length < 2) {
    issues.push({
      id: "endpoint-pair-incomplete",
      severity: "blocker",
      category: "scope",
      message: "Endpoint lokal dan remote belum terbentuk lengkap.",
    });
  }
  for (const endpoint of input.endpoints) {
    if (!endpoint.relayIedId) {
      issues.push({
        id: `relay-missing-${endpoint.bayId}`,
        severity: endpoint.role === "neighbor" ? "warning" : "blocker",
        category: "relay",
        entityId: endpoint.bayId,
        message: `Relay pada ${endpoint.substationLabel} / ${endpoint.bayLabel} belum terpetakan.`,
      });
    }
  }
  if (
    input.settingCase.changeItems.some((item) => item.kind === "remote_side_work") &&
    !input.settingCase.remoteUnit
  ) {
    issues.push({
      id: "remote-owner-missing",
      severity: "blocker",
      category: "ownership",
      message: "Remote-side work memerlukan unit pemilik endpoint remote.",
    });
  } else if (
    input.endpoints.some((item) => item.role === "remote" && !item.ownerUnit)
  ) {
    issues.push({
      id: "remote-owner-unresolved",
      severity: "warning",
      category: "ownership",
      message: "Pemilik endpoint remote belum dicatat; konfirmasi apakah masih satu UPT atau lintas UPT.",
    });
  }

  const requiresProposal = input.settingCase.changeItems.some((item) =>
    [
      "reconductoring",
      "ct_replacement",
      "vt_replacement",
      "relay_replacement",
      "new_gi_insertion",
      "topology_change",
      "remote_side_work",
      "data_correction",
    ].includes(item.kind)
  );
  if (requiresProposal && input.proposedRevision?.status !== "ready_for_impact") {
    issues.push({
      id: "proposal-not-ready",
      severity: "blocker",
      category: "proposal",
      message: "Latest Proposed Data Revision belum structurally ready.",
    });
  }

  addInstrumentIssues(input, issues);
  addElectricalIssues(input, issues);
  return uniqueIssues(issues);
}

function addInstrumentIssues(
  input: Parameters<typeof evaluateIssues>[0],
  issues: ImpactReadinessIssue[]
) {
  const proposedKeys = new Set(
    input.proposedRevision?.fieldChanges.map((item) => item.fieldKey) ?? []
  );
  const currentBased = input.protectionFunctions.some((item) =>
    ["OCR", "GFR", "LCD", "DIST", "CBF"].includes(item.function)
  );
  const voltageBased = input.protectionFunctions.some((item) =>
    ["DIST", "SYNC", "AR", "PSB"].includes(item.function)
  );
  for (const endpoint of input.endpoints.filter((item) => item.role !== "neighbor")) {
    const relay = input.baseline.network.relayIeds.find(
      (item) => item.id === endpoint.relayIedId
    );
    if (
      currentBased &&
      !relay?.ct &&
      !parseCtRatio(relay?.ctRatio) &&
      !proposedKeys.has("ct.primary_a")
    ) {
      issues.push({
        id: `ct-missing-${endpoint.bayId}`,
        severity: "blocker",
        category: "instrument",
        entityId: endpoint.bayId,
        message: `CT ratio ${endpoint.substationLabel} / ${endpoint.bayLabel} belum tersedia.`,
      });
    }
    if (
      voltageBased &&
      !relay?.vt &&
      !parseVtRatio(relay?.vtRatio) &&
      !proposedKeys.has("vt.primary_kv")
    ) {
      issues.push({
        id: `vt-missing-${endpoint.bayId}`,
        severity: "blocker",
        category: "instrument",
        entityId: endpoint.bayId,
        message: `VT ratio ${endpoint.substationLabel} / ${endpoint.bayLabel} belum tersedia.`,
      });
    }
  }
}

function addElectricalIssues(
  input: Parameters<typeof evaluateIssues>[0],
  issues: ImpactReadinessIssue[]
) {
  const relation = input.baseline.network.lineRelations.find(
    (item) => item.id === input.subjectRelationId
  );
  if (!relation) return;
  const proposedKeys = new Set(
    input.proposedRevision?.fieldChanges.map((item) => item.fieldKey) ?? []
  );
  const distanceAffected = input.protectionFunctions.some(
    (item) => item.function === "DIST" || item.function === "LCD"
  );
  const currentAffected = input.protectionFunctions.some(
    (item) => item.function === "OCR" || item.function === "GFR"
  );
  for (const [field, proposedKey] of [
    ["r1Ohm", "line.r1_ohm"],
    ["x1Ohm", "line.x1_ohm"],
    ["r0Ohm", "line.r0_ohm"],
    ["x0Ohm", "line.x0_ohm"],
  ] as const) {
    if (
      distanceAffected &&
      relation[field] === undefined &&
      !proposedKeys.has(proposedKey)
    ) {
      issues.push({
        id: `electrical-${field}`,
        severity: "blocker",
        category: "electrical",
        entityId: relation.id,
        message: `${field} subject line belum tersedia pada baseline atau proposal.`,
      });
    }
  }
  if (
    currentAffected &&
    relation.currentRatingKa === undefined &&
    !proposedKeys.has("line.current_rating_a")
  ) {
    issues.push({
      id: "electrical-current-rating",
      severity: "blocker",
      category: "electrical",
      entityId: relation.id,
      message: "CCC/current rating subject line belum tersedia pada baseline atau proposal.",
    });
  }
}

function uniqueIssues(issues: ImpactReadinessIssue[]): ImpactReadinessIssue[] {
  return [...new Map(issues.map((issue) => [issue.id, issue])).values()];
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
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
