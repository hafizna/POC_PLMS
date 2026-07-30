import type { CrosscheckFaultRecord } from "./crosscheck-workbook-registry";

export type SourceSnapshotKind =
  | "network-model"
  | "fault-study"
  | "tap-setting"
  | "actual-setting"
  | "mathcad-calculation"
  | "technical-master";

export type SourceSnapshotState =
  | "historical"
  | "current-candidate"
  | "current"
  | "draft";

/**
 * Immutable identity and provenance for one logical dataset.
 *
 * One physical workbook can produce several snapshots. The legacy crosscheck
 * workbook, for example, contains a DIgSILENT line database and an IHS result.
 * They intentionally have different ids and partitions even though the file
 * checksum is the same.
 */
export type SourceSnapshot = {
  id: string;
  label: string;
  kind: SourceSnapshotKind;
  state: SourceSnapshotState;
  sourceSystem: string;
  sourceRef: string;
  sourcePartition?: string;
  effectiveAt?: string;
  effectivePeriodLabel?: string;
  capturedAt: string;
  checksum: {
    algorithm: "sha256" | "sha256-prefix";
    value: string;
    scope: "file" | "dataset";
  };
  networkRevisionId?: string;
  recordCount?: number;
  notes: string[];
};

export type StudyMethod =
  | "digsilent-short-circuit"
  | "legacy-workbook"
  | "manual"
  | "unknown";

export type StudyCondition = "maximum" | "minimum" | "normal" | "unknown";

/**
 * Context that makes an electrical-study result meaningful. Fault current is
 * never selected by station name alone: callers must resolve it through one
 * of these scenarios first.
 */
export type StudyScenario = {
  id: string;
  name: string;
  description: string;
  networkSnapshotId: string;
  faultSnapshotId?: string;
  networkRevisionId: string;
  studyMethod: StudyMethod;
  condition: StudyCondition;
  generationState: string;
  sourceState: string;
  calculatedAt?: string;
  createdAt: string;
  status: "draft" | "reviewed" | "approved" | "historical";
  sourceEvidenceIds: string[];
};

export const LEGACY_NETWORK_SNAPSHOT_ID = "snapshot_digsilent_db_2021_03_09";
export const LEGACY_FAULT_SNAPSHOT_ID = "snapshot_ihs_2021_s1";
export const LEGACY_STUDY_SCENARIO_ID = "scenario_ihs_2021_s1_unknown_condition";
export const LEGACY_NETWORK_REVISION_ID = "legacy-network-2021-03-09";
export const P545_MATHCAD_SNAPSHOT_ID =
  "snapshot_mathcad_p545_ciledug_alsut_rev1";

const LEGACY_WORKBOOK_REF =
  "Aplikasi Crosscheck Setting Relay [Digsilent_ 9 Maret 2021, IHS 1-2021].xlsx";
const LEGACY_WORKBOOK_CHECKSUM = "46061b0726c6a13c";
const LEGACY_CAPTURED_AT = "2026-05-11T05:36:43.064Z";

