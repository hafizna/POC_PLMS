import type { CaseImpactAssessment } from "./case-impact-readiness";
import type { ProposedDataRevision } from "./case-proposed-revision";
import type { SettingCase } from "./setting-case";
import type { SourceSnapshot, StudyScenario } from "./engineering-data";

export type StudyBindingIssue = {
  readonly code:
    | "impact-not-ready"
    | "study-not-required"
    | "scenario-not-found"
    | "scenario-not-approved"
    | "condition-unknown"
    | "calculated-at-missing"
    | "source-evidence-missing"
    | "source-evidence-incomplete"
    | "network-snapshot-not-found"
    | "fault-snapshot-not-found"
    | "wrong-snapshot-kind"
    | "snapshot-checksum-missing"
    | "snapshot-state-ineligible"
    | "scenario-snapshot-revision-mismatch"
    | "expected-revision-missing"
    | "expected-revision-mismatch"
    | "new-study-reuses-baseline";
  readonly severity: "blocker" | "warning";
  readonly message: string;
};

/**
 * Append-only proof that one approved Study Scenario is compatible with the
 * exact case baseline/proposal and impact decision. Copies are embedded so a
 * later registry edit cannot silently change prior evidence.
 */
export type CaseStudyBinding = {
  readonly id: string;
  readonly settingCaseId: string;
  readonly baselineId: string;
  readonly impactAssessmentId: string;
  readonly proposedRevisionId?: string;
  readonly version: number;
  readonly boundAt: string;
  readonly boundBy: string;
  readonly expectedNetworkRevisionId?: string;
  readonly scenario: Readonly<StudyScenario>;
  readonly networkSnapshot?: Readonly<SourceSnapshot>;
  readonly faultSnapshot?: Readonly<SourceSnapshot>;
  readonly issues: readonly StudyBindingIssue[];
  readonly status: "blocked" | "compatible";
  readonly fingerprint: {
    readonly algorithm: "fnv1a32";
    readonly value: string;
  };
};

