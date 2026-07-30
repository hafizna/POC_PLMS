import { CROSSCHECK_WORKBOOK_REGISTRY } from "./crosscheck-workbook-registry";
import {
  LEGACY_NETWORK_SNAPSHOT_ID,
  P545_MATHCAD_SNAPSHOT_ID,
  selectFaultRecordsForScenario,
  type ScenarioIssue,
  type SourceSnapshot,
  type StudyScenario,
} from "./engineering-data";
import { MATHCAD_TEMPLATE_REGISTRY } from "./mathcad-template-registry";
import { OCR_REGISTRY } from "./ocr-import";
import { RELAY_CATALOG } from "./relay-catalog";

export const P545_PILOT_ARTIFACT_ID =
  "mathcad_tap_setting_micom_p545_gi_ciledug_bay_alam_sutera_1";

export type P545InputSection =
  | "identity"
  | "line"
  | "instrument-transformer"
  | "operating-limit"
  | "fault-study"
  | "adjacent-network";

export type P545InputUnit =
  | "model"
  | "serial"
  | "kV-primary"
  | "V-secondary"
  | "A-primary"
  | "A-secondary"
  | "kA-primary"
  | "km"
  | "ohm-primary"
  | "ratio"
  | "dimensionless";

export type P545InputStatus =
  | "resolved"
  | "conflict"
  | "missing"
  | "blocked"
  | "overridden";

export type P545InputSourceKind =
  | "network-snapshot"
  | "fault-snapshot"
  | "mathcad-benchmark"
  | "relay-register"
  | "tap-register"
  | "manual-override";

export type P545InputSource = {
  kind: P545InputSourceKind;
  label: string;
  sourceRef: string;
  locator: string;
  capturedAt: string;
  effectiveAt?: string;
  snapshotId?: string;
  scenarioId?: string;
  note?: string;
};

export type P545InputCandidate = {
  id: string;
  value: number | string;
  unit: P545InputUnit;
  source: P545InputSource;
};

export type P545InputOverride = {
  inputKey: string;
  value: number | string;
  reason: string;
  actor: string;
  at: string;
};

export type P545EngineeringInput = {
  key: string;
  label: string;
  description: string;
  section: P545InputSection;
  valueType: "number" | "string";
  unit: P545InputUnit;
  required: boolean;
  status: P545InputStatus;
  value: number | string | null;
  selectedCandidateId?: string;
  candidates: P545InputCandidate[];
  override?: P545InputOverride;
  issue?: string;
};

export type P545InputContract = {
  schema: "plms.p545-input-contract.v1";
  id: string;
  label: string;
  relayFamily: "MiCOM P54x";
  localStation: "CILEDUG";
  remoteStation: "ALAM SUTERA";
  circuit: "1";
  scenarioId?: string;
  status: "blocked" | "needs-review" | "ready";
  inputs: P545EngineeringInput[];
  scenarioIssues: ScenarioIssue[];
  summary: {
    resolved: number;
    conflicts: number;
    missing: number;
    blocked: number;
    overridden: number;
  };
};

type BuildP545InputContractArgs = {
  snapshots: SourceSnapshot[];
  scenarios: StudyScenario[];
  scenarioId?: string | null;
  overrides?: P545InputOverride[];
};

const RELAY_REGISTER_CAPTURED_AT =
  RELAY_CATALOG.summary.sourceLastModified || "2026-07-29T00:00:00.000Z";
const OCR_REGISTER_CAPTURED_AT =
  OCR_REGISTRY.summary.generatedAt || RELAY_REGISTER_CAPTURED_AT;
const MATHCAD_EFFECTIVE_AT = "2021-03-17T00:00:00.000Z";

