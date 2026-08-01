// Setting Case — the central business object from BUSINESS_PROCESS_BLUEPRINT.md §2.
// A case is the workflow/accountability container; Study Scenario, Calculation Run
// (CalculationSnapshot today), and evidence links hang off it. It never overwrites
// active master data — proposed changes ride on EngineeringChangeSet / overrides
// until activation (§2.1).
import type { SettingCaseBaseline } from "./case-baseline";
import type { ProposedDataRevision } from "./case-proposed-revision";
import type { CaseImpactAssessment } from "./case-impact-readiness";
import type { CaseStudyBinding } from "./case-study-binding";
import type { CaseStudyPackageBinding } from "./case-study-package";
import {
  buildCaseFlowProfile,
  validateCaseFlowProfile,
  type CaseFlowProfile,
  type CaseFlowProfileDraft,
} from "./case-flow-hardening";

export type SettingCaseType =
  | "crosscheck" // P1 — actual setting crosscheck
  | "new_setting" // P2 — new or revised engineering setting
  | "relay_replacement" // P3 — multi-vendor conversion
  | "network_change" // P4 — network / engineering data change
  | "data_correction"; // P5 — master data correction

export const PROCESS_CODE: Record<SettingCaseType, string> = {
  crosscheck: "P1",
  new_setting: "P2",
  relay_replacement: "P3",
  network_change: "P4",
  data_correction: "P5",
};

export const CASE_TYPE_LABEL: Record<SettingCaseType, string> = {
  crosscheck: "Setting Verification / TAP Audit",
  new_setting: "Setting Baru / Revisi",
  relay_replacement: "Penggantian Relay",
  network_change: "Perubahan Jaringan",
  data_correction: "Koreksi Master Data",
};

export const CASE_TYPE_DESCRIPTION: Record<SettingCaseType, string> = {
  crosscheck:
    "Audit PDF TAP issued atau verifikasi actual relay readback; kedua evidence authority tidak dicampur.",
  new_setting:
    "Menghitung dan menerbitkan revisi setting terkendali (baseline beku, skenario studi, calculation run).",
  relay_replacement:
    "Mempertahankan intent proteksi saat platform relay berubah — konversi via canonical, bukan parameter-ke-parameter.",
  network_change:
    "Perubahan topologi/data teknik: change set, analisis dampak, dan pembukaan case setting terdampak.",
  data_correction:
    "Koreksi identitas/mapping tanpa menyamarkannya sebagai proyek fisik jaringan.",
};

export type SettingCaseStage =
  | "draft"
  | "scoping"
  | "baseline_frozen"
  | "document_audit"
  | "actual_readback_intake"
  | "data_change_preparation"
  | "impact_and_readiness"
  | "study_preparation"
  | "calculation"
  | "coordination"
  | "internal_review"
  | "approval"
  | "issued"
  | "field_implementation"
  | "commissioning"
  | "activation"
  | "verification"
  | "restoration"
  | "closed";

export type SettingCaseTerminalState = "cancelled" | "rejected" | "on_hold";
export type SettingCaseStatus = SettingCaseStage | SettingCaseTerminalState;

export const STAGE_LABEL: Record<SettingCaseStatus, string> = {
  draft: "Draft",
  scoping: "Scoping",
  baseline_frozen: "Baseline Beku",
  document_audit: "Audit Dokumen TAP",
  actual_readback_intake: "Intake Readback Relay",
  data_change_preparation: "Persiapan Perubahan Data",
  impact_and_readiness: "Dampak & Kesiapan",
  study_preparation: "Persiapan Studi",
  calculation: "Kalkulasi",
  coordination: "Koordinasi",
  internal_review: "Review Internal",
  approval: "Persetujuan",
  issued: "Terbit (TAP)",
  field_implementation: "Implementasi Lapangan",
  commissioning: "Commissioning & Aktivasi",
  activation: "Aktivasi Data",
  verification: "Verifikasi",
  restoration: "Restorasi",
  closed: "Selesai",
  cancelled: "Dibatalkan",
  rejected: "Ditolak",
  on_hold: "Ditahan",
};

