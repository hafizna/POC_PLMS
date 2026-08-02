import type { SettingCase, SettingCaseScope } from "./setting-case";
import type {
  Bay,
  LineRelation,
  ProtectionFunction,
  RelayIED,
  RelaySetting,
  RemoteBusBranch,
  SettingRecord,
  Transformer,
  UnifiedNetwork,
  UnifiedSubstation,
} from "./unified";

export type CaseBaselineEvidence = {
  readonly sourceIntakeId: string;
  readonly fileName: string;
  readonly documentType: string;
  readonly status: string;
  readonly stagedAt: string;
  readonly extractionMethod?: string;
  readonly checksum?: {
    readonly algorithm: string;
    readonly value: string;
  };
};

export type CaseBaselineNetworkSnapshot = {
  readonly networkCaseId: string;
  readonly substations: readonly UnifiedSubstation[];
  readonly bays: readonly Bay[];
  readonly lineRelations: readonly LineRelation[];
  readonly relayIeds: readonly RelayIED[];
  readonly protectionFunctions: readonly ProtectionFunction[];
  readonly relaySettings?: readonly RelaySetting[];
  readonly settingRecords?: readonly SettingRecord[];
  readonly transformers?: readonly Transformer[];
  readonly remoteBusBranches?: readonly RemoteBusBranch[];
};

export type CaseBaselineRevisionBindings = {
  readonly networkRevisionId?: string;
  readonly technicalDataRevisionId?: string;
  readonly issuedSettingRevisionId?: string;
  readonly actualReadbackId?: string;
};

export type CaseBaselineIssue = {
  readonly severity: "error" | "warning";
  readonly code:
    | "network-revision-unresolved"
    | "technical-revision-unresolved"
    | "network-revision-case-local"
    | "technical-revision-case-local"
    | "evidence-content-unverified"
    | "issued-setting-evidence-missing"
    | "actual-readback-evidence-missing";
  readonly message: string;
};

export type SettingCaseBaseline = {
  readonly id: string;
  readonly settingCaseId: string;
  readonly frozenAt: string;
  readonly frozenBy: string;
  readonly caseType: SettingCase["caseType"];
  readonly primaryReason: SettingCase["primaryReason"];
  readonly changeItems: readonly SettingCase["changeItems"][number][];
  readonly owningUnit: string;
  readonly remoteUnit?: string;
  readonly plannedEffectiveDate?: string;
  readonly protectedScope: SettingCaseScope;
  readonly evidence: readonly CaseBaselineEvidence[];
  readonly revisionBindings: CaseBaselineRevisionBindings;
  readonly issues: readonly CaseBaselineIssue[];
  readonly network: CaseBaselineNetworkSnapshot;
  readonly fingerprint: {
    readonly algorithm: "fnv1a32";
    readonly value: string;
  };
};

export type CaseBaselineEvidenceInput = CaseBaselineEvidence;

export type BuildCaseBaselineResult =
  | { ok: true; baseline: SettingCaseBaseline; errors: [] }
  | { ok: false; errors: string[] };

const INVALID_EVIDENCE_STATES = new Set(["unsupported", "extract_failed"]);