export function buildP545InputContract(
  args: BuildP545InputContractArgs
): P545InputContract {
  const artifact = MATHCAD_TEMPLATE_REGISTRY.artifacts.find(
    (item) => item.id === P545_PILOT_ARTIFACT_ID
  );
  const line = CROSSCHECK_WORKBOOK_REGISTRY.digsilentLineDb.records.find(
    (item) =>
      item.name === "CLDUG-ALMSR" ||
      (hasText(item.fromSubstation, "ALAM") && hasText(item.toSubstation, "CILEDUG"))
  );
  const relayAsset = RELAY_CATALOG.assets.find(
    (asset) =>
      asset.stationNormalized === "ciledug" &&
      asset.bayNormalized === "alam sutera 1" &&
      asset.roles.includes("MPU")
  );
  const ocrRecord = OCR_REGISTRY.records.find(
    (record) =>
      hasText(record.substation, "CILEDUG") &&
      hasText(record.bay, "ALAM SUTERA") &&
      record.circuit === "#1"
  );
  const faultSelection = selectFaultRecordsForScenario({
    snapshots: args.snapshots,
    scenarios: args.scenarios,
    scenarioId: args.scenarioId,
    records: CROSSCHECK_WORKBOOK_REGISTRY.faultLevelDb.records,
    substation: "CILEDUG",
  });

  const networkSnapshot =
    faultSelection.status === "ready"
      ? faultSelection.context.networkSnapshot
      : args.snapshots.find((snapshot) => snapshot.id === LEGACY_NETWORK_SNAPSHOT_ID);
  const faultSnapshot =
    faultSelection.status === "ready" ? faultSelection.context.faultSnapshot : undefined;
  const scenario =
    faultSelection.status === "ready"
      ? faultSelection.context.scenario
      : args.scenarios.find((item) => item.id === args.scenarioId);
  const firstFault = faultSelection.status === "ready" ? faultSelection.records[0] : undefined;
  const scenarioIssues =
    faultSelection.status === "ready"
      ? faultSelection.context.issues
      : faultSelection.issues;

  const mathcadSource = (locator: string, note?: string): P545InputSource => ({
    kind: "mathcad-benchmark",
    label: "P545 Ciledug–Alam Sutera Mathcad benchmark",
    sourceRef:
      artifact?.fileName ??
      "Tap Setting MiCom P545 GI Ciledug Bay Alam Sutera #1.xmcd",
    locator,
    capturedAt: MATHCAD_TEMPLATE_REGISTRY.generatedAt,
    effectiveAt: MATHCAD_EFFECTIVE_AT,
    snapshotId: P545_MATHCAD_SNAPSHOT_ID,
    note,
  });

  const networkSource = (locator: string): P545InputSource => ({
    kind: "network-snapshot",
    label: networkSnapshot?.label ?? "DIgSILENT line database — 9 March 2021",
    sourceRef:
      networkSnapshot?.sourceRef ?? CROSSCHECK_WORKBOOK_REGISTRY.fileName,
    locator,
    capturedAt:
      networkSnapshot?.capturedAt ?? CROSSCHECK_WORKBOOK_REGISTRY.generatedAt,
    effectiveAt: networkSnapshot?.effectiveAt,
    snapshotId: networkSnapshot?.id,
    scenarioId: scenario?.id,
  });

  const relaySource = (locator: string): P545InputSource => ({
    kind: "relay-register",
    label: "UPT DKSBI relay asset register",
    sourceRef: RELAY_CATALOG.summary.sourceWorkbook,
    locator,
    capturedAt: RELAY_REGISTER_CAPTURED_AT,
    note: "Asset register evidence; effective replacement date is not encoded.",
  });

  const tapSource = (locator: string): P545InputSource => ({
    kind: "tap-register",
    label: "UPT DKSBI TAP/OCR register",
    sourceRef: OCR_REGISTRY.summary.inputFile,
    locator,
    capturedAt: OCR_REGISTER_CAPTURED_AT,
    effectiveAt: ocrRecord?.tap.date || undefined,
  });

  const faultSource = (locator: string): P545InputSource => ({
    kind: "fault-snapshot",
    label: faultSnapshot?.label ?? "Fault-study snapshot",
    sourceRef: faultSnapshot?.sourceRef ?? CROSSCHECK_WORKBOOK_REGISTRY.fileName,
    locator,
    capturedAt:
      faultSnapshot?.capturedAt ?? CROSSCHECK_WORKBOOK_REGISTRY.generatedAt,
    effectiveAt: faultSnapshot?.effectiveAt,
    snapshotId: faultSnapshot?.id,
    scenarioId: scenario?.id,
    note: faultSnapshot?.effectivePeriodLabel,
  });

  const ct = parseRatio(ocrRecord?.ctRatio);
  const inputs: P545EngineeringInput[] = [
    makeInput({
      key: "relay_model",
      label: "Main protection relay",
      description: "Relay family determines the available setting semantics and limits.",
      section: "identity",
      valueType: "string",
      unit: "model",
      required: true,
      candidates: compactCandidates([
        artifact
          ? candidate("relay-model-xmcd", artifact.relayFamily, "model", mathcadSource("file name"))
          : null,
        relayAsset
          ? candidate(
              "relay-model-register",
              relayAsset.model,
              "model",
              relaySource(
                relayAsset.sourceRefs
                  .map((ref) => `${ref.sheet}!row ${ref.row}`)
                  .join(", ")
              )
            )
          : null,
      ]),
    }),
    makeInput({
      key: "relay_serial",
      label: "Main protection serial",
      description: "Physical asset identity for firmware/manual confirmation.",
      section: "identity",
      valueType: "string",
      unit: "serial",
      required: true,
      candidates: compactCandidates([
        relayAsset?.serial
          ? candidate(
              "relay-serial-register",
              relayAsset.serial,
              "serial",
              relaySource("LCD!row 136, DIST!row 136")
            )
          : null,
      ]),
    }),
    numericInput("nominal_voltage", "Nominal voltage", "line", "kV-primary", 150, [
      line
        ? candidate(
            "voltage-db",
            150,
            "kV-primary",
            networkSource(`DB!row ${line.row} (${line.type})`)
          )
        : null,
    ]),
    numericInput("line_length", "Protected line length", "line", "km", line?.lengthKm, [
      numberCandidate(
        "length-db",
        line?.lengthKm,
        "km",
        networkSource(`DB!row ${line?.row ?? "?"}`)
      ),
      artifact
        ? candidate("length-xmcd", 3.25, "km", mathcadSource("L11 = 3.25"))
        : null,
    ]),
    numericInput("line_r1", "Positive-sequence R1", "line", "ohm-primary", line?.r1Ohm, [
      numberCandidate(
        "r1-db",
        line?.r1Ohm,
        "ohm-primary",
        networkSource(`DB!row ${line?.row ?? "?"}`)
      ),
    ]),
    numericInput("line_x1", "Positive-sequence X1", "line", "ohm-primary", line?.x1Ohm, [
      numberCandidate(
        "x1-db",
        line?.x1Ohm,
        "ohm-primary",
        networkSource(`DB!row ${line?.row ?? "?"}`)
      ),
    ]),
    numericInput("line_r0", "Zero-sequence R0", "line", "ohm-primary", line?.r0Ohm, [
      numberCandidate(
        "r0-db",
        line?.r0Ohm,
        "ohm-primary",
        networkSource(`DB!row ${line?.row ?? "?"}`)
      ),
    ]),
    numericInput("line_x0", "Zero-sequence X0", "line", "ohm-primary", line?.x0Ohm, [
      numberCandidate(
        "x0-db",
        line?.x0Ohm,
        "ohm-primary",
        networkSource(`DB!row ${line?.row ?? "?"}`)
      ),
    ]),
    numericInput("line_k0", "Residual compensation kZ0", "line", "dimensionless", line?.k0, [
      numberCandidate(
        "k0-db",
        line?.k0,
        "dimensionless",
        networkSource(`DB!row ${line?.row ?? "?"}`)
      ),
    ]),
    numericInput(
      "ct_primary",
      "CT primary",
      "instrument-transformer",
      "A-primary",
      ct?.primary,
      [
        numberCandidate(
          "ct-primary-register",
          ct?.primary,
          "A-primary",
          tapSource(`OCR_PHT!row ${ocrRecord?.sourceRow ?? "?"}`)
        ),
        artifact
          ? candidate(
              "ct-primary-xmcd",
              3000,
              "A-primary",
              mathcadSource("CTp result = 3000 A")
            )
          : null,
      ]
    ),
    numericInput(
      "ct_secondary",
      "CT secondary / relay In",
      "instrument-transformer",
      "A-secondary",
      ct?.secondary,
      [
        numberCandidate(
          "ct-secondary-register",
          ct?.secondary,
          "A-secondary",
          tapSource(`OCR_PHT!row ${ocrRecord?.sourceRow ?? "?"}`)
        ),
        artifact
          ? candidate(
              "relay-in-xmcd",
              1,
              "A-secondary",
              mathcadSource("In result = 1 A")
            )
          : null,
      ]
    ),
    missingInput(
      "vt_primary",
      "VT primary",
      "instrument-transformer",
      "kV-primary",
      "VT ratio is not present in the indexed pilot registers and must be confirmed from SLD/nameplate/TAP."
    ),
    missingInput(
      "vt_secondary",
      "VT secondary",
      "instrument-transformer",
      "V-secondary",
      "VT ratio is not present in the indexed pilot registers and must be confirmed from SLD/nameplate/TAP."
    ),
    numericInput(
      "continuous_current",
      "Continuous current criterion (CCC)",
      "operating-limit",
      "A-primary",
      1428,
      [
        artifact
          ? candidate(
              "ccc-xmcd",
              1428,
              "A-primary",
              mathcadSource("Iccc / CCC result = 1428 A")
            )
          : null,
      ],
      "Engineering loading criterion used by the worksheet; this is not the cable thermal rating."
    ),
    numericInput(
      "conductor_current_rating",
      "Conductor current rating",
      "operating-limit",
      "A-primary",
      line?.currentRatingKa ? line.currentRatingKa * 1000 : null,
      [
        numberCandidate(
          "rating-db",
          line?.currentRatingKa ? line.currentRatingKa * 1000 : null,
          "A-primary",
          networkSource(`DB!row ${line?.row ?? "?"} (${line?.type ?? "line type"})`)
        ),
      ],
      "Physical conductor rating. Kept separate from the 1,428 A CCC."
    ),
    makeInput({
      key: "fault_3ph",
      label: "Local 3-phase fault current",
      description:
        "Scenario-bound IHS input used by resistive reach/arc calculations.",
      section: "fault-study",
      valueType: "number",
      unit: "kA-primary",
      required: true,
      blocked:
        faultSelection.status === "blocked"
          ? "Select a valid Study Scenario before fault current can enter the calculation."
          : undefined,
      candidates: compactCandidates([
        artifact
          ? candidate(
              "fault-3ph-xmcd",
              26.24,
              "kA-primary",
              mathcadSource("Ihs3f = 26240 A", "Benchmark value, not current network truth.")
            )
          : null,
        firstFault?.fault3phKa !== null && firstFault?.fault3phKa !== undefined
          ? candidate(
              "fault-3ph-scenario",
              firstFault.fault3phKa,
              "kA-primary",
              faultSource(`IHS!row ${firstFault.row}`)
            )
          : null,
      ]),
    }),
    makeInput({
      key: "fault_1ph",
      label: "Local 1-phase fault current",
      description: "Scenario-bound single-phase fault input.",
      section: "fault-study",
      valueType: "number",
      unit: "kA-primary",
      required: true,
      blocked:
        faultSelection.status === "blocked"
          ? "Select a valid Study Scenario before fault current can enter the calculation."
          : undefined,
      candidates: compactCandidates([
        firstFault?.fault1phKa !== null && firstFault?.fault1phKa !== undefined
          ? candidate(
              "fault-1ph-scenario",
              firstFault.fault1phKa,
              "kA-primary",
              faultSource(`IHS!row ${firstFault.row}`)
            )
          : null,
      ]),
    }),
    missingInput(
      "forward_remote_z1",
      "Forward remote equivalent Z1",
      "adjacent-network",
      "ohm-primary",
      "The protected section is known, but the approved forward-chain equivalent and topology state are not yet bound to this pilot."
    ),
    missingInput(
      "reverse_remote_z1",
      "Reverse remote equivalent Z1",
      "adjacent-network",
      "ohm-primary",
      "Required for reverse zones; no approved reverse-network equivalent is selected."
    ),
    missingInput(
      "infeed_factor",
      "Remote infeed factor",
      "adjacent-network",
      "ratio",
      "Requires a fault-study result at the relevant remote fault location, not a static line attribute."
    ),
  ];

  const withOverrides = applyOverrides(inputs, args.overrides ?? []);
  const summary = {
    resolved: withOverrides.filter((input) => input.status === "resolved").length,
    conflicts: withOverrides.filter((input) => input.status === "conflict").length,
    missing: withOverrides.filter((input) => input.status === "missing").length,
    blocked: withOverrides.filter((input) => input.status === "blocked").length,
    overridden: withOverrides.filter((input) => input.status === "overridden").length,
  };
  const requiredProblem = withOverrides.some(
    (input) =>
      input.required &&
      (input.status === "blocked" || input.status === "missing")
  );

  return {
    schema: "plms.p545-input-contract.v1",
    id: "p545-ciledug-alam-sutera-1",
    label: "P545 pilot — Ciledug → Alam Sutera #1",
    relayFamily: "MiCOM P54x",
    localStation: "CILEDUG",
    remoteStation: "ALAM SUTERA",
    circuit: "1",
    scenarioId: scenario?.id,
    status:
      faultSelection.status === "blocked" || requiredProblem
        ? "blocked"
        : summary.conflicts > 0 || summary.missing > 0
          ? "needs-review"
          : "ready",
    inputs: withOverrides,
    scenarioIssues,
    summary,
  };
}