export const DEFAULT_SOURCE_SNAPSHOTS: SourceSnapshot[] = [
  {
    id: LEGACY_NETWORK_SNAPSHOT_ID,
    label: "DIgSILENT line database — 9 March 2021",
    kind: "network-model",
    state: "historical",
    sourceSystem: "DIgSILENT via legacy workbook",
    sourceRef: LEGACY_WORKBOOK_REF,
    sourcePartition: "DB",
    effectiveAt: "2021-03-09T00:00:00.000Z",
    capturedAt: LEGACY_CAPTURED_AT,
    checksum: {
      algorithm: "sha256-prefix",
      value: LEGACY_WORKBOOK_CHECKSUM,
      scope: "file",
    },
    networkRevisionId: LEGACY_NETWORK_REVISION_ID,
    recordCount: 1183,
    notes: [
      "Historical topology/electrical-data baseline; it is not current network truth.",
      "Projects after 9 March 2021 require an Engineering Change Set or a newer snapshot.",
    ],
  },
  {
    id: LEGACY_FAULT_SNAPSHOT_ID,
    label: "IHS short-circuit results — Semester 1 2021",
    kind: "fault-study",
    state: "historical",
    sourceSystem: "DIgSILENT/IHS via legacy workbook",
    sourceRef: LEGACY_WORKBOOK_REF,
    sourcePartition: "IHS",
    effectivePeriodLabel: "Semester 1 2021",
    capturedAt: LEGACY_CAPTURED_AT,
    checksum: {
      algorithm: "sha256-prefix",
      value: LEGACY_WORKBOOK_CHECKSUM,
      scope: "file",
    },
    networkRevisionId: LEGACY_NETWORK_REVISION_ID,
    recordCount: 1122,
    notes: [
      "Exact calculation timestamp, max/min condition, and in-service generation were not encoded in the workbook.",
      "Use only through an explicit Study Scenario and do not present it as a current fault level.",
    ],
  },
  {
    id: P545_MATHCAD_SNAPSHOT_ID,
    label: "Mathcad P545 Ciledug–Alam Sutera #1 — revision 1",
    kind: "mathcad-calculation",
    state: "historical",
    sourceSystem: "Mathcad Professional 14",
    sourceRef: "Tap Setting MiCom P545 GI Ciledug Bay Alam Sutera #1.xmcd",
    sourcePartition: "worksheet",
    effectiveAt: "2021-03-17T00:00:00.000Z",
    capturedAt: "2026-05-11T05:36:41.416Z",
    checksum: {
      algorithm: "sha256-prefix",
      value: "9d2cacf7d47079b7",
      scope: "file",
    },
    notes: [
      "Benchmark artifact for formula parity; it is not an approved current-setting source.",
      "Relay label and study inputs must be reconciled against dated asset and study evidence.",
    ],
  },
];

export const DEFAULT_STUDY_SCENARIOS: StudyScenario[] = [
  {
    id: LEGACY_STUDY_SCENARIO_ID,
    name: "Historical IHS S1 2021 — condition unverified",
    description:
      "Reference-only scenario for the IHS sheet in the legacy crosscheck workbook. Operating condition and exact calculation timestamp require source confirmation.",
    networkSnapshotId: LEGACY_NETWORK_SNAPSHOT_ID,
    faultSnapshotId: LEGACY_FAULT_SNAPSHOT_ID,
    networkRevisionId: LEGACY_NETWORK_REVISION_ID,
    studyMethod: "legacy-workbook",
    condition: "unknown",
    generationState: "unknown — legacy source",
    sourceState: "unknown — legacy source",
    createdAt: LEGACY_CAPTURED_AT,
    status: "historical",
    sourceEvidenceIds: [LEGACY_NETWORK_SNAPSHOT_ID, LEGACY_FAULT_SNAPSHOT_ID],
  },
];

export type ScenarioIssue = {
  severity: "error" | "warning";
  code:
    | "scenario-not-selected"
    | "scenario-not-found"
    | "network-snapshot-not-found"
    | "fault-snapshot-not-found"
    | "wrong-snapshot-kind"
    | "network-revision-mismatch"
    | "calculated-at-unknown"
    | "condition-unknown"
    | "historical-source";
  message: string;
};

export type ScenarioResolution =
  | {
      status: "blocked";
      scenario?: StudyScenario;
      issues: ScenarioIssue[];
    }
  | {
      status: "ready";
      scenario: StudyScenario;
      networkSnapshot: SourceSnapshot;
      faultSnapshot: SourceSnapshot;
      issues: ScenarioIssue[];
    };