export function buildCaseBaseline(input: {
  settingCase: SettingCase;
  network: UnifiedNetwork | undefined;
  evidence: CaseBaselineEvidenceInput[];
  revisionBindings?: CaseBaselineRevisionBindings;
  frozenAt: string;
  frozenBy: string;
  id: string;
}): BuildCaseBaselineResult {
  const errors: string[] = [];
  const { settingCase, network } = input;
  const scope = settingCase.protectedScope;

  if (settingCase.stage !== "scoping") {
    errors.push("Baseline hanya dapat dibekukan dari stage Scoping.");
  }
  if (!settingCase.owningUnit.trim()) {
    errors.push("Unit pemilik case belum diisi.");
  }
  if (!scope.subjectLineId && scope.substationIds.length === 0) {
    errors.push("Protected scope belum memiliki line atau GI.");
  }
  const invalidEvidence = input.evidence.filter((item) =>
    INVALID_EVIDENCE_STATES.has(item.status)
  );
  if (invalidEvidence.length > 0) {
    errors.push(
      `Evidence tidak valid: ${invalidEvidence.map((item) => item.fileName).join(", ")}.`
    );
  }
  if (!network) {
    errors.push(`Network ${scope.networkCaseId} tidak ditemukan.`);
  }

  const substationIds = new Set(scope.substationIds);
  const subjectRelation = scope.subjectLineId
    ? network?.lineRelations.find((item) => item.id === scope.subjectLineId)
    : undefined;
  if (scope.subjectLineId && !subjectRelation) {
    errors.push(`Subject line ${scope.subjectLineId} tidak ditemukan pada working network.`);
  }
  if (subjectRelation) {
    substationIds.add(subjectRelation.fromSubstationId);
    substationIds.add(subjectRelation.toSubstationId);
  }

  const missingSubstations = [...substationIds].filter(
    (id) => !network?.substations.some((item) => item.id === id)
  );
  if (missingSubstations.length > 0) {
    errors.push(`GI pada scope tidak ditemukan: ${missingSubstations.join(", ")}.`);
  }
  if (errors.length > 0 || !network) return { ok: false, errors };

  const firstHopRelations = network.lineRelations.filter(
    (relation) =>
      relation.id === scope.subjectLineId ||
      substationIds.has(relation.fromSubstationId) ||
      substationIds.has(relation.toSubstationId)
  );
  const firstHopSubstationIds = new Set(substationIds);
  for (const relation of firstHopRelations) {
    firstHopSubstationIds.add(relation.fromSubstationId);
    firstHopSubstationIds.add(relation.toSubstationId);
  }
  const lineRelations = network.lineRelations.filter(
    (relation) =>
      firstHopRelations.some((item) => item.id === relation.id) ||
      firstHopSubstationIds.has(relation.fromSubstationId) ||
      firstHopSubstationIds.has(relation.toSubstationId)
  );
  const snapshotSubstationIds = new Set(firstHopSubstationIds);
  for (const relation of lineRelations) {
    snapshotSubstationIds.add(relation.fromSubstationId);
    snapshotSubstationIds.add(relation.toSubstationId);
  }
  const bayIds = new Set<string>();
  if (scope.subjectBayId) bayIds.add(scope.subjectBayId);
  for (const relation of lineRelations) {
    bayIds.add(relation.fromBayId);
    bayIds.add(relation.toBayId);
  }
  const relayIeds = network.relayIeds.filter((ied) => bayIds.has(ied.bayId));
  const relayIds = new Set(relayIeds.map((ied) => ied.id));
  const revisionBindings = { ...(input.revisionBindings ?? {}) };
  const issues = baselineIssues(settingCase, input.evidence, revisionBindings);

  const fatalIssues = issues.filter((item) => item.severity === "error");
  if (fatalIssues.length > 0) {
    return { ok: false, errors: fatalIssues.map((item) => item.message) };
  }

  const payload = {
    settingCaseId: settingCase.id,
    caseType: settingCase.caseType,
    primaryReason: settingCase.primaryReason,
    changeItems: settingCase.changeItems.map((item) => ({ ...item })),
    owningUnit: settingCase.owningUnit,
    remoteUnit: settingCase.remoteUnit,
    plannedEffectiveDate: settingCase.plannedEffectiveDate,
    protectedScope: {
      ...scope,
      substationIds: [...scope.substationIds],
    },
    evidence: input.evidence.map((item) => ({ ...item })),
    revisionBindings,
    issues,
    network: {
      networkCaseId: scope.networkCaseId,
      substations: network.substations
        .filter((item) => snapshotSubstationIds.has(item.id))
        .map((item) => ({ ...item })),
      bays: network.bays.filter((item) => bayIds.has(item.id)).map((item) => ({ ...item })),
      lineRelations: lineRelations.map((item) => ({
        ...item,
        protectionFunctionIds: [...item.protectionFunctionIds],
        sourceIds: [...item.sourceIds],
      })),
      relayIeds: relayIeds.map((item) => ({
        ...item,
        ct: item.ct ? { ...item.ct } : undefined,
        vt: item.vt ? { ...item.vt } : undefined,
      })),
      protectionFunctions: network.protectionFunctions
        .filter((item) => relayIds.has(item.relayIedId))
        .map((item) => ({ ...item })),
      relaySettings: (network.relaySettings ?? [])
        .filter((item) => relayIds.has(item.relayIedId))
        .map((item) => ({
          ...item,
          zones: item.zones.map((zone) => ({ ...zone })) as RelaySetting["zones"],
          loadEncroachment: { ...item.loadEncroachment },
        })),
      settingRecords: (network.settingRecords ?? [])
        .filter((item) =>
          network.protectionFunctions.some(
            (fn) => fn.id === item.protectionFunctionId && relayIds.has(fn.relayIedId)
          )
        )
        .map((item) => ({ ...item, values: { ...item.values } })),
      transformers: (network.transformers ?? [])
        .filter((item) => snapshotSubstationIds.has(item.substationId))
        .map((item) => ({ ...item })),
      remoteBusBranches: (network.remoteBusBranches ?? [])
        .filter((item) => lineRelations.some((line) => line.id === item.lineRelationId))
        .map((item) => ({ ...item })),
    },
  };

  return {
    ok: true,
    errors: [],
    baseline: {
      id: input.id,
      frozenAt: input.frozenAt,
      frozenBy: input.frozenBy,
      ...payload,
      fingerprint: {
        algorithm: "fnv1a32",
        value: fnv1a32(stableStringify(payload)),
      },
    },
  };
}