export function createP545InputOverride(input: {
  contract: P545InputContract;
  inputKey: string;
  rawValue: string;
  reason: string;
  actor: string;
  at?: string;
}): P545InputOverride {
  const target = input.contract.inputs.find((item) => item.key === input.inputKey);
  if (!target) throw new Error(`Unknown P545 input: ${input.inputKey}.`);
  if (target.status === "blocked") {
    throw new Error("Scenario-gated inputs cannot be overridden until a valid scenario is selected.");
  }
  if (input.reason.trim().length < 8) {
    throw new Error("Override reason must contain at least 8 characters.");
  }
  const value =
    target.valueType === "number" ? Number(input.rawValue.replace(",", ".")) : input.rawValue.trim();
  if (
    (target.valueType === "number" && (typeof value !== "number" || !Number.isFinite(value))) ||
    (target.valueType === "string" && !value)
  ) {
    throw new Error(`Override value for ${target.label} is invalid.`);
  }
  if (!input.actor.trim()) throw new Error("Override actor is required.");

  return {
    inputKey: target.key,
    value,
    reason: input.reason.trim(),
    actor: input.actor.trim(),
    at: input.at ?? new Date().toISOString(),
  };
}

function applyOverrides(
  inputs: P545EngineeringInput[],
  overrides: P545InputOverride[]
): P545EngineeringInput[] {
  return inputs.map((input) => {
    const override = [...overrides].reverse().find((item) => item.inputKey === input.key);
    if (!override || input.status === "blocked") return input;
    return {
      ...input,
      status: "overridden",
      value: override.value,
      selectedCandidateId: undefined,
      override,
    };
  });
}