export function proposedNetworkRevisionId(
  revision: ProposedDataRevision | undefined
): string | undefined {
  for (const key of [
    "topology.proposed_revision_ref",
    "line.proposed_network_revision_ref",
  ]) {
    const value = revision?.fieldChanges.find((item) => item.fieldKey === key)
      ?.proposedValue;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function buildCaseStudyBinding(input: {
  settingCase: SettingCase;
  impactAssessment: CaseImpactAssessment;
  proposedRevision?: ProposedDataRevision;
  scenarioId: string;
  scenarios: readonly StudyScenario[];
  snapshots: readonly SourceSnapshot[];
  version: number;
  id: string;
  boundAt: string;
  boundBy: string;
}): CaseStudyBinding {
  const issues: StudyBindingIssue[] = [];
  const scenario = input.scenarios.find((item) => item.id === input.scenarioId);
  const disposition = input.impactAssessment.study.selectedDisposition;

  if (input.impactAssessment.status !== "ready_for_study") {
    issues.push(
      blocker(
        "impact-not-ready",
        "Impact Assessment yang dipilih belum berstatus ready for study."
      )
    );
  }
  if (disposition === "not_required") {
    issues.push(
      blocker(
        "study-not-required",
        "Impact Assessment menyatakan study tidak diperlukan; case tidak boleh membuat binding semu."
      )
    );
  }

  if (!scenario) {
    const missingScenario: StudyScenario = {
      id: input.scenarioId,
      name: `Missing scenario: ${input.scenarioId}`,
      description: "",
      networkSnapshotId: "",
      networkRevisionId: "",
      studyMethod: "unknown",
      condition: "unknown",
      generationState: "",
      sourceState: "",
      createdAt: input.boundAt,
      status: "draft",
      sourceEvidenceIds: [],
    };
    issues.push(
      blocker("scenario-not-found", `Study Scenario ${input.scenarioId} tidak ditemukan.`)
    );
    return finalize(input, missingScenario, undefined, undefined, undefined, issues);
  }

  const networkSnapshot = input.snapshots.find(
    (item) => item.id === scenario.networkSnapshotId
  );
  const faultSnapshot = scenario.faultSnapshotId
    ? input.snapshots.find((item) => item.id === scenario.faultSnapshotId)
    : undefined;

  if (scenario.status !== "approved") {
    issues.push(
      blocker(
        "scenario-not-approved",
        `Scenario berstatus ${scenario.status}; hanya scenario approved yang dapat diikat.`
      )
    );
  }
  if (scenario.condition === "unknown") {
    issues.push(
      blocker(
        "condition-unknown",
        "Kondisi operasi scenario belum dinyatakan (maximum/minimum/normal)."
      )
    );
  }
  if (!scenario.calculatedAt) {
    issues.push(
      blocker("calculated-at-missing", "Waktu perhitungan fault study belum tercatat.")
    );
  }
  if (scenario.sourceEvidenceIds.length === 0) {
    issues.push(
      blocker(
        "source-evidence-missing",
        "Scenario belum memiliki referensi evidence sumber."
      )
    );
  } else {
    const requiredEvidenceIds = [
      scenario.networkSnapshotId,
      scenario.faultSnapshotId,
    ].filter((item): item is string => Boolean(item));
    const missingEvidenceIds = requiredEvidenceIds.filter(
      (id) => !scenario.sourceEvidenceIds.includes(id)
    );
    if (missingEvidenceIds.length > 0) {
      issues.push(
        blocker(
          "source-evidence-incomplete",
          `Evidence scenario belum mencakup snapshot: ${missingEvidenceIds.join(", ")}.`
        )
      );
    }
  }

  validateSnapshot(
    networkSnapshot,
    "network-model",
    scenario.networkSnapshotId,
    "network",
    issues
  );
  validateSnapshot(
    faultSnapshot,
    "fault-study",
    scenario.faultSnapshotId,
    "fault",
    issues
  );

  for (const snapshot of [networkSnapshot, faultSnapshot]) {
    if (
      snapshot?.networkRevisionId &&
      snapshot.networkRevisionId !== scenario.networkRevisionId
    ) {
      issues.push(
        blocker(
          "scenario-snapshot-revision-mismatch",
          `${snapshot.label} memakai revision ${snapshot.networkRevisionId}, bukan ${scenario.networkRevisionId}.`
        )
      );
    }
  }

  const baselineRevisionId =
    input.settingCase.baseline?.revisionBindings.networkRevisionId;
  const expectedNetworkRevisionId =
    disposition === "new_study_required"
      ? proposedNetworkRevisionId(input.proposedRevision)
      : baselineRevisionId;

  if (!expectedNetworkRevisionId) {
    issues.push(
      blocker(
        "expected-revision-missing",
        disposition === "new_study_required"
          ? "Proposed network revision belum dinyatakan pada Proposed Data Revision."
          : "Network revision baseline belum tersedia untuk menguji reuse scenario."
      )
    );
  } else if (scenario.networkRevisionId !== expectedNetworkRevisionId) {
    issues.push(
      blocker(
        "expected-revision-mismatch",
        `Scenario memakai ${scenario.networkRevisionId}; case membutuhkan ${expectedNetworkRevisionId}.`
      )
    );
  }

  if (
    disposition === "new_study_required" &&
    baselineRevisionId &&
    scenario.networkRevisionId === baselineRevisionId
  ) {
    issues.push(
      blocker(
        "new-study-reuses-baseline",
        "Perubahan ini mewajibkan study baru, tetapi scenario masih memakai network revision baseline."
      )
    );
  }

  return finalize(
    input,
    scenario,
    networkSnapshot,
    faultSnapshot,
    expectedNetworkRevisionId,
    issues
  );
}

function validateSnapshot(
  snapshot: SourceSnapshot | undefined,
  expectedKind: "network-model" | "fault-study",
  expectedId: string | undefined,
  label: "network" | "fault",
  issues: StudyBindingIssue[]
) {
  if (!snapshot) {
    issues.push(
      blocker(
        label === "network"
          ? "network-snapshot-not-found"
          : "fault-snapshot-not-found",
        expectedId
          ? `Snapshot ${label} ${expectedId} tidak ditemukan.`
          : `Scenario belum menunjuk snapshot ${label}.`
      )
    );
    return;
  }
  if (snapshot.kind !== expectedKind) {
    issues.push(
      blocker(
        "wrong-snapshot-kind",
        `${snapshot.label} bertipe ${snapshot.kind}, bukan ${expectedKind}.`
      )
    );
  }
  if (!snapshot.checksum?.value.trim()) {
    issues.push(
      blocker(
        "snapshot-checksum-missing",
        `${snapshot.label} belum memiliki checksum provenance.`
      )
    );
  }
  if (snapshot.state === "historical" || snapshot.state === "draft") {
    issues.push(
      blocker(
        "snapshot-state-ineligible",
        `${snapshot.label} berstatus ${snapshot.state}; gunakan current/current-candidate yang disetujui.`
      )
    );
  }
}

function finalize(
  input: Parameters<typeof buildCaseStudyBinding>[0],
  scenario: StudyScenario,
  networkSnapshot: SourceSnapshot | undefined,
  faultSnapshot: SourceSnapshot | undefined,
  expectedNetworkRevisionId: string | undefined,
  issues: StudyBindingIssue[]
): CaseStudyBinding {
  const scenarioCopy = cloneScenario(scenario);
  const networkCopy = networkSnapshot ? cloneSnapshot(networkSnapshot) : undefined;
  const faultCopy = faultSnapshot ? cloneSnapshot(faultSnapshot) : undefined;
  const payload = {
    settingCaseId: input.settingCase.id,
    baselineId: input.settingCase.baseline?.id ?? "",
    impactAssessmentId: input.impactAssessment.id,
    proposedRevisionId: input.proposedRevision?.id,
    version: input.version,
    expectedNetworkRevisionId,
    scenario: scenarioCopy,
    networkSnapshot: networkCopy,
    faultSnapshot: faultCopy,
    issues,
    status: issues.some((item) => item.severity === "blocker")
      ? ("blocked" as const)
      : ("compatible" as const),
  };
  return {
    id: input.id,
    ...payload,
    boundAt: input.boundAt,
    boundBy: input.boundBy,
    fingerprint: {
      algorithm: "fnv1a32",
      value: fnv1a32(stableStringify(payload)),
    },
  };
}

function cloneScenario(scenario: StudyScenario): StudyScenario {
  return {
    ...scenario,
    sourceEvidenceIds: [...scenario.sourceEvidenceIds],
  };
}

function cloneSnapshot(snapshot: SourceSnapshot): SourceSnapshot {
  return {
    ...snapshot,
    checksum: { ...snapshot.checksum },
    notes: [...snapshot.notes],
  };
}

function blocker(
  code: StudyBindingIssue["code"],
  message: string
): StudyBindingIssue {
  return { code, severity: "blocker", message };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
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