export function resolveFaultScenario(
  snapshots: SourceSnapshot[],
  scenarios: StudyScenario[],
  scenarioId: string | null | undefined
): ScenarioResolution {
  if (!scenarioId) {
    return blocked("scenario-not-selected", "Select a Study Scenario before using fault-study data.");
  }

  const scenario = scenarios.find((item) => item.id === scenarioId);
  if (!scenario) {
    return blocked("scenario-not-found", `Study Scenario ${scenarioId} was not found.`);
  }

  const issues: ScenarioIssue[] = [];
  const networkSnapshot = snapshots.find((item) => item.id === scenario.networkSnapshotId);
  if (!networkSnapshot) {
    issues.push({
      severity: "error",
      code: "network-snapshot-not-found",
      message: `Network snapshot ${scenario.networkSnapshotId} was not found.`,
    });
  } else if (networkSnapshot.kind !== "network-model") {
    issues.push({
      severity: "error",
      code: "wrong-snapshot-kind",
      message: `${networkSnapshot.label} is ${networkSnapshot.kind}, not a network-model snapshot.`,
    });
  }

  const faultSnapshot = scenario.faultSnapshotId
    ? snapshots.find((item) => item.id === scenario.faultSnapshotId)
    : undefined;
  if (!faultSnapshot) {
    issues.push({
      severity: "error",
      code: "fault-snapshot-not-found",
      message: scenario.faultSnapshotId
        ? `Fault snapshot ${scenario.faultSnapshotId} was not found.`
        : "The Study Scenario does not reference a fault-study snapshot.",
    });
  } else if (faultSnapshot.kind !== "fault-study") {
    issues.push({
      severity: "error",
      code: "wrong-snapshot-kind",
      message: `${faultSnapshot.label} is ${faultSnapshot.kind}, not a fault-study snapshot.`,
    });
  }

  if (
    networkSnapshot?.networkRevisionId &&
    networkSnapshot.networkRevisionId !== scenario.networkRevisionId
  ) {
    issues.push({
      severity: "error",
      code: "network-revision-mismatch",
      message: "Scenario and network snapshot reference different network revisions.",
    });
  }
  if (
    faultSnapshot?.networkRevisionId &&
    faultSnapshot.networkRevisionId !== scenario.networkRevisionId
  ) {
    issues.push({
      severity: "error",
      code: "network-revision-mismatch",
      message: "Scenario and fault snapshot reference different network revisions.",
    });
  }

  if (!scenario.calculatedAt) {
    issues.push({
      severity: "warning",
      code: "calculated-at-unknown",
      message: "Exact fault-study calculation timestamp is unknown.",
    });
  }
  if (scenario.condition === "unknown") {
    issues.push({
      severity: "warning",
      code: "condition-unknown",
      message: "Maximum/minimum operating condition is not confirmed.",
    });
  }
  if (networkSnapshot?.state === "historical" || faultSnapshot?.state === "historical") {
    issues.push({
      severity: "warning",
      code: "historical-source",
      message: "This scenario uses historical sources and must not be presented as current truth.",
    });
  }

  if (!networkSnapshot || !faultSnapshot || issues.some((issue) => issue.severity === "error")) {
    return { status: "blocked", scenario, issues };
  }

  return {
    status: "ready",
    scenario,
    networkSnapshot,
    faultSnapshot,
    issues,
  };
}

export type ScenarioFaultSelection =
  | {
      status: "blocked";
      issues: ScenarioIssue[];
      records: [];
    }
  | {
      status: "ready";
      context: Extract<ScenarioResolution, { status: "ready" }>;
      records: CrosscheckFaultRecord[];
    };

/**
 * Scenario-gated fault lookup. Consumers must use this selector instead of
 * reading `faultLevelDb.records` by station name directly.
 */
export function selectFaultRecordsForScenario(input: {
  snapshots: SourceSnapshot[];
  scenarios: StudyScenario[];
  scenarioId: string | null | undefined;
  records: CrosscheckFaultRecord[];
  substation: string;
}): ScenarioFaultSelection {
  const context = resolveFaultScenario(input.snapshots, input.scenarios, input.scenarioId);
  if (context.status === "blocked") {
    return { status: "blocked", issues: context.issues, records: [] };
  }

  const key = normalizeLookup(input.substation);
  return {
    status: "ready",
    context,
    records: input.records.filter((record) =>
      normalizeLookup(record.substation).includes(key)
    ),
  };
}

export function cloneDefaultSourceSnapshots(): SourceSnapshot[] {
  return DEFAULT_SOURCE_SNAPSHOTS.map((snapshot) => ({
    ...snapshot,
    checksum: { ...snapshot.checksum },
    notes: [...snapshot.notes],
  }));
}

export function cloneDefaultStudyScenarios(): StudyScenario[] {
  return DEFAULT_STUDY_SCENARIOS.map((scenario) => ({
    ...scenario,
    sourceEvidenceIds: [...scenario.sourceEvidenceIds],
  }));
}

function blocked(code: ScenarioIssue["code"], message: string): ScenarioResolution {
  return {
    status: "blocked",
    issues: [{ severity: "error", code, message }],
  };
}

function normalizeLookup(value: string): string {
  return value.toUpperCase().trim().replace(/\s+/g, " ");
}