function numericInput(
  key: string,
  label: string,
  section: P545InputSection,
  unit: P545InputUnit,
  _fallbackValue: number | null | undefined,
  candidates: Array<P545InputCandidate | null>,
  description = "Typed engineering input with explicit primary-domain unit."
): P545EngineeringInput {
  return makeInput({
    key,
    label,
    description,
    section,
    valueType: "number",
    unit,
    required: true,
    candidates: compactCandidates(candidates),
  });
}

function missingInput(
  key: string,
  label: string,
  section: P545InputSection,
  unit: P545InputUnit,
  issue: string
): P545EngineeringInput {
  return makeInput({
    key,
    label,
    description: issue,
    section,
    valueType: "number",
    unit,
    required: true,
    candidates: [],
    issue,
  });
}

function makeInput(input: {
  key: string;
  label: string;
  description: string;
  section: P545InputSection;
  valueType: "number" | "string";
  unit: P545InputUnit;
  required: boolean;
  candidates: P545InputCandidate[];
  issue?: string;
  blocked?: string;
}): P545EngineeringInput {
  if (input.blocked) {
    return {
      ...input,
      status: "blocked",
      value: null,
      issue: input.blocked,
    };
  }
  if (input.candidates.length === 0) {
    return {
      ...input,
      status: "missing",
      value: null,
      issue: input.issue ?? "No source candidate is available.",
    };
  }

  const distinct = distinctValues(input.candidates);
  if (distinct.length > 1) {
    return {
      ...input,
      status: "conflict",
      value: null,
      issue: "Source candidates disagree. Engineer selection with an override reason is required.",
    };
  }

  return {
    ...input,
    status: "resolved",
    value: input.candidates[0].value,
    selectedCandidateId: input.candidates[0].id,
  };
}

