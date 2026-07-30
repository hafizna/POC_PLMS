import type { CaseImpactAssessment } from "./case-impact-readiness";
import type { ProposedDataRevision } from "./case-proposed-revision";
import {
  buildCaseStudyBinding,
  type CaseStudyBinding,
  type StudyBindingIssue,
} from "./case-study-binding";
import type { SettingCase } from "./setting-case";
import type {
  SourceSnapshot,
  StudyCondition,
  StudyScenario,
} from "./engineering-data";
import type { ProtectionFunctionId } from "./unified";

export type StudyRequirementProfile = {
  readonly profileVersion: "study-requirement-v1";
  readonly basis: "permanent_post_commission" | "temporary_emergency_topology";
  readonly requiredConditions: readonly StudyCondition[];
  readonly recommendedConditions: readonly StudyCondition[];
  readonly impactedFunctions: readonly ProtectionFunctionId[];
  readonly excludesWorkOutageCondition: boolean;
  readonly rationale: readonly string[];
};

export type CaseStudyPackageBinding = {
  readonly id: string;
  readonly settingCaseId: string;
  readonly baselineId: string;
  readonly impactAssessmentId: string;
  readonly proposedRevisionId?: string;
  readonly version: number;
  readonly boundAt: string;
  readonly boundBy: string;
  readonly requirementProfile: StudyRequirementProfile;
  readonly scenarioBindings: readonly CaseStudyBinding[];
  readonly missingRequiredConditions: readonly StudyCondition[];
  readonly issues: readonly StudyBindingIssue[];
  readonly status: "blocked" | "compatible";
  readonly fingerprint: {
    readonly algorithm: "fnv1a32";
    readonly value: string;
  };
};

const MAXIMUM_FUNCTIONS = new Set<ProtectionFunctionId>([
  "OCR",
  "GFR",
  "DIST",
  "LCD",
  "CBF",
]);
const MINIMUM_FUNCTIONS = new Set<ProtectionFunctionId>([
  "OCR",
  "GFR",
  "DIST",
  "LCD",
]);
const NORMAL_FUNCTIONS = new Set<ProtectionFunctionId>([
  "AR",
  "SYNC",
  "PSB",
]);

export function deriveStudyRequirementProfile(
  settingCase: SettingCase,
  impact: CaseImpactAssessment
): StudyRequirementProfile {
  const functions = impact.protectionFunctions.map((item) => item.function);
  const required = new Set<StudyCondition>();
  const recommended = new Set<StudyCondition>();
  if (impact.study.selectedDisposition !== "not_required") {
    if (functions.some((item) => MAXIMUM_FUNCTIONS.has(item))) {
      required.add("maximum");
    }
    if (functions.some((item) => MINIMUM_FUNCTIONS.has(item))) {
      required.add("minimum");
    }
    if (functions.some((item) => NORMAL_FUNCTIONS.has(item))) {
      required.add("normal");
    } else {
      recommended.add("normal");
    }
    if (required.size === 0) required.add("normal");
  }
  const temporary =
    settingCase.flowProfile.lifecycleIntent === "temporary_emergency";
  return {
    profileVersion: "study-requirement-v1",
    basis: temporary
      ? "temporary_emergency_topology"
      : "permanent_post_commission",
    requiredConditions: [...required],
    recommendedConditions: [...recommended].filter(
      (item) => !required.has(item)
    ),
    impactedFunctions: [...new Set(functions)].sort(),
    excludesWorkOutageCondition: !temporary,
    rationale: [
      temporary
        ? "Scenario memakai temporary emergency topology dan tidak boleh direuse sebagai permanent baseline."
        : "Scenario memakai target network revision setelah pekerjaan commissioned.",
      required.has("maximum")
        ? "Maximum condition diperlukan oleh fungsi fault/coordination terdampak."
        : "",
      required.has("minimum")
        ? "Minimum condition diperlukan untuk sensitivity/reach check."
        : "",
      required.has("normal")
        ? "Normal operating condition diperlukan oleh AR/SYNC/PSB."
        : "Normal operating condition direkomendasikan tetapi bukan blocker untuk fungsi saat ini.",
    ].filter(Boolean),
  };
}

export function buildCaseStudyPackageBinding(input: {
  settingCase: SettingCase;
  impactAssessment: CaseImpactAssessment;
  proposedRevision?: ProposedDataRevision;
  scenarioIds: readonly string[];
  scenarios: readonly StudyScenario[];
  snapshots: readonly SourceSnapshot[];
  version: number;
  id: string;
  boundAt: string;
  boundBy: string;
}): CaseStudyPackageBinding {
  const requirementProfile = deriveStudyRequirementProfile(
    input.settingCase,
    input.impactAssessment
  );
  const scenarioIds = [...new Set(input.scenarioIds)].filter(Boolean);
  const scenarioBindings = scenarioIds.map((scenarioId, index) =>
    buildCaseStudyBinding({
      settingCase: input.settingCase,
      impactAssessment: input.impactAssessment,
      proposedRevision: input.proposedRevision,
      scenarioId,
      scenarios: input.scenarios,
      snapshots: input.snapshots,
      version: input.version,
      id: `${input.id}_scenario_${index + 1}`,
      boundAt: input.boundAt,
      boundBy: input.boundBy,
    })
  );
  const selectedConditions = new Set(
    scenarioBindings.map((item) => item.scenario.condition)
  );
  const missingRequiredConditions = requirementProfile.requiredConditions.filter(
    (condition) => !selectedConditions.has(condition)
  );
  const issues: StudyBindingIssue[] = scenarioBindings.flatMap(
    (item) => item.issues
  );
  for (const condition of missingRequiredConditions) {
    issues.push({
      code: "condition-unknown",
      severity: "blocker",
      message: `Scenario Package belum mencakup kondisi wajib: ${condition}.`,
    });
  }
  if (scenarioBindings.length === 0) {
    issues.push({
      code: "scenario-not-found",
      severity: "blocker",
      message: "Pilih minimal satu Study Scenario untuk package.",
    });
  }
  const payload = {
    settingCaseId: input.settingCase.id,
    baselineId: input.settingCase.baseline?.id ?? "",
    impactAssessmentId: input.impactAssessment.id,
    proposedRevisionId: input.proposedRevision?.id,
    version: input.version,
    requirementProfile,
    scenarioBindings,
    missingRequiredConditions,
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