export type ChangeItemKind =
  | "reconductoring"
  | "ct_replacement"
  | "vt_replacement"
  | "relay_replacement"
  | "new_gi_insertion"
  | "topology_change"
  | "remote_side_work"
  | "policy_revision"
  | "data_correction"
  | "other";

export const CHANGE_ITEM_LABEL: Record<ChangeItemKind, string> = {
  reconductoring: "Reconductoring / penggantian konduktor",
  ct_replacement: "Penggantian CT",
  vt_replacement: "Penggantian CVT/VT",
  relay_replacement: "Penggantian relay",
  new_gi_insertion: "Sisipan GI baru / line cut-in",
  topology_change: "Perubahan topologi lain",
  remote_side_work: "Pekerjaan sisi remote",
  policy_revision: "Revisi kebijakan/aturan setting",
  data_correction: "Koreksi data master",
  other: "Lainnya",
};

export type SettingCaseEntryKind = "crosscheck" | "setting_change";

// The operator chooses the business intent and reason. The process code is
// derived so a case cannot claim to be P2 while its primary reason is P3/P4/P5.
export function deriveSettingCaseType(
  entryKind: SettingCaseEntryKind,
  primaryReason: ChangeItemKind
): SettingCaseType {
  if (entryKind === "crosscheck") return "crosscheck";
  if (primaryReason === "relay_replacement") return "relay_replacement";
  if (primaryReason === "data_correction") return "data_correction";
  if (
    primaryReason === "reconductoring" ||
    primaryReason === "new_gi_insertion" ||
    primaryReason === "topology_change" ||
    primaryReason === "remote_side_work"
  ) {
    return "network_change";
  }
  return "new_setting";
}

// Change items that imply a proposed physical/technical data revision (§3.4),
// which pulls the data_change_preparation stage into the route.
const PHYSICAL_CHANGE_ITEMS: ReadonlySet<ChangeItemKind> = new Set([
  "reconductoring",
  "ct_replacement",
  "vt_replacement",
  "relay_replacement",
  "new_gi_insertion",
  "topology_change",
  "remote_side_work",
]);

export function requiresProposedDataRevision(
  changeItems: readonly ChangeItem[]
): boolean {
  return changeItems.some(
    (item) => PHYSICAL_CHANGE_ITEMS.has(item.kind) || item.kind === "data_correction"
  );
}

export type ChangeItem = {
  id: string;
  kind: ChangeItemKind;
  note?: string;
};

export type SettingCaseStageEvent = {
  stage: SettingCaseStatus;
  at: string;
  actor: string;
  note?: string;
};

export type SettingCaseUrgency = "normal" | "high" | "emergency";

export type SettingCaseScope = {
  networkCaseId: string;
  subjectLineId?: string;
  subjectBayId?: string;
  subjectLabel?: string;
  substationIds: string[];
};

export type SettingCaseLinks = {
  studyId?: string;
  scenarioId?: string;
  scenarioIds?: string[];
  sourceIntakeIds: string[];
  calculationSnapshotIds: string[];
  engineeringChangeSetIds: string[];
  // BUSINESS_PROCESS_BLUEPRINT.md §7.2's `CoordinationCheck` — a saved,
  // reproducible coordination run (coverage/selectivity/gap diagnostics),
  // same evidentiary role as calculationSnapshotIds one stage earlier.
  coordinationCheckIds: string[];
  verificationRunIds?: string[];
};