function distinctValues(candidates: P545InputCandidate[]) {
  return candidates.reduce<Array<number | string>>((values, candidate) => {
    const exists = values.some((value) => equivalent(value, candidate.value));
    return exists ? values : [...values, candidate.value];
  }, []);
}

function equivalent(left: number | string, right: number | string) {
  if (typeof left === "number" && typeof right === "number") {
    const scale = Math.max(1, Math.abs(left), Math.abs(right));
    return Math.abs(left - right) / scale <= 1e-6;
  }
  return String(left).trim().toUpperCase() === String(right).trim().toUpperCase();
}

function candidate(
  id: string,
  value: number | string,
  unit: P545InputUnit,
  source: P545InputSource
): P545InputCandidate {
  return { id, value, unit, source };
}

function numberCandidate(
  id: string,
  value: number | null | undefined,
  unit: P545InputUnit,
  source: P545InputSource
): P545InputCandidate | null {
  return value === null || value === undefined ? null : candidate(id, value, unit, source);
}

function compactCandidates(
  candidates: Array<P545InputCandidate | null>
): P545InputCandidate[] {
  return candidates.filter((item): item is P545InputCandidate => item !== null);
}

function parseRatio(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  if (!match) return null;
  const primary = Number(match[1]);
  const secondary = Number(match[2]);
  return Number.isFinite(primary) && Number.isFinite(secondary)
    ? { primary, secondary }
    : null;
}

function hasText(value: string, expected: string) {
  return value.toUpperCase().includes(expected);
}