function baselineIssues(
  settingCase: SettingCase,
  evidence: CaseBaselineEvidence[],
  bindings: CaseBaselineRevisionBindings
): CaseBaselineIssue[] {
  const issues: CaseBaselineIssue[] = [];
  if (!bindings.networkRevisionId) {
    issues.push({
      severity: "error",
      code: "network-revision-unresolved",
      message:
        "Belum ada ID network revision aktif/approved yang dapat diikat ke baseline.",
    });
  }
  if (bindings.networkRevisionId?.startsWith("case-local-network:")) {
    issues.push({
      severity: "warning",
      code: "network-revision-case-local",
      message:
        "Network revision memakai case-local frozen snapshot POC; ganti dengan enterprise/current revision saat backend tersedia.",
    });
  }
  if (!bindings.technicalDataRevisionId) {
    issues.push({
      severity: "error",
      code: "technical-revision-unresolved",
      message:
        "Belum ada ID technical-data revision aktif/approved yang dapat diikat ke baseline.",
    });
  }
  if (bindings.technicalDataRevisionId?.startsWith("case-local-technical:")) {
    issues.push({
      severity: "warning",
      code: "technical-revision-case-local",
      message:
        "Technical-data revision memakai case-local frozen snapshot POC; provenance enterprise belum tersedia.",
    });
  }
  if (evidence.some((item) => !item.checksum)) {
    issues.push({
      severity: "warning",
      code: "evidence-content-unverified",
      message:
        "Source Intake belum menyimpan checksum file; fingerprint baseline saat ini mencakup metadata evidence, bukan byte file.",
    });
  }
  if (
    settingCase.caseType !== "data_correction" &&
    settingCase.primaryReason !== "new_gi_insertion" &&
    !bindings.issuedSettingRevisionId &&
    !evidence.some((item) => item.documentType === "tap_setting")
  ) {
    issues.push({
      severity: "warning",
      code: "issued-setting-evidence-missing",
      message:
        "Issued setting revision/TAP belum tersedia. Baseline tetap membekukan network dan technical data, tetapi perbandingan expected vs actual belum boleh dinyatakan lengkap.",
    });
  }
  return issues;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
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