export type SettingCase = {
  id: string;
  caseType: SettingCaseType;
  title: string;
  description?: string;
  primaryReason: ChangeItemKind;
  changeItems: ChangeItem[];
  urgency: SettingCaseUrgency;
  flowProfile: CaseFlowProfile;
  plannedEffectiveDate?: string;
  owningUnit: string;
  remoteUnit?: string;
  protectedScope: SettingCaseScope;
  baseline?: SettingCaseBaseline;
  proposedDataRevisions: ProposedDataRevision[];
  impactAssessments: CaseImpactAssessment[];
  studyBindings: CaseStudyBinding[];
  studyPackageBindings: CaseStudyPackageBinding[];
  links: SettingCaseLinks;
  stage: SettingCaseStatus;
  stageHistory: SettingCaseStageEvent[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

// §5.1: stages can be skipped only by an explicit workflow route. Each case
// type declares its route; new_setting additionally includes
// data_change_preparation only when a physical change item is declared
// ("Setting-only revision" vs "Equipment/data change" on the first screen).
export function applicableStages(
  caseType: SettingCaseType,
  changeItems: ChangeItem[],
  impactAssessments: readonly CaseImpactAssessment[] = [],
  flowProfile?: CaseFlowProfile
): SettingCaseStage[] {
  const hasPhysicalChange = requiresProposedDataRevision(changeItems);
  const latestImpact = impactAssessments[impactAssessments.length - 1];
  const includeStudy =
    latestImpact?.status === "ready_without_study"
      ? false
      : latestImpact?.status === "ready_for_study"
        ? true
        : caseType !== "data_correction";
  switch (caseType) {
    case "crosscheck":
      return [
        "draft",
        "scoping",
        "baseline_frozen",
        flowProfile?.crosscheckMode === "issued_tap_document_audit"
          ? "document_audit"
          : "actual_readback_intake",
        "verification",
        "closed",
      ];
    case "new_setting":
      return [
        "draft",
        "scoping",
        "baseline_frozen",
        ...(hasPhysicalChange ? (["data_change_preparation"] as SettingCaseStage[]) : []),
        "impact_and_readiness",
        ...(includeStudy ? (["study_preparation"] as SettingCaseStage[]) : []),
        "calculation",
        "coordination",
        "internal_review",
        "approval",
        "issued",
        "field_implementation",
        "commissioning",
        "verification",
        ...(flowProfile?.lifecycleIntent === "temporary_emergency"
          ? (["restoration"] as SettingCaseStage[])
          : []),
        "closed",
      ];
    case "relay_replacement":
      // Reuse still requires an explicit approved scenario compatibility proof.
      return [
        "draft",
        "scoping",
        "baseline_frozen",
        "data_change_preparation",
        "impact_and_readiness",
        ...(includeStudy ? (["study_preparation"] as SettingCaseStage[]) : []),
        "calculation",
        "coordination",
        "internal_review",
        "approval",
        "issued",
        "field_implementation",
        "commissioning",
        "verification",
        ...(flowProfile?.lifecycleIntent === "temporary_emergency"
          ? (["restoration"] as SettingCaseStage[])
          : []),
        "closed",
      ];
    case "network_change":
      return [
        "draft",
        "scoping",
        "baseline_frozen",
        "data_change_preparation",
        "impact_and_readiness",
        ...(includeStudy ? (["study_preparation"] as SettingCaseStage[]) : []),
        "calculation",
        "coordination",
        "internal_review",
        "approval",
        "issued",
        "field_implementation",
        "commissioning",
        "verification",
        ...(flowProfile?.lifecycleIntent === "temporary_emergency"
          ? (["restoration"] as SettingCaseStage[])
          : []),
        "closed",
      ];
    case "data_correction":
      return [
        "draft",
        "scoping",
        "baseline_frozen",
        "data_change_preparation",
        "impact_and_readiness",
        ...(includeStudy ? (["study_preparation"] as SettingCaseStage[]) : []),
        "internal_review",
        "approval",
        ...(flowProfile?.activation.mode === "commissioning"
          ? ([
              "issued",
              "field_implementation",
              "commissioning",
              "verification",
            ] as SettingCaseStage[])
          : (["activation"] as SettingCaseStage[])),
        "closed",
      ];
  }
}

export function nextStageOf(settingCase: SettingCase): SettingCaseStage | null {
  const stages = applicableStages(
    settingCase.caseType,
    settingCase.changeItems,
    settingCase.impactAssessments,
    settingCase.flowProfile
  );
  const index = stages.indexOf(settingCase.stage as SettingCaseStage);
  if (index < 0 || index >= stages.length - 1) return null;
  return stages[index + 1];
}

// Sprint 4.1 adds requirement-driven Scenario Packages and hardened flow contracts.
// Sprint 5 (Engineering MVP E1) opens the `calculation` gate: a case can only
// leave this stage once at least one reproducible Calculation Run is linked.
// Sprint 5 (cont'd) opens `coordination` (BUSINESS_PROCESS_BLUEPRINT.md §9's
// "coordinated package, coverage/selectivity/gap results" — CoordinationCheck):
// a case can only leave this stage once at least one such check is linked.
// Mirrors calculation's gate shape deliberately — "did the check run and get
// saved as evidence" is this stage's job; judging whether the results are
// ACCEPTABLE (zero errors, mismatches resolved, etc.) is Review/Approval's
// job (stage 10), not a hard block here.
export const EXECUTABLE_SETTING_CASE_STAGES: ReadonlySet<SettingCaseStage> = new Set([
  "draft",
  "scoping",
  "baseline_frozen",
  "document_audit",
  "actual_readback_intake",
  "data_change_preparation",
  "impact_and_readiness",
  "study_preparation",
  "calculation",
  "coordination",
  "verification",
  "closed",
]);

export function isStageImplemented(stage: SettingCaseStage): boolean {
  return EXECUTABLE_SETTING_CASE_STAGES.has(stage);
}

export type StageGateContext = {
  evidenceCount: number;
  hasScenario: boolean;
  calculationCount: number;
  coordinationCheckCount: number;
  changeSetCount: number;
  persona: string;
  hasBaseline: boolean;
  proposedRevisionReady: boolean;
  impactAssessmentReady: boolean;
  studyBindingReady: boolean;
  studyPackageReady: boolean;
  crosscheckEvidenceBlockers: readonly string[];
  crosscheckEvidenceWarnings: readonly string[];
  crosscheckIntakeReady: boolean;
  verificationRunCount: number;
};

export type StageGateResult = {
  blockers: string[];
  warnings: string[];
};

// Current gates validate intake/scoping, the frozen baseline, completeness of
// the latest proposed revision, impact/study readiness, and (Sprint 5) that at
// least one Calculation Run is linked before leaving the `calculation` stage.
export function stageGate(settingCase: SettingCase, ctx: StageGateContext): StageGateResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const scope = settingCase.protectedScope;

  if (
    !isTerminalState(settingCase.stage) &&
    !isStageImplemented(settingCase.stage as SettingCaseStage)
  ) {
    return {
      blockers: ["Stage ini belum diimplementasikan pada Sprint 4.1."],
      warnings,
    };
  }

  switch (settingCase.stage) {
    case "scoping":
      if (scope.substationIds.length === 0 && !scope.subjectLineId) {
        blockers.push("Scope belum ditentukan: pilih subject line atau minimal satu GI.");
      }
      if (!settingCase.owningUnit) {
        blockers.push("Unit pemilik case belum diisi.");
      }
      if (ctx.evidenceCount === 0) {
        blockers.push("Minimal satu dokumen sumber wajib sebelum baseline dibekukan.");
      }
      blockers.push(...validateCaseFlowProfile(settingCase.flowProfile));
      blockers.push(...ctx.crosscheckEvidenceBlockers);
      warnings.push(...ctx.crosscheckEvidenceWarnings);
      break;
    case "baseline_frozen":
      if (!ctx.hasBaseline) {
        blockers.push("Snapshot baseline immutable belum tersedia.");
      }
      break;
    case "document_audit":
      if (!ctx.crosscheckIntakeReady) {
        blockers.push("TAP issued belum dinormalisasi dan dikirim ke crosscheck untuk case ini.");
      }
      break;
    case "actual_readback_intake":
      if (!ctx.crosscheckIntakeReady) {
        blockers.push(
          "Actual readback belum memiliki native/derived file dari sesi yang sama beserta acquisition manifest lengkap."
        );
      }
      break;
    case "data_change_preparation":
      if (!ctx.proposedRevisionReady) {
        blockers.push("Proposed Data Revision belum lengkap dan siap untuk impact analysis.");
      }
      break;
    case "impact_and_readiness":
      if (!ctx.impactAssessmentReady) {
        blockers.push("Impact Assessment terbaru masih memiliki blocker atau belum dikonfirmasi.");
      }
      break;
    case "study_preparation":
      if (!ctx.studyPackageReady) {
        blockers.push(
          "Belum ada Study Scenario Package yang lengkap dan compatible dengan revision case."
        );
      }
      break;
    case "calculation":
      if (ctx.calculationCount === 0) {
        blockers.push(
          "Belum ada Calculation Run yang tersimpan dan ter-link ke case ini."
        );
      }
      break;
    case "coordination":
      if (ctx.coordinationCheckCount === 0) {
        blockers.push(
          "Belum ada Coordination Check (coverage/selectivity/gap) yang tersimpan dan ter-link ke case ini."
        );
      }
      break;
    case "verification":
      if (ctx.verificationRunCount === 0) {
        blockers.push("Verification report belum disimpan dan ditautkan ke case ini.");
      }
      break;
    default:
      break;
  }
  return { blockers, warnings };
}

export type CreateSettingCaseInput = {
  caseType: SettingCaseType;
  title: string;
  description?: string;
  primaryReason: ChangeItemKind;
  changeItems: ChangeItem[];
  urgency: SettingCaseUrgency;
  flowProfileDraft?: Partial<CaseFlowProfileDraft>;
  plannedEffectiveDate?: string;
  owningUnit: string;
  remoteUnit?: string;
  protectedScope: SettingCaseScope;
  links?: Partial<SettingCaseLinks>;
};

export function createSettingCaseObject(
  input: CreateSettingCaseInput,
  actor: string,
  now: string,
  id: string
): SettingCase {
  const normalizedChangeItems =
    input.caseType === "crosscheck"
      ? []
      : input.changeItems.some((item) => item.kind === input.primaryReason)
        ? input.changeItems
        : [
            { id: `ci_${input.primaryReason}`, kind: input.primaryReason },
            ...input.changeItems,
          ];
  const flowProfile = buildCaseFlowProfile({
    caseType: input.caseType,
    changeItems: normalizedChangeItems,
    urgency: input.urgency,
    owningUnit: input.owningUnit,
    actor,
    draft: input.flowProfileDraft,
  });
  return {
    id,
    caseType: input.caseType,
    title: input.title,
    description: input.description,
    primaryReason: input.primaryReason,
    changeItems: normalizedChangeItems,
    urgency: input.urgency,
    flowProfile,
    plannedEffectiveDate: input.plannedEffectiveDate,
    owningUnit: input.owningUnit,
    remoteUnit: input.remoteUnit,
    protectedScope: input.protectedScope,
    proposedDataRevisions: [],
    impactAssessments: [],
    studyBindings: [],
    studyPackageBindings: [],
    links: {
      studyId: input.links?.studyId,
      scenarioId: input.links?.scenarioId,
      scenarioIds: input.links?.scenarioIds ?? [],
      sourceIntakeIds: input.links?.sourceIntakeIds ?? [],
      calculationSnapshotIds: input.links?.calculationSnapshotIds ?? [],
      engineeringChangeSetIds: input.links?.engineeringChangeSetIds ?? [],
      coordinationCheckIds: input.links?.coordinationCheckIds ?? [],
      verificationRunIds: input.links?.verificationRunIds ?? [],
    },
    stage: "draft",
    stageHistory: [{ stage: "draft", at: now, actor }],
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
  };
}

export function isTerminalState(status: SettingCaseStatus): status is SettingCaseTerminalState {
  return status === "cancelled" || status === "rejected" || status === "on_hold";
}

export function isOpenCase(settingCase: SettingCase): boolean {
  return (
    settingCase.stage !== "closed" &&
    settingCase.stage !== "cancelled" &&
    settingCase.stage !== "rejected"
  );
}
