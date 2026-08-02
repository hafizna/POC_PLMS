import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Relay, Zone } from "../domain/types";
import { TOPOLOGY, CORRIDORS } from "../domain/seed-corridor";
import { COMPARISON_BAYS, findComparisonBayIdForLine } from "../domain/seed-comparison";
import { NETWORK_CASES } from "../domain/seed-network-registry";
import { buildUnifiedNetwork } from "../domain/unified";
import {
  getEffectiveNetworkGraph,
  INVENTORY_MASTER_CASE_ID,
  mergeMasterRelationsIntoCase,
  networkLinesFromGraph,
} from "../domain/network-graph";
// graph-builder.ts's getFullAnchoredNetwork is intentionally NOT imported
// statically here: useProsetStore.ts is eagerly imported by App.tsx (it's
// not behind a lazy route), and graph-builder.ts pulls in every generated
// JSON registry (relay-catalog.json, crosscheck-workbook-registry.json,
// lcd-dist-registry.json — over 2MB combined). A static import would ship
// all of that in the app's main bundle for every user on first load, just
// so selectLine's fallback branch (below) can reach it on the rare path
// where a line isn't in any NETWORK_CASES subset. Dynamic import() keeps it
// in graph-builder's own lazy chunk (already loaded by SettingCaseWizard/
// InboxView/CoverageView/CalculationView, which need the same data anyway).
import type {
  Bay,
  Busbar,
  LifecycleStatus,
  LineRelation,
  RelayIED,
  Terminal,
  UnifiedSubstation,
  ProtectionFunctionId,
} from "../domain/unified";
import type { CtSpec, VtSpec } from "../domain/instrument-transformers";
import type { GraphDiagnostic } from "../lib/graph-coordination";
import type {
  VerificationReferenceDraft,
  VerificationRunRecord,
} from "../domain/setting-verification";
import type { VendorImportHandoffDraft } from "../domain/vendor-import";
import {
  LEGACY_STUDY_SCENARIO_ID,
  cloneDefaultSourceSnapshots,
  cloneDefaultStudyScenarios,
  type SourceSnapshot,
  type StudyScenario,
} from "../domain/engineering-data";
import {
  buildInsertionChangeSet,
  type EngineeringChangeBaseline,
  type EngineeringChangeSet,
} from "../domain/engineering-change";
import {
  applicableStages,
  createSettingCaseObject,
  isStageImplemented,
  isTerminalState,
  nextStageOf,
  stageGate,
  STAGE_LABEL,
  type CreateSettingCaseInput,
  type ChangeItemKind,
  type SettingCase,
  type SettingCaseStage,
  type SettingCaseStatus,
  type SettingCaseType,
} from "../domain/setting-case";
import {
  buildCaseBaseline,
  type BuildCaseBaselineResult,
} from "../domain/case-baseline";
import {
  buildProposedDataRevision,
  type ProposedDataRevisionDraft,
} from "../domain/case-proposed-revision";
import {
  buildCaseImpactAssessment,
  type CaseImpactAssessmentInput,
} from "../domain/case-impact-readiness";
import { buildCaseStudyPackageBinding } from "../domain/case-study-package";
import {
  assessCrosscheckEvidence,
  buildCaseFlowProfile,
  validateCaseFlowProfile,
} from "../domain/case-flow-hardening";
import {
  executeP545CaseCalculation,
  type ExecuteP545CaseResult,
  type P545CaseInputOverride,
  type TargetedCalculationRun,
} from "../domain/p545-case-execution";
import {
  createSnapshotStateStorage,
  PROTECTION_LIFECYCLE_SNAPSHOT_NAME,
  PROTECTION_LIFECYCLE_SNAPSHOT_VERSION,
  selectProtectionLifecycleSnapshot,
} from "../repositories/protection-lifecycle-repository";

export type NetworkGraphOverride = {
  substations: UnifiedSubstation[];
  busbars: Busbar[];
  bays: Bay[];
  terminals: Terminal[];
  relations: LineRelation[];
  ieds: RelayIED[];
};

export type NetworkUndoEntry = {
  id: string;
  caseId: string;
  at: string;
  summary: string;
  overrideBefore?: NetworkGraphOverride;
};

const EMPTY_OVERRIDE: NetworkGraphOverride = {
  substations: [],
  busbars: [],
  bays: [],
  terminals: [],
  relations: [],
  ieds: [],
};

export type Tab =
  | "cases"
  | "reference-setting"
  | "home"
  | "master-data"
  | "study-dashboard"
  | "network-model"
  | "network-graph-editor"
  | "source-index"
  | "inbox"
  | "line-registry"
  | "calculation"
  | "comparison"
  | "vendor-import"
  | "coverage"
  | "verified-report"
  | "audit-trail";
type Persona = "Engineer" | "Asisten Manajer" | "Manajer";

export type Study = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  substationIds: string[];
  scopeRevision?: number;
  scopeHistory?: Array<{
    revision: number;
    substationIds: string[];
    changedAt: string;
    changedBy: Persona;
    reason: string;
  }>;
  subjectBayId?: string;
  subjectLineId?: string;
  subjectLabel?: string;
  scenarioId?: string;
  sourceBridge?: {
    kind: "legacy_crosscheck_workbook";
    sourceRef: string;
    distanceCaseLabel?: string;
    ocrGfrCaseLabel?: string;
  };
  status: "active" | "completed" | "archived";
};

export type CreateStudyOptions = {
  subjectBayId?: string;
  subjectLineId?: string;
  subjectLabel?: string;
  scenarioId?: string;
  sourceBridge?: Study["sourceBridge"];
};

// Two Studies, each scoped to one subject line — not one Study spanning
// four GI as a single "corridor" (the old seed's mistake: a Study should be
// "test protection for this one penghantar", with neighbors included only
// for Z2/Z3 forward-chain context, not as co-equal subjects). Both draw
// their subjectBayId/subjectLineId from NETWORK_GRAPH_DKS_PIK, which is now
// built from the graph-builder anchor (digsilentLineDb-confirmed shortCodes
// DKSBI/DNMGT/PINKA/MB), not the retired generateCorridorNmm generator.
// Kept only so very old persisted stores can be interpreted before the v25
// migration removes these historical demo Studies. Never use as runtime seed.
const LEGACY_MIGRATION_STUDIES: Study[] = [
  {
    id: "study_dksbi_dnmgt",
    name: "Penghantar DKSBI - DNMGT",
    description:
      "Analisis distance/LCD setting penghantar 150 kV Durikosambi - Daan Mogot. Neighbor DNMGT-PINKA disertakan untuk konteks Z2/Z3 forward-chain.",
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-07-29T00:00:00Z",
    substationIds: ["sub_durikosambi", "sub_daan_mogot", "sub_pantai_indah_kapuk"],
    subjectBayId: "bay_sub_durikosambi_sub_daan_mogot_1",
    subjectLineId: "anchor_line_359",
    subjectLabel: "DKSBI | PHT 150kV DAAN MOGOT GIS#1",
    scenarioId: LEGACY_STUDY_SCENARIO_ID,
    status: "active",
  },
  {
    id: "study_dnmgt_pinka",
    name: "Penghantar DNMGT - PINKA",
    description:
      "Analisis distance/LCD setting penghantar 150 kV Daan Mogot - Pantai Indah Kapuk. Neighbor DKSBI-DNMGT (reverse) dan PINKA-MB (forward) disertakan untuk konteks Z2/Z3.",
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-07-29T00:00:00Z",
    substationIds: ["sub_daan_mogot", "sub_pantai_indah_kapuk", "sub_durikosambi", "sub_m_karang_baru"],
    subjectBayId: "bay_sub_daan_mogot_sub_pantai_indah_kapuk_1",
    subjectLineId: "anchor_line_361",
    subjectLabel: "DNMGT | PHT 150kV GIS PANTAI INDAH KAPUK#1",
    scenarioId: LEGACY_STUDY_SCENARIO_ID,
    status: "active",
  },
];

export type AuditEvent = {
  id: string;
  at: string;
  actor: Persona;
  action:
    | "source_intake_add"
    | "source_intake_remove"
    | "candidate_decision"
    | "candidate_reset"
    | "study_created"
    | "study_deleted"
    | "study_selected"
    | "study_scope_revised"
    | "study_scenario_selected"
    | "engineering_change_set_created"
    | "line_selected"
    | "zone_updated"
    | "relay_reset"
    | "reset_edits"
    | "network_graph_add"
    | "network_graph_remove"
    | "network_graph_reset"
    | "ct_vt_update"
    | "ct_vt_clear"
    | "pdf_tap_promote"
    | "pdf_tap_unpromote"
    | "calculation_snapshot_add"
    | "calculation_snapshot_remove"
    | "targeted_calculation_run_created"
    | "coordination_check_add"
    | "coordination_check_remove"
    | "reference_verification_staged"
    | "vendor_import_staged"
    | "verification_run_saved"
    | "setting_case_created"
    | "setting_case_baseline_frozen"
    | "setting_case_proposed_revision_saved"
    | "setting_case_impact_assessed"
    | "setting_case_study_bound"
    | "setting_case_study_package_bound"
    | "setting_case_stage_changed"
    | "setting_case_updated"
    | "setting_case_linked";
  scope?: string;
  targetId?: string;
  summary: string;
  detail?: string;
};

export type SourceIntakeRecord = {
  id: string;
  stagedAt: string;
  actor: Persona;
  caseId: string;
  fileName: string;
  sizeBytes?: number;
  documentType:
    | "sld"
    | "tap_setting"
    | "excel_registry"
    | "relay_export"
    | "ba_supporting"
    | "other";
  stationHint?: string;
  bayHint?: string;
  note?: string;
  status: "staged" | "unsupported" | "extracting" | "extracted" | "extract_failed";
  // Extraction artifacts populated when a PDF runs through OCR pipeline.
  extractionMethod?: "text-layer" | "ocr" | "failed";
  extractedTextPreview?: string;     // first ~500 chars
  extractedPageCount?: number;
  extractionDurationMs?: number;
  extractedFields?: Array<{ field: string; value: string; unit?: string }>;
  checksum?: { algorithm: "sha256"; value: string };
};

export type RunP545TargetedCalculationResult =
  | ExecuteP545CaseResult
  | { ok: false; errors: string[]; contract?: undefined };

export type CandidateDecision = {
  status: LifecycleStatus;
  decidedAt: string;
  note?: string;
  // When the auto-matcher could not pick exactly one LineRelation
  // (ambiguous or needs_validation), the engineer can manually pick the
  // intended line via Inbox. The picked id wins over `matchedLineId`
  // when computing relation status / function promotions.
  overrideLineId?: string;
};

export type CtVtOverride = {
  iedId: string;
  bayId?: string;
  ct?: CtSpec;
  vt?: VtSpec;
  sourceRef?: string;
  status: LifecycleStatus;
  updatedAt: string;
  actor: Persona;
};

export type CtVtOverrideInput = {
  iedId: string;
  bayId?: string;
  ct?: CtSpec | null;
  vt?: VtSpec | null;
  sourceRef?: string;
  status?: LifecycleStatus;
};

// Promotion of OCR-extracted fields from a TAP PDF directly to a LineRelation.
// Unlike LCD+DIST/OCR Excel imports that flow through the Inbox review queue,
// PDF promotions are a one-shot action: engineer picks the target line at
// promote time, then the extracted setting fields land as a typed source on
// that line's relation-status (alongside seed / lcd-dist / ocr-gfr).
export type PdfTapPromotion = {
  id: string;
  sourceIntakeId: string;     // back-reference to staged source
  caseId: string;
  lineId: string;
  fileName: string;
  promotedAt: string;
  actor: Persona;
  status: LifecycleStatus;
  fields: Array<{ field: string; value: string; unit?: string }>;
  note?: string;
};

// Engineering workbook result promoted into the lifecycle. This is not a
// final issued TAP yet; it is a traceable calculation snapshot that can feed
// Setting Register, Coverage, Comparison, and the future approval workflow.
export type CalculationSnapshot = {
  id: string;
  caseId: string;
  lineId: string;
  templateId: string;
  templateName: string;
  functionIds: ProtectionFunctionId[];
  createdAt: string;
  actor: Persona;
  status: LifecycleStatus;
  sourceRef: string;
  inputValues: Record<string, number | string | null>;
  outputValues: Record<string, number | string | null>;
  warnings: string[];
  note?: string;
};

// BUSINESS_PROCESS_BLUEPRINT.md §7.2/§9's `CoordinationCheck` — a saved
// coverage/selectivity/gap coordination run, same evidentiary role one
// stage later than CalculationSnapshot above. Stores the full diagnostics
// list (not just a pass/fail flag) so a reviewer can see exactly what was
// found at the time the check was saved, even if the live network graph
// changes afterward.
export type CoordinationCheckRecord = {
  id: string;
  caseId: string;
  lineId: string;
  createdAt: string;
  actor: Persona;
  diagnostics: GraphDiagnostic[];
  errorCount: number;
  warningCount: number;
  note?: string;
};

type ZoneOverride = Partial<Zone>;
type RelayOverride = {
  zones?: { Z1?: ZoneOverride; Z2?: ZoneOverride; Z3?: ZoneOverride };
};

export type CaseWizardPreset = {
  title?: string;
  description?: string;
  primaryReason?: ChangeItemKind;
  subjectLineId?: string;
  subjectBayId?: string;
  subjectLabel?: string;
  substationIds?: string[];
};

type State = {
  // Static seed data (not persisted in localStorage; reloaded on each session)
  topology: typeof TOPOLOGY;
  corridors: typeof CORRIDORS;
  comparisonBays: typeof COMPARISON_BAYS;

  // Study management
  studies: Study[];
  activeStudyId: string | null;
  sourceSnapshots: SourceSnapshot[];
  studyScenarios: StudyScenario[];
  engineeringChangeSets: EngineeringChangeSet[];

  // Setting Case lifecycle (BUSINESS_PROCESS_BLUEPRINT.md §2, §5.1)
  settingCases: SettingCase[];
  activeSettingCaseId: string | null;
  // Transient UI request: sidebar "Primary Actions" open the case wizard on
  // the cases tab with a preselected case type. Not persisted.
  caseWizardRequest: {
    caseType: SettingCaseType;
    preset?: CaseWizardPreset;
  } | null;

  // UI state
  currentTab: Tab;
  currentPersona: Persona;
  activeCorridorId: string;
  selectedRelayId: string | null;
  rxModalOpen: boolean;
  comparisonBayId: string;
  activeNetworkCaseId: string;
  activeNetworkLineId: string | null;
  networkSelectionIssue: { lineId: string; message: string } | null;
  // Set when a POC tool tab is opened from inside a Setting Case (via
  // SettingCaseDetail's "Buka <tool>" action), so the tool can show a
  // breadcrumb back to the originating case. Not persisted — this is a
  // navigation affordance only, not a structural case/tool data link.
  openedFromCaseId: string | null;

  // Mutations from user edits (persisted)
  relayOverrides: Record<string, RelayOverride>;
  candidateDecisions: Record<string, CandidateDecision>;
  // Graph-builder approval decisions. New workflow keys these by
  // case/study + relation so an engineer approves only the requested scope;
  // historical station-id keys remain readable for persisted data.
  graphBuildDecisions: Record<string, { status: "confirmed" | "rejected"; decidedAt: string }>;
  networkGraphOverrides: Record<string, NetworkGraphOverride>;
  networkUndoStack: Record<string, NetworkUndoEntry[]>;
  ctVtOverrides: Record<string, CtVtOverride>;
  auditEvents: AuditEvent[];
  sourceIntakeRecords: SourceIntakeRecord[];
  pdfTapPromotions: PdfTapPromotion[];
  calculationSnapshots: CalculationSnapshot[];
  targetedCalculationRuns: TargetedCalculationRun[];
  coordinationChecks: CoordinationCheckRecord[];
  verificationRuns: VerificationRunRecord[];
  verificationReferenceDraft: VerificationReferenceDraft | null;
  vendorImportHandoffDraft: VendorImportHandoffDraft | null;

  // Actions
  setTab: (tab: Tab) => void;
  stageReferenceForVerification: (
    draft: Omit<VerificationReferenceDraft, "stagedAt">
  ) => void;
  stageVendorImportForVerification: (
    draft: Omit<VendorImportHandoffDraft, "importedAt">
  ) => void;
  saveVerificationRun: (
    record: Omit<VerificationRunRecord, "id" | "createdAt" | "createdBy">
  ) => string;
  setPersona: (p: Persona) => void;
  setActiveCorridor: (id: string) => void;
  selectRelay: (id: string | null) => void;
  openRxModal: () => void;
  closeRxModal: () => void;
  setComparisonBay: (id: string) => void;
  setActiveNetworkCase: (id: string) => void;
  setActiveNetworkLine: (id: string | null) => void;
  // Returns a Promise so callers that need the resolved activeNetworkCaseId
  // right after selection (e.g. createStudy) can await it — the fallback
  // branch below is genuinely async (dynamic import), so firing-and-forgetting
  // it races any synchronous state read/tab-switch immediately after the call.
  selectLine: (lineId: string) => Promise<void>;
  ensureStudyForLine: (lineId: string) => Promise<string | null>;
  openToolFromCase: (caseId: string, tab: Tab) => void;
  clearOpenedFromCase: () => void;
  // Setting Case actions
  openCaseWizard: (caseType: SettingCaseType, preset?: CaseWizardPreset) => void;
  clearCaseWizardRequest: () => void;
  createSettingCase: (input: CreateSettingCaseInput) => string;
  setActiveSettingCase: (id: string | null) => void;
  updateSettingCaseDetails: (
    id: string,
    patch: Partial<
      Pick<
        SettingCase,
        | "title"
        | "description"
        | "urgency"
        | "plannedEffectiveDate"
        | "owningUnit"
        | "remoteUnit"
        | "protectedScope"
      >
    >
  ) => void;
  freezeSettingCaseBaseline: (id: string) => BuildCaseBaselineResult;
  saveSettingCaseProposedRevision: (
    id: string,
    draft: ProposedDataRevisionDraft
  ) => string | null;
  saveSettingCaseImpactAssessment: (
    id: string,
    input: CaseImpactAssessmentInput
  ) => string | null;
  saveSettingCaseStudyPackageBinding: (
    id: string,
    scenarioIds: string[]
  ) => string | null;
  advanceSettingCaseStage: (id: string, note?: string) => void;
  setSettingCaseStage: (id: string, stage: SettingCaseStatus, note?: string) => void;
  linkToSettingCase: (
    id: string,
    link:
      | { kind: "source"; refId: string }
      | { kind: "calculation"; refId: string }
      | { kind: "coordination"; refId: string }
      | { kind: "changeSet"; refId: string }
      | { kind: "study"; refId: string }
  ) => void;
  unlinkFromSettingCase: (
    id: string,
    link: { kind: "source" | "calculation" | "coordination" | "changeSet"; refId: string }
  ) => void;
  createStudy: (
    name: string,
    description: string,
    substationIds: string[],
    options?: CreateStudyOptions
  ) => Promise<void>;
  deleteStudy: (id: string) => void;
  setActiveStudy: (id: string | null) => void;
  reviseStudyScope: (id: string, substationIds: string[], reason: string) => void;
  setStudyScenario: (studyId: string, scenarioId: string | null) => void;
  updateZone: (relayId: string, zoneId: "Z1" | "Z2" | "Z3", patch: ZoneOverride) => void;
  resetRelay: (relayId: string) => void;
  resetAll: () => void;
  decideCandidate: (
    candidateId: string,
    status: LifecycleStatus,
    note?: string,
    overrideLineId?: string
  ) => void;
  clearCandidateDecision: (candidateId: string) => void;
  getCandidateStatus: (candidateId: string, defaultStatus: LifecycleStatus) => LifecycleStatus;
  // Commits one case-scoped graph-builder card. The payload may contain a
  // single requested relation rather than every bay/relation owned by a GI.
  confirmGraphBuildGroup: (
    caseId: string,
    payload: { substation: UnifiedSubstation; supportingSubstations?: UnifiedSubstation[]; bays: Bay[]; relations: LineRelation[]; decisionKey?: string }
  ) => void;
  // Same commit as confirmGraphBuildGroup, but for every group in one state
  // update — only ever called with high-confidence groups (digsilentLineDb
  // anchor matched, not needsManualTopology) from the UI, since those are the
  // ones with nothing left for a human to disambiguate. Low-confidence groups
  // still go through confirmGraphBuildGroup one at a time.
  confirmGraphBuildGroupsBatch: (
    caseId: string,
    payloads: Array<{ substation: UnifiedSubstation; supportingSubstations?: UnifiedSubstation[]; bays: Bay[]; relations: LineRelation[] }>
  ) => void;
  rejectGraphBuildGroup: (stationId: string) => void;
  clearGraphBuildDecision: (stationId: string) => void;
  // A GI insertion project physically cuts an existing line into two new
  // segments (e.g. Grogol Baru 2023 cutting the pre-existing DKSBI-GROGOL
  // line). Commits the new substation + its busbar + two new LineRelations
  // (with their bays/terminals) in one action, and marks the old relation
  // "superseded" (not deleted — it's retired data, not wrong data) rather
  // than leaving it duplicated alongside the new segments.
  insertSubstationIntoLine: (
    caseId: string,
    payload: {
      oldRelation: LineRelation;
      newSubstation: UnifiedSubstation;
      newBusbar: Busbar;
      segments: Array<{
        relation: LineRelation;
        bays: Bay[];
        terminals: Terminal[];
      }>;
    }
  ) => void;
  addNetworkGraphSubstation: (caseId: string, sub: UnifiedSubstation) => void;
  addNetworkGraphSubstationBundle: (caseId: string, sub: UnifiedSubstation, busbar: Busbar) => void;
  addNetworkGraphBusbar: (caseId: string, busbar: Busbar) => void;
  addNetworkGraphBay: (caseId: string, bay: Bay) => void;
  addNetworkGraphTerminal: (caseId: string, terminal: Terminal) => void;
  addNetworkGraphRelation: (caseId: string, relation: LineRelation) => void;
  addNetworkGraphRelationBundle: (
    caseId: string,
    payload: {
      busbars?: Busbar[];
      bays: Bay[];
      terminals: Terminal[];
      relation: LineRelation;
      substations?: UnifiedSubstation[];
    }
  ) => void;
  addNetworkGraphIed: (caseId: string, ied: RelayIED) => void;
  removeNetworkGraphEntry: (caseId: string, kind: "substation" | "busbar" | "bay" | "terminal" | "relation" | "ied", id: string) => void;
  resetNetworkGraphOverrides: (caseId: string) => void;
  undoLastNetworkChange: (caseId: string) => void;
  updateCtVtOverride: (record: CtVtOverrideInput) => void;
  clearCtVtOverride: (iedId: string) => void;
  addSourceIntakeRecord: (record: Omit<SourceIntakeRecord, "id" | "stagedAt" | "actor" | "status"> & { status?: SourceIntakeRecord["status"] }) => string;
  updateSourceIntakeRecord: (id: string, patch: Partial<Omit<SourceIntakeRecord, "id" | "stagedAt">>) => void;
  removeSourceIntakeRecord: (id: string) => void;
  addPdfTapPromotion: (record: Omit<PdfTapPromotion, "id" | "promotedAt" | "actor" | "status"> & { status?: PdfTapPromotion["status"] }) => string;
  removePdfTapPromotion: (id: string) => void;
  addCalculationSnapshot: (
    record: Omit<CalculationSnapshot, "id" | "createdAt" | "actor" | "status"> & {
      status?: CalculationSnapshot["status"];
    }
  ) => string;
  removeCalculationSnapshot: (id: string) => void;
  runP545TargetedCalculation: (
    caseId: string,
    overrides: readonly P545CaseInputOverride[]
  ) => RunP545TargetedCalculationResult;
  addCoordinationCheck: (
    record: Omit<CoordinationCheckRecord, "id" | "createdAt" | "actor">
  ) => string;
  removeCoordinationCheck: (id: string) => void;
  clearAuditEvents: () => void;

  // Selectors
  getEffectiveRelay: (id: string) => Relay;
};

export const useProsetStore = create<State>()(
  persist(
    (set, get) => ({
      topology: TOPOLOGY,
      corridors: CORRIDORS,
      comparisonBays: COMPARISON_BAYS,

      studies: [],
      activeStudyId: null,
      sourceSnapshots: cloneDefaultSourceSnapshots(),
      studyScenarios: cloneDefaultStudyScenarios(),
      engineeringChangeSets: [],

      settingCases: [],
      activeSettingCaseId: null,
      caseWizardRequest: null,

      currentTab: "cases",
      currentPersona: "Engineer",
      activeCorridorId: CORRIDORS.length > 0 ? CORRIDORS[0].id : "unknown",
      selectedRelayId: TOPOLOGY.relays.length > 0 ? TOPOLOGY.relays[0].id : "unknown",
      rxModalOpen: false,
      comparisonBayId: COMPARISON_BAYS.length > 0 ? COMPARISON_BAYS[0].bay.id : "unknown",
      activeNetworkCaseId: INVENTORY_MASTER_CASE_ID,
      activeNetworkLineId: null,
      networkSelectionIssue: null,
      openedFromCaseId: null,

      relayOverrides: {},
      candidateDecisions: {},
      graphBuildDecisions: {},
      networkGraphOverrides: {},
      networkUndoStack: {},
      ctVtOverrides: {},
      auditEvents: [],
      sourceIntakeRecords: [],
      pdfTapPromotions: [],
      calculationSnapshots: [],
      targetedCalculationRuns: [],
      coordinationChecks: [],
      verificationRuns: [],
      verificationReferenceDraft: null,
      vendorImportHandoffDraft: null,

      setTab: (tab) => set({ currentTab: tab }),
      stageReferenceForVerification: (draft) => {
        const staged: VerificationReferenceDraft = {
          ...draft,
          stagedAt: new Date().toISOString(),
        };
        set({
          verificationReferenceDraft: staged,
          currentTab: "comparison",
        });
        appendAuditEvent(get, set, {
          action: "reference_verification_staged",
          scope: draft.kind,
          summary: `Staged ${draft.contextLabel} for actual verification`,
          detail: `${draft.result.ruleId} v${draft.result.ruleVersion}`,
        });
      },
      stageVendorImportForVerification: (draft) => {
        const staged: VendorImportHandoffDraft = {
          ...draft,
          caseId: get().openedFromCaseId ?? draft.caseId,
          importedAt: new Date().toISOString(),
        };
        set({
          vendorImportHandoffDraft: staged,
          currentTab: "comparison",
        });
        appendAuditEvent(get, set, {
          action: "vendor_import_staged",
          scope: draft.adapterId,
          summary: `Staged ${draft.sourceFileName} for actual verification`,
          detail: "Normalized by MVP 1C vendor import",
        });
      },
      setPersona: (p) => set({ currentPersona: p }),
      setActiveCorridor: (id) => set({ activeCorridorId: id }),
      selectRelay: (id) => set({ selectedRelayId: id }),
      openRxModal: () => set({ rxModalOpen: true }),
      closeRxModal: () => set({ rxModalOpen: false }),
      setComparisonBay: (id) => set({ comparisonBayId: id }),
      setActiveNetworkCase: (id) => set({ activeNetworkCaseId: id }),
      setActiveNetworkLine: (id) => set({ activeNetworkLineId: id }),
      openToolFromCase: (caseId, tab) =>
        set({ openedFromCaseId: caseId, currentTab: tab }),
      clearOpenedFromCase: () => set({ openedFromCaseId: null }),

      // A line is resolved only against the confirmed master graph. Legacy
      // NETWORK_CASES must never redirect a user-selected bay to the DKS-MKB
      // demo corridor. Study context follows the subject line when one exists.
      selectLine: async (lineId) => {
        const state = get();
        const { getConfirmedMasterNetwork } = await import("../domain/study-network");
        const master = getConfirmedMasterNetwork(
          state.networkGraphOverrides[INVENTORY_MASTER_CASE_ID]
        );
        const relation = master.lineRelations.find((item) => item.id === lineId);
        const line = networkLinesFromGraph(master).find((item) => item.id === lineId);
        if (!relation || !line) {
          set({
            networkSelectionIssue: {
              lineId,
              message:
                "Line belum tersedia pada confirmed master graph. Konfirmasi topology atau lengkapi source di Graph Builder.",
            },
          });
          return;
        }
        const compareBay = findComparisonBayIdForLine(lineId);
        const currentStudy = state.studies.find((study) => study.id === state.activeStudyId);
        const matchingStudy =
          currentStudy?.subjectLineId === lineId
            ? currentStudy
            : state.studies.find((study) => study.subjectLineId === lineId);
        const relayId = master.relayIeds.find(
          (ied) => ied.bayId === relation.fromBayId || ied.bayId === relation.toBayId
        )?.id ?? null;
        set({
          activeNetworkLineId: lineId,
          activeNetworkCaseId: INVENTORY_MASTER_CASE_ID,
          activeStudyId: matchingStudy?.id ?? null,
          selectedRelayId: relayId,
          networkSelectionIssue: null,
          ...(compareBay ? { comparisonBayId: compareBay } : {}),
        });
        appendAuditEvent(get, set, {
          action: "line_selected",
          scope: matchingStudy?.id ?? INVENTORY_MASTER_CASE_ID,
          targetId: lineId,
          summary: `Selected line ${line.circuit}`,
          detail: `${line.fromNodeId} -> ${line.toNodeId}`,
        });
      },

      ensureStudyForLine: async (lineId) => {
        const existing = get().studies.find((study) => study.subjectLineId === lineId);
        if (existing) {
          set({ activeStudyId: existing.id });
          await get().selectLine(lineId);
          return existing.id;
        }
        const { getConfirmedMasterNetwork, suggestedStudyScope } = await import(
          "../domain/study-network"
        );
        const state = get();
        const master = getConfirmedMasterNetwork(
          state.networkGraphOverrides[INVENTORY_MASTER_CASE_ID]
        );
        const relation = master.lineRelations.find((item) => item.id === lineId);
        if (!relation) {
          set({
            networkSelectionIssue: {
              lineId,
              message:
                "Study tidak dibuat karena LineRelation belum confirmed. Review topology di Graph Builder.",
            },
          });
          return null;
        }
        const from = master.substations.find((item) => item.id === relation.fromSubstationId);
        const to = master.substations.find((item) => item.id === relation.toSubstationId);
        const name = `Penghantar ${from?.shortCode ?? relation.fromSubstationId} - ${to?.shortCode ?? relation.toSubstationId} #${relation.circuit}`;
        await get().createStudy(
          name,
          `Study dibuat dari confirmed master graph untuk ${from?.name ?? relation.fromSubstationId} - ${to?.name ?? relation.toSubstationId}.`,
          suggestedStudyScope(master, lineId),
          {
            subjectLineId: lineId,
            subjectBayId: relation.fromBayId,
            subjectLabel: name,
          }
        );
        return get().studies.find((study) => study.subjectLineId === lineId)?.id ?? null;
      },

      openCaseWizard: (caseType, preset) =>
        set({ caseWizardRequest: { caseType, preset }, currentTab: "cases" }),

      clearCaseWizardRequest: () => set({ caseWizardRequest: null }),

      createSettingCase: (input) => {
        const now = new Date().toISOString();
        const id = `case_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const settingCase = createSettingCaseObject(input, get().currentPersona, now, id);
        set({
          settingCases: [settingCase, ...get().settingCases],
          activeSettingCaseId: id,
          caseWizardRequest: null,
        });
        appendAuditEvent(get, set, {
          action: "setting_case_created",
          scope: id,
          summary: `Created ${settingCase.caseType} case: ${settingCase.title}`,
          detail: [
            `primaryReason=${settingCase.primaryReason}`,
            `changeItems=${settingCase.changeItems.map((item) => item.kind).join(",") || "-"}`,
            settingCase.protectedScope.subjectLabel
              ? `subject=${settingCase.protectedScope.subjectLabel}`
              : "",
          ]
            .filter(Boolean)
            .join(" | "),
        });
        return id;
      },

      setActiveSettingCase: (id) => set({ activeSettingCaseId: id }),

      updateSettingCaseDetails: (id, patch) => {
        const existing = get().settingCases.find((item) => item.id === id);
        if (!existing || existing.baseline) return;
        const updatedAt = new Date().toISOString();
        set({
          settingCases: get().settingCases.map((item) =>
            item.id === id ? { ...item, ...patch, updatedAt } : item
          ),
        });
        appendAuditEvent(get, set, {
          action: "setting_case_updated",
          scope: id,
          summary: `Updated case: ${patch.title ?? existing.title}`,
          detail: Object.keys(patch).join(", "),
        });
      },

      freezeSettingCaseBaseline: (id) => {
        const state = get();
        const settingCase = state.settingCases.find((item) => item.id === id);
        if (!settingCase) {
          return { ok: false, errors: ["Setting Case tidak ditemukan."] };
        }
        if (settingCase.baseline) {
          return { ok: true, baseline: settingCase.baseline, errors: [] };
        }
        if (settingCase.stage !== "scoping") {
          return {
            ok: false,
            errors: ["Baseline hanya dapat dibekukan dari stage Scoping."],
          };
        }
        const linkedEvidence = settingCase.links.sourceIntakeIds
          .map((sourceId) =>
            state.sourceIntakeRecords.find((item) => item.id === sourceId)
          )
          .filter((item): item is SourceIntakeRecord => Boolean(item));
        const crosscheckEvidence = assessCrosscheckEvidence(
          settingCase,
          linkedEvidence
        );
        const flowErrors = validateCaseFlowProfile(settingCase.flowProfile);
        if (flowErrors.length > 0 || crosscheckEvidence.blockers.length > 0) {
          return {
            ok: false,
            errors: [...flowErrors, ...crosscheckEvidence.blockers],
          };
        }
        const issuedTapEvidence = linkedEvidence.filter(
          (item) => item.documentType === "tap_setting"
        );

        const inventoryCase =
          NETWORK_CASES.find((item) => item.id === INVENTORY_MASTER_CASE_ID) ??
          NETWORK_CASES[0];
        const masterGraph = getEffectiveNetworkGraph(
          INVENTORY_MASTER_CASE_ID,
          state.networkGraphOverrides[INVENTORY_MASTER_CASE_ID],
          buildUnifiedNetwork(inventoryCase)
        );
        const scopedNetworkCase =
          NETWORK_CASES.find(
            (item) => item.id === settingCase.protectedScope.networkCaseId
          ) ?? inventoryCase;
        const scopedGraph =
          settingCase.protectedScope.networkCaseId === INVENTORY_MASTER_CASE_ID
            ? masterGraph
            : mergeMasterRelationsIntoCase(
                getEffectiveNetworkGraph(
                  scopedNetworkCase.id,
                  state.networkGraphOverrides[scopedNetworkCase.id],
                  buildUnifiedNetwork(scopedNetworkCase)
                ),
                masterGraph
              );
        if (!scopedGraph) {
          return {
            ok: false,
            errors: [
              `Working network ${settingCase.protectedScope.networkCaseId} tidak tersedia untuk dibekukan.`,
            ],
          };
        }
        const now = new Date().toISOString();
        const subjectRelation = settingCase.protectedScope.subjectLineId
          ? scopedGraph.lineRelations.find(
              (item) => item.id === settingCase.protectedScope.subjectLineId
            )
          : undefined;
        const scopedBayIds = new Set(
          [
            settingCase.protectedScope.subjectBayId,
            subjectRelation?.fromBayId,
            subjectRelation?.toBayId,
          ].filter((item): item is string => Boolean(item))
        );
        const scopedRelayIds = new Set(
          scopedGraph.relayIeds
            .filter((item) => scopedBayIds.has(item.bayId))
            .map((item) => item.id)
        );
        const scopedProtectionFunctionIds = new Set(
          scopedGraph.protectionFunctions
            .filter((item) => scopedRelayIds.has(item.relayIedId))
            .map((item) => item.id)
        );
        const hasRegisteredIssuedSetting =
          (scopedGraph.relaySettings ?? []).some((item) =>
            scopedRelayIds.has(item.relayIedId)
          ) ||
          (scopedGraph.settingRecords ?? []).some((item) =>
            scopedProtectionFunctionIds.has(item.protectionFunctionId)
          );
        const issuedSettingRevisionId = hasRegisteredIssuedSetting
          ? `case-local-issued-settings:${id}:${now}`
          : issuedTapEvidence.length === 1
            ? `issued-evidence:${issuedTapEvidence[0].id}`
            : undefined;
        const result = buildCaseBaseline({
          settingCase,
          network: scopedGraph,
          evidence: settingCase.links.sourceIntakeIds
            .map((sourceId) =>
              state.sourceIntakeRecords.find((item) => item.id === sourceId)
            )
            .filter((item): item is SourceIntakeRecord => Boolean(item))
            .map((item) => ({
              sourceIntakeId: item.id,
              fileName: item.fileName,
              documentType: item.documentType,
              status: item.status,
              stagedAt: item.stagedAt,
              extractionMethod: item.extractionMethod,
              checksum: item.checksum,
            })),
          revisionBindings: {
            networkRevisionId: state.sourceSnapshots.find(
              (item) => item.kind === "network-model" && item.state === "current"
            )?.networkRevisionId ?? `case-local-network:${id}:${now}`,
            technicalDataRevisionId: state.sourceSnapshots.find(
              (item) => item.kind === "technical-master" && item.state === "current"
            )?.id ?? `case-local-technical:${id}:${now}`,
            issuedSettingRevisionId,
          },
          frozenAt: now,
          frozenBy: state.currentPersona,
          id: `baseline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        });
        if (!result.ok) return result;

        set({
          settingCases: state.settingCases.map((item) =>
            item.id === id
              ? {
                  ...item,
                  baseline: result.baseline,
                  stage: "baseline_frozen",
                  updatedAt: now,
                  stageHistory: [
                    ...item.stageHistory,
                    {
                      stage: "baseline_frozen",
                      at: now,
                      actor: state.currentPersona,
                      note: `Baseline ${result.baseline.fingerprint.value} dibekukan`,
                    },
                  ],
                }
              : item
          ),
        });
        appendAuditEvent(get, set, {
          action: "setting_case_baseline_frozen",
          scope: id,
          targetId: result.baseline.id,
          summary: `Frozen baseline for case "${settingCase.title}"`,
          detail: [
            `fingerprint=${result.baseline.fingerprint.value}`,
            `evidence=${result.baseline.evidence.length}`,
            `issued=${result.baseline.revisionBindings.issuedSettingRevisionId ?? "-"}`,
            `network=${result.baseline.revisionBindings.networkRevisionId ?? "-"}`,
            `technical=${result.baseline.revisionBindings.technicalDataRevisionId ?? "-"}`,
            `substations=${result.baseline.network.substations.length}`,
            `lines=${result.baseline.network.lineRelations.length}`,
            `relays=${result.baseline.network.relayIeds.length}`,
            `issues=${result.baseline.issues.length}`,
          ].join(" | "),
        });
        return result;
      },

      saveSettingCaseProposedRevision: (id, draft) => {
        const state = get();
        const settingCase = state.settingCases.find((item) => item.id === id);
        if (
          !settingCase ||
          !settingCase.baseline ||
          settingCase.stage !== "data_change_preparation"
        ) {
          return null;
        }
        const now = new Date().toISOString();
        const version = settingCase.proposedDataRevisions.length + 1;
        const revision = buildProposedDataRevision({
          settingCase,
          baseline: settingCase.baseline,
          draft,
          version,
          id: `proposal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          createdAt: now,
          createdBy: state.currentPersona,
        });
        set({
          settingCases: state.settingCases.map((item) =>
            item.id === id
              ? {
                  ...item,
                  proposedDataRevisions: [
                    ...(item.proposedDataRevisions ?? []),
                    revision,
                  ],
                  updatedAt: now,
                }
              : item
          ),
        });
        appendAuditEvent(get, set, {
          action: "setting_case_proposed_revision_saved",
          scope: id,
          targetId: revision.id,
          summary: `Saved proposed data revision v${revision.version} for "${settingCase.title}"`,
          detail: [
            `kinds=${revision.kinds.join(",")}`,
            `status=${revision.status}`,
            `changes=${revision.fieldChanges.length}`,
            `fingerprint=${revision.fingerprint.value}`,
          ].join(" | "),
        });
        return revision.id;
      },

      saveSettingCaseImpactAssessment: (id, assessmentInput) => {
        const state = get();
        const settingCase = state.settingCases.find((item) => item.id === id);
        if (
          !settingCase ||
          !settingCase.baseline ||
          settingCase.stage !== "impact_and_readiness"
        ) {
          return null;
        }
        const revisions = settingCase.proposedDataRevisions ?? [];
        const latestRevision = revisions[revisions.length - 1];
        const assessments = settingCase.impactAssessments ?? [];
        const now = new Date().toISOString();
        const assessment = buildCaseImpactAssessment({
          settingCase,
          baseline: settingCase.baseline,
          proposedRevision: latestRevision,
          assessmentInput,
          version: assessments.length + 1,
          id: `impact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          evaluatedAt: now,
          evaluatedBy: state.currentPersona,
        });
        set({
          settingCases: state.settingCases.map((item) =>
            item.id === id
              ? {
                  ...item,
                  impactAssessments: [
                    ...(item.impactAssessments ?? []),
                    assessment,
                  ],
                  updatedAt: now,
                }
              : item
          ),
        });
        appendAuditEvent(get, set, {
          action: "setting_case_impact_assessed",
          scope: id,
          targetId: assessment.id,
          summary: `Saved impact assessment v${assessment.version} for "${settingCase.title}"`,
          detail: [
            `status=${assessment.status}`,
            `endpoints=${assessment.endpoints.length}`,
            `functions=${assessment.protectionFunctions.length}`,
            `blockers=${assessment.issues.filter((item) => item.severity === "blocker").length}`,
            `study=${assessment.study.selectedDisposition}`,
            `fingerprint=${assessment.fingerprint.value}`,
          ].join(" | "),
        });
        return assessment.id;
      },

      saveSettingCaseStudyPackageBinding: (id, scenarioIds) => {
        const state = get();
        const settingCase = state.settingCases.find((item) => item.id === id);
        if (
          !settingCase ||
          !settingCase.baseline ||
          settingCase.stage !== "study_preparation"
        ) {
          return null;
        }
        const assessments = settingCase.impactAssessments ?? [];
        const latestImpact = assessments[assessments.length - 1];
        if (!latestImpact) return null;
        const revisions = settingCase.proposedDataRevisions ?? [];
        const proposedRevision =
          revisions.find((item) => item.id === latestImpact.proposedRevisionId) ??
          revisions[revisions.length - 1];
        const packageBindings = settingCase.studyPackageBindings ?? [];
        const now = new Date().toISOString();
        const binding = buildCaseStudyPackageBinding({
          settingCase,
          impactAssessment: latestImpact,
          proposedRevision,
          scenarioIds,
          scenarios: state.studyScenarios,
          snapshots: state.sourceSnapshots,
          version: packageBindings.length + 1,
          id: `study_package_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          boundAt: now,
          boundBy: state.currentPersona,
        });
        set({
          settingCases: state.settingCases.map((item) =>
            item.id === id
              ? {
                  ...item,
                  studyPackageBindings: [
                    ...(item.studyPackageBindings ?? []),
                    binding,
                  ],
                  links:
                    binding.status === "compatible"
                      ? {
                          ...item.links,
                          scenarioId: binding.scenarioBindings[0]?.scenario.id,
                          scenarioIds: binding.scenarioBindings.map(
                            (entry) => entry.scenario.id
                          ),
                        }
                      : item.links,
                  updatedAt: now,
                }
              : item
          ),
        });
        appendAuditEvent(get, set, {
          action: "setting_case_study_package_bound",
          scope: id,
          targetId: binding.id,
          summary: `Saved study package v${binding.version} for "${settingCase.title}"`,
          detail: [
            `scenarios=${binding.scenarioBindings
              .map((entry) => entry.scenario.id)
              .join(",")}`,
            `status=${binding.status}`,
            `required=${binding.requirementProfile.requiredConditions.join(",")}`,
            `missing=${binding.missingRequiredConditions.join(",") || "-"}`,
            `blockers=${binding.issues.filter((item) => item.severity === "blocker").length}`,
            `fingerprint=${binding.fingerprint.value}`,
          ].join(" | "),
        });
        return binding.id;
      },

      advanceSettingCaseStage: (id, note) => {
        const state = get();
        const settingCase = state.settingCases.find((item) => item.id === id);
        if (!settingCase || isTerminalState(settingCase.stage)) return;
        // Scoping -> Baseline Frozen is an atomic freeze transaction, not a
        // generic status change.
        if (settingCase.stage === "scoping") return;
        const latestRevision =
          settingCase.proposedDataRevisions[
            settingCase.proposedDataRevisions.length - 1
          ];
        const impactAssessments = settingCase.impactAssessments ?? [];
        const latestImpact = impactAssessments[impactAssessments.length - 1];
        const studyBindings = settingCase.studyBindings ?? [];
        const latestStudyBinding = studyBindings[studyBindings.length - 1];
        const studyPackageBindings = settingCase.studyPackageBindings ?? [];
        const latestStudyPackage =
          studyPackageBindings[studyPackageBindings.length - 1];
        const linkedEvidence = settingCase.links.sourceIntakeIds
          .map((sourceId) =>
            state.sourceIntakeRecords.find((item) => item.id === sourceId)
          )
          .filter((item): item is SourceIntakeRecord => Boolean(item));
        const crosscheckEvidence = assessCrosscheckEvidence(
          settingCase,
          linkedEvidence
        );
        const gate = stageGate(settingCase, {
          evidenceCount: settingCase.links.sourceIntakeIds.length,
          hasScenario: Boolean(settingCase.links.scenarioId),
          calculationCount: settingCase.links.calculationSnapshotIds.length,
          targetedCalculationRunCount: state.targetedCalculationRuns.filter(
            (run) => run.caseId === id
          ).length,
          coordinationCheckCount: settingCase.links.coordinationCheckIds.length,
          changeSetCount: settingCase.links.engineeringChangeSetIds.length,
          persona: state.currentPersona,
          hasBaseline: Boolean(settingCase.baseline),
          proposedRevisionReady: latestRevision?.status === "ready_for_impact",
          impactAssessmentReady:
            latestImpact?.status === "ready_for_study" ||
            latestImpact?.status === "ready_without_study",
          studyBindingReady: latestStudyBinding?.status === "compatible",
          studyPackageReady: latestStudyPackage?.status === "compatible",
          crosscheckEvidenceBlockers: crosscheckEvidence.blockers,
          crosscheckEvidenceWarnings: crosscheckEvidence.warnings,
          crosscheckIntakeReady:
            settingCase.flowProfile.crosscheckMode === "issued_tap_document_audit"
              ? state.vendorImportHandoffDraft?.caseId === id &&
                state.vendorImportHandoffDraft.adapterId === "tap-pdf-profile-v1"
              : state.vendorImportHandoffDraft?.caseId === id &&
                state.vendorImportHandoffDraft.evidenceAuthority === "actual_readback" &&
                Boolean(state.vendorImportHandoffDraft.acquisitionManifest),
          verificationRunCount: settingCase.links.verificationRunIds?.length ?? 0,
        });
        if (gate.blockers.length > 0) return;
        const next = nextStageOf(settingCase);
        if (!next || !isStageImplemented(next)) return;
        get().setSettingCaseStage(id, next, note);
      },

      setSettingCaseStage: (id, stage, note) => {
        const state = get();
        const settingCase = state.settingCases.find((item) => item.id === id);
        if (!settingCase || settingCase.stage === stage) return;
        const targetIsTerminal = isTerminalState(stage);
        const route = applicableStages(
          settingCase.caseType,
          settingCase.changeItems,
          settingCase.impactAssessments,
          settingCase.flowProfile
        );
        const resumingFromHold =
          settingCase.stage === "on_hold" &&
          !targetIsTerminal &&
          isStageImplemented(stage as SettingCaseStage) &&
          [...settingCase.stageHistory]
            .reverse()
            .find((event) => !isTerminalState(event.stage))?.stage === stage;
        const normalAdvance =
          !isTerminalState(settingCase.stage) &&
          settingCase.stage !== "scoping" &&
          !targetIsTerminal &&
          nextStageOf(settingCase) === stage &&
          isStageImplemented(stage as SettingCaseStage);
        const allowedTerminalTransition =
          !isTerminalState(settingCase.stage) &&
          (stage === "on_hold" || stage === "cancelled");

        if (
          (!targetIsTerminal && !route.includes(stage as SettingCaseStage)) ||
          (!normalAdvance && !resumingFromHold && !allowedTerminalTransition)
        ) return;
        const now = new Date().toISOString();
        const actor = state.currentPersona;
        set({
          settingCases: state.settingCases.map((item) =>
            item.id === id
              ? {
                  ...item,
                  stage,
                  updatedAt: now,
                  stageHistory: [...item.stageHistory, { stage, at: now, actor, note }],
                }
              : item
          ),
        });
        appendAuditEvent(get, set, {
          action: "setting_case_stage_changed",
          scope: id,
          summary: `Case "${settingCase.title}" → ${STAGE_LABEL[stage]}`,
          detail: note,
        });
      },

      linkToSettingCase: (id, link) => {
        const state = get();
        const settingCase = state.settingCases.find((item) => item.id === id);
        if (!settingCase) return;
        const links = { ...settingCase.links };
        if (link.kind === "source" && !links.sourceIntakeIds.includes(link.refId)) {
          links.sourceIntakeIds = [...links.sourceIntakeIds, link.refId];
        } else if (
          link.kind === "calculation" &&
          !links.calculationSnapshotIds.includes(link.refId)
        ) {
          links.calculationSnapshotIds = [...links.calculationSnapshotIds, link.refId];
        } else if (
          link.kind === "coordination" &&
          !links.coordinationCheckIds.includes(link.refId)
        ) {
          links.coordinationCheckIds = [...links.coordinationCheckIds, link.refId];
        } else if (
          link.kind === "changeSet" &&
          !links.engineeringChangeSetIds.includes(link.refId)
        ) {
          links.engineeringChangeSetIds = [...links.engineeringChangeSetIds, link.refId];
        } else if (link.kind === "study") {
          links.studyId = link.refId;
        } else {
          return;
        }
        set({
          settingCases: state.settingCases.map((item) =>
            item.id === id ? { ...item, links, updatedAt: new Date().toISOString() } : item
          ),
        });
        appendAuditEvent(get, set, {
          action: "setting_case_linked",
          scope: id,
          targetId: link.refId,
          summary: `Linked ${link.kind} to case "${settingCase.title}"`,
        });
      },

      unlinkFromSettingCase: (id, link) => {
        const state = get();
        const settingCase = state.settingCases.find((item) => item.id === id);
        if (!settingCase) return;
        if (
          link.kind === "source" &&
          (settingCase.baseline?.evidence.some(
            (item) => item.sourceIntakeId === link.refId
          ) ||
            settingCase.proposedDataRevisions.some((revision) =>
              revision.sourceEvidenceIds.includes(link.refId)
            ))
        ) {
          return;
        }
        const links = { ...settingCase.links };
        if (link.kind === "source") {
          links.sourceIntakeIds = links.sourceIntakeIds.filter((ref) => ref !== link.refId);
        } else if (link.kind === "calculation") {
          links.calculationSnapshotIds = links.calculationSnapshotIds.filter(
            (ref) => ref !== link.refId
          );
        } else if (link.kind === "coordination") {
          links.coordinationCheckIds = links.coordinationCheckIds.filter(
            (ref) => ref !== link.refId
          );
        } else {
          links.engineeringChangeSetIds = links.engineeringChangeSetIds.filter(
            (ref) => ref !== link.refId
          );
        }
        set({
          settingCases: state.settingCases.map((item) =>
            item.id === id ? { ...item, links, updatedAt: new Date().toISOString() } : item
          ),
        });
        appendAuditEvent(get, set, {
          action: "setting_case_updated",
          scope: id,
          targetId: link.refId,
          summary: `Unlinked ${link.kind} from case "${settingCase.title}"`,
        });
      },

      createStudy: async (name, description, substationIds, options) => {
        const id = `study_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newStudy: Study = {
          id,
          name,
          description,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          substationIds,
          scopeRevision: 1,
          scopeHistory: [],
          subjectBayId: options?.subjectBayId,
          subjectLineId: options?.subjectLineId,
          subjectLabel: options?.subjectLabel,
          scenarioId: options?.scenarioId,
          sourceBridge: options?.sourceBridge,
          status: "active",
        };
        set({
          studies: [...get().studies, newStudy],
          activeStudyId: id,
          activeNetworkCaseId: INVENTORY_MASTER_CASE_ID,
          ...(options?.subjectLineId ? { activeNetworkLineId: options.subjectLineId } : {}),
          currentTab: "study-dashboard",
        });
        appendAuditEvent(get, set, {
          action: "study_created",
          scope: id,
          summary: `Created study: ${name}`,
          detail: [
            `Scope: ${substationIds.join(", ")}`,
            options?.subjectLabel ? `Subject: ${options.subjectLabel}` : "",
            options?.subjectLineId ? `Line: ${options.subjectLineId}` : "",
            options?.sourceBridge ? `Bridge: ${options.sourceBridge.sourceRef}` : "",
          ].filter(Boolean).join(" | "),
        });
        if (options?.subjectLineId) {
          await get().selectLine(options.subjectLineId);
          set({ currentTab: "study-dashboard" });
        }
      },

      deleteStudy: (id) => {
        const deleted = get().studies.find((s) => s.id === id);
        const studies = get().studies.filter((s) => s.id !== id);
        const activeStudyId = get().activeStudyId === id ? (studies[0]?.id ?? null) : get().activeStudyId;
        set({ studies, activeStudyId });
        appendAuditEvent(get, set, {
          action: "study_deleted",
          scope: id,
          summary: `Deleted study${deleted ? `: ${deleted.name}` : ""}`,
        });
      },

      setActiveStudy: (id) => {
        if (get().activeStudyId === id) return;
        set({ activeStudyId: id });
        const study = id ? get().studies.find((s) => s.id === id) : undefined;
        appendAuditEvent(get, set, {
          action: "study_selected",
          scope: id ?? undefined,
          summary: study ? `Selected study: ${study.name}` : "Cleared active study",
        });
      },

      reviseStudyScope: (id, substationIds, reason) => {
        const state = get();
        const study = state.studies.find((item) => item.id === id);
        if (!study) return;
        const normalized = [...new Set(substationIds)].sort();
        const current = [...study.substationIds].sort();
        if (normalized.join("|") === current.join("|")) return;
        const changedAt = new Date().toISOString();
        const nextRevision = (study.scopeRevision ?? 1) + 1;
        set({
          studies: state.studies.map((item) =>
            item.id === id
              ? {
                  ...item,
                  substationIds: normalized,
                  scopeRevision: nextRevision,
                  scopeHistory: [
                    ...(item.scopeHistory ?? []),
                    {
                      revision: item.scopeRevision ?? 1,
                      substationIds: [...item.substationIds],
                      changedAt,
                      changedBy: state.currentPersona,
                      reason,
                    },
                  ],
                  updatedAt: changedAt,
                }
              : item
          ),
        });
        appendAuditEvent(get, set, {
          action: "study_scope_revised",
          scope: id,
          summary: `Revised study scope to revision ${nextRevision}`,
          detail: `${reason} | ${normalized.join(", ")}`,
        });
      },
      saveVerificationRun: (record) => {
        const state = get();
        const id = `verification_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const run: VerificationRunRecord = {
          ...record,
          id,
          createdAt: new Date().toISOString(),
          createdBy: state.currentPersona,
        };
        set({
          verificationRuns: [run, ...state.verificationRuns].slice(0, 200),
          settingCases: state.settingCases.map((item) =>
            item.id === record.caseId
              ? {
                  ...item,
                  updatedAt: run.createdAt,
                  links: {
                    ...item.links,
                    verificationRunIds: Array.from(
                      new Set([...(item.links.verificationRunIds ?? []), id])
                    ),
                  },
                }
              : item
          ),
        });
        appendAuditEvent(get, set, {
          action: "verification_run_saved",
          scope: record.caseId,
          targetId: id,
          summary: `Saved ${record.report.decision} verification report`,
          detail: `${record.sourceFileName} | coverage=${record.report.coveragePercent.toFixed(0)}%`,
        });
        return id;
      },

      setStudyScenario: (studyId, scenarioId) => {
        const state = get();
        const study = state.studies.find((item) => item.id === studyId);
        if (!study || study.scenarioId === (scenarioId ?? undefined)) return;
        if (scenarioId && !state.studyScenarios.some((item) => item.id === scenarioId)) return;

        const updatedAt = new Date().toISOString();
        set({
          studies: state.studies.map((item) =>
            item.id === studyId
              ? { ...item, scenarioId: scenarioId ?? undefined, updatedAt }
              : item
          ),
        });
        const scenario = state.studyScenarios.find((item) => item.id === scenarioId);
        appendAuditEvent(get, set, {
          action: "study_scenario_selected",
          scope: studyId,
          targetId: scenarioId ?? undefined,
          summary: scenario
            ? `Selected scenario for ${study.name}: ${scenario.name}`
            : `Cleared scenario for ${study.name}`,
          detail: scenario
            ? `${scenario.networkRevisionId} | ${scenario.studyMethod} | ${scenario.condition}`
            : "Fault-study lookup is blocked until another scenario is selected.",
        });
      },

      updateZone: (relayId, zoneId, patch) => {
        const ov = { ...get().relayOverrides };
        const current = ov[relayId] ?? {};
        const zones = { ...(current.zones ?? {}) };
        zones[zoneId] = { ...(zones[zoneId] ?? {}), ...patch };
        ov[relayId] = { ...current, zones };
        set({ relayOverrides: ov });
        appendAuditEvent(get, set, {
          action: "zone_updated",
          targetId: relayId,
          summary: `Updated ${zoneId} relay setting`,
          detail: Object.keys(patch).join(", "),
        });
      },

      resetRelay: (relayId) => {
        const ov = { ...get().relayOverrides };
        delete ov[relayId];
        set({ relayOverrides: ov });
        appendAuditEvent(get, set, {
          action: "relay_reset",
          targetId: relayId,
          summary: "Reset relay zone overrides",
        });
      },

      resetAll: () => {
        set({
          relayOverrides: {},
          candidateDecisions: {},
          graphBuildDecisions: {},
          verificationReferenceDraft: null,
          vendorImportHandoffDraft: null,
        });
        appendAuditEvent(get, set, {
          action: "reset_edits",
          summary: "Reset relay overrides and candidate decisions",
        });
      },

      decideCandidate: (candidateId, status, note, overrideLineId) => {
        const next = { ...get().candidateDecisions };
        next[candidateId] = {
          status,
          decidedAt: new Date().toISOString(),
          note,
          overrideLineId,
        };
        set({ candidateDecisions: next });
        appendAuditEvent(get, set, {
          action: "candidate_decision",
          targetId: candidateId,
          summary: `Set candidate ${status}`,
          detail: [note, overrideLineId ? `overrideLineId=${overrideLineId}` : ""].filter(Boolean).join(" | "),
        });
      },

      clearCandidateDecision: (candidateId) => {
        const next = { ...get().candidateDecisions };
        delete next[candidateId];
        set({ candidateDecisions: next });
        appendAuditEvent(get, set, {
          action: "candidate_reset",
          targetId: candidateId,
          summary: "Cleared candidate decision",
        });
      },

      getCandidateStatus: (candidateId, defaultStatus) => {
        return get().candidateDecisions[candidateId]?.status ?? defaultStatus;
      },

      addNetworkGraphSubstation: (caseId, sub) => {
        const current = get();
        const next = { ...current.networkGraphOverrides };
        const existing = normalizedOverride(next[caseId]);
        next[caseId] = {
          ...existing,
          substations: [...existing.substations, sub],
        };
        set({
          networkGraphOverrides: next,
          networkUndoStack: pushNetworkUndo(current, caseId, `Added substation ${sub.shortCode}`),
        });
        appendAuditEvent(get, set, {
          action: "network_graph_add",
          scope: caseId,
          targetId: sub.id,
          summary: "Added substation",
          detail: `${sub.shortCode} ${sub.name}`,
        });
      },

      addNetworkGraphSubstationBundle: (caseId, sub, busbar) => {
        const current = get();
        const next = { ...current.networkGraphOverrides };
        const existing = normalizedOverride(next[caseId]);
        next[caseId] = {
          ...existing,
          substations: [...existing.substations, sub],
          busbars: upsertById(existing.busbars, [busbar]),
        };
        set({
          networkGraphOverrides: next,
          networkUndoStack: pushNetworkUndo(current, caseId, `Added substation ${sub.shortCode}`),
        });
        appendAuditEvent(get, set, {
          action: "network_graph_add",
          scope: caseId,
          targetId: sub.id,
          summary: "Added substation with busbar",
          detail: `${sub.shortCode} ${sub.name} | ${busbar.label}`,
        });
      },

      addNetworkGraphBusbar: (caseId, busbar) => {
        const current = get();
        const next = { ...current.networkGraphOverrides };
        const existing = normalizedOverride(next[caseId]);
        next[caseId] = {
          ...existing,
          busbars: [...existing.busbars, busbar],
        };
        set({
          networkGraphOverrides: next,
          networkUndoStack: pushNetworkUndo(current, caseId, `Added busbar ${busbar.id}`),
        });
        appendAuditEvent(get, set, {
          action: "network_graph_add",
          scope: caseId,
          targetId: busbar.id,
          summary: "Added busbar",
          detail: `${busbar.substationId} ${busbar.label}`,
        });
      },

      addNetworkGraphBay: (caseId, bay) => {
        const current = get();
        const next = { ...current.networkGraphOverrides };
        const existing = normalizedOverride(next[caseId]);
        next[caseId] = {
          ...existing,
          bays: [...existing.bays, bay],
        };
        set({
          networkGraphOverrides: next,
          networkUndoStack: pushNetworkUndo(current, caseId, `Added bay ${bay.rawName}`),
        });
        appendAuditEvent(get, set, {
          action: "network_graph_add",
          scope: caseId,
          targetId: bay.id,
          summary: "Added bay",
          detail: `${bay.substationId} ${bay.rawName}`,
        });
      },

      addNetworkGraphTerminal: (caseId, terminal) => {
        const current = get();
        const next = { ...current.networkGraphOverrides };
        const existing = normalizedOverride(next[caseId]);
        next[caseId] = {
          ...existing,
          terminals: [...existing.terminals, terminal],
        };
        set({
          networkGraphOverrides: next,
          networkUndoStack: pushNetworkUndo(current, caseId, `Added terminal ${terminal.id}`),
        });
        appendAuditEvent(get, set, {
          action: "network_graph_add",
          scope: caseId,
          targetId: terminal.id,
          summary: "Added terminal",
          detail: `${terminal.bayId} -> ${terminal.busbarId}`,
        });
      },

      addNetworkGraphRelation: (caseId, relation) => {
        const current = get();
        const next = { ...current.networkGraphOverrides };
        const existing = normalizedOverride(next[caseId]);
        next[caseId] = {
          ...existing,
          relations: [...existing.relations, relation],
        };
        set({
          networkGraphOverrides: next,
          networkUndoStack: pushNetworkUndo(current, caseId, `Added relation #${relation.circuit}`),
        });
        appendAuditEvent(get, set, {
          action: "network_graph_add",
          scope: caseId,
          targetId: relation.id,
          summary: "Added line relation",
          detail: `${relation.fromSubstationId} -> ${relation.toSubstationId} #${relation.circuit}`,
        });
      },

      addNetworkGraphRelationBundle: (caseId, payload) => {
        const current = get();
        const next = { ...current.networkGraphOverrides };
        const existing = normalizedOverride(next[caseId]);
        next[caseId] = {
          ...existing,
          substations: upsertById(existing.substations, payload.substations ?? []),
          busbars: upsertById(existing.busbars, payload.busbars ?? []),
          bays: upsertById(existing.bays, payload.bays),
          terminals: upsertById(existing.terminals, payload.terminals),
          relations: upsertById(existing.relations, [payload.relation]),
        };
        set({
          networkGraphOverrides: next,
          networkUndoStack: pushNetworkUndo(
            current,
            caseId,
            `Added relation ${payload.relation.fromSubstationId} -> ${payload.relation.toSubstationId} #${payload.relation.circuit}`
          ),
          activeNetworkLineId: payload.relation.id,
        });
        appendAuditEvent(get, set, {
          action: "network_graph_add",
          scope: caseId,
          targetId: payload.relation.id,
          summary: "Added line relation bundle",
          detail: `${payload.relation.fromSubstationId} -> ${payload.relation.toSubstationId} #${payload.relation.circuit}`,
        });
      },

      confirmGraphBuildGroup: (caseId, payload) => {
        const current = get();
        const next = { ...current.networkGraphOverrides };
        const existing = normalizedOverride(next[caseId]);
        next[caseId] = {
          ...existing,
          substations: upsertById(existing.substations, [payload.substation, ...(payload.supportingSubstations ?? [])]),
          bays: upsertById(existing.bays, payload.bays),
          relations: upsertById(existing.relations, payload.relations),
        };
        const firstRelation = payload.relations[0];
        set({
          networkGraphOverrides: next,
          networkUndoStack: pushNetworkUndo(
            current,
            caseId,
            `Confirmed graph-builder group for ${payload.substation.name}`
          ),
          graphBuildDecisions: {
            ...current.graphBuildDecisions,
            [payload.decisionKey ?? payload.substation.id]: { status: "confirmed", decidedAt: new Date().toISOString() },
          },
          // Previously nothing set the working context on confirm — a user
          // confirming GI X had no way to land on GI X afterward, since
          // activeNetworkCaseId/activeNetworkLineId were left at whatever
          // they were before (often the stale demo case). Single-GI confirm
          // only: batch-confirming many GIs at once has no single correct
          // "GI to select afterward."
          ...(firstRelation
            ? { activeNetworkCaseId: caseId, activeNetworkLineId: firstRelation.id }
            : {}),
        });
        appendAuditEvent(get, set, {
          action: "network_graph_add",
          scope: caseId,
          targetId: payload.decisionKey ?? payload.substation.id,
          summary: "Approved case-scoped topology card",
          detail: `${payload.substation.name}: ${payload.bays.length} bay(s), ${payload.relations.length} relation(s)`,
        });
      },

      confirmGraphBuildGroupsBatch: (caseId, payloads) => {
        if (payloads.length === 0) return;
        const current = get();
        const next = { ...current.networkGraphOverrides };
        let existing = normalizedOverride(next[caseId]);
        const decidedAt = new Date().toISOString();
        const decisions = { ...current.graphBuildDecisions };
        for (const payload of payloads) {
          existing = {
            ...existing,
            substations: upsertById(existing.substations, [payload.substation, ...(payload.supportingSubstations ?? [])]),
            bays: upsertById(existing.bays, payload.bays),
            relations: upsertById(existing.relations, payload.relations),
          };
          decisions[payload.substation.id] = { status: "confirmed", decidedAt };
        }
        next[caseId] = existing;
        set({
          networkGraphOverrides: next,
          networkUndoStack: pushNetworkUndo(
            current,
            caseId,
            `Confirmed ${payloads.length} graph-builder group(s) (batch, high-confidence)`
          ),
          graphBuildDecisions: decisions,
        });
        appendAuditEvent(get, set, {
          action: "network_graph_add",
          scope: caseId,
          targetId: payloads.map((p) => p.substation.id).join(","),
          summary: `Confirmed ${payloads.length} graph-builder GI group(s) in batch`,
          detail: payloads.map((p) => p.substation.name).join(", "),
        });
      },

      rejectGraphBuildGroup: (stationId) => {
        set((state) => ({
          graphBuildDecisions: {
            ...state.graphBuildDecisions,
            [stationId]: { status: "rejected", decidedAt: new Date().toISOString() },
          },
        }));
        appendAuditEvent(get, set, {
          action: "candidate_decision",
          scope: stationId,
          targetId: stationId,
          summary: "Rejected graph-builder GI group",
        });
      },

      clearGraphBuildDecision: (stationId) => {
        set((state) => {
          const next = { ...state.graphBuildDecisions };
          delete next[stationId];
          return { graphBuildDecisions: next };
        });
      },

      insertSubstationIntoLine: (caseId, payload) => {
        const current = get();
        const networkCase =
          NETWORK_CASES.find((item) => item.id === caseId) ?? NETWORK_CASES[0];
        const beforeNetwork = getEffectiveNetworkGraph(
          caseId,
          current.networkGraphOverrides[caseId],
          buildUnifiedNetwork(networkCase)
        );
        const next = { ...current.networkGraphOverrides };
        const existing = normalizedOverride(next[caseId]);
        const supersededRelation: LineRelation = { ...payload.oldRelation, status: "superseded" };
        const allBays = payload.segments.flatMap((s) => s.bays);
        const allTerminals = payload.segments.flatMap((s) => s.terminals);
        const allRelations = payload.segments.map((s) => s.relation);
        next[caseId] = {
          ...existing,
          substations: upsertById(existing.substations, [payload.newSubstation]),
          busbars: upsertById(existing.busbars, [payload.newBusbar]),
          bays: upsertById(existing.bays, allBays),
          terminals: upsertById(existing.terminals, allTerminals),
          relations: upsertById(existing.relations, [supersededRelation, ...allRelations]),
        };
        const afterNetwork = getEffectiveNetworkGraph(
          caseId,
          next[caseId],
          buildUnifiedNetwork(networkCase)
        );
        if (!beforeNetwork || !afterNetwork) return;

        const activeStudy = current.studies.find(
          (study) => study.id === current.activeStudyId
        );
        const scenario = current.studyScenarios.find(
          (item) => item.id === activeStudy?.scenarioId
        );
        const networkSnapshot = current.sourceSnapshots.find(
          (item) => item.id === scenario?.networkSnapshotId
        );
        const baselineWarnings: string[] = [];
        if (!scenario) {
          baselineWarnings.push(
            "No Study Scenario was selected when this change was recorded."
          );
        }
        if (networkSnapshot?.state === "historical") {
          baselineWarnings.push(
            "Baseline network snapshot is historical and is not current network truth."
          );
        }
        const baseline: EngineeringChangeBaseline = {
          studyId: activeStudy?.id,
          scenarioId: scenario?.id,
          networkSnapshotId: scenario?.networkSnapshotId,
          faultSnapshotId: scenario?.faultSnapshotId,
          networkRevisionId:
            scenario?.networkRevisionId ?? `working-network:${caseId}:unversioned`,
          warnings: baselineWarnings,
        };
        const createdAt = new Date().toISOString();
        const changeSet = buildInsertionChangeSet({
          id: `ecs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          caseId,
          createdAt,
          actor: current.currentPersona,
          baseline,
          beforeNetwork,
          afterNetwork,
          oldRelationId: payload.oldRelation.id,
          newSubstationId: payload.newSubstation.id,
          newRelationIds: allRelations.map((relation) => relation.id),
        });
        set({
          networkGraphOverrides: next,
          engineeringChangeSets: [changeSet, ...current.engineeringChangeSets],
          networkUndoStack: pushNetworkUndo(
            current,
            caseId,
            `Inserted ${payload.newSubstation.name} into line ${payload.oldRelation.id}`
          ),
        });
        appendAuditEvent(get, set, {
          action: "network_graph_add",
          scope: caseId,
          targetId: payload.newSubstation.id,
          summary: "Inserted substation into existing line",
          detail: `${payload.newSubstation.name} split ${payload.oldRelation.id} into ${allRelations.map((relation) => relation.id).join(", ")}`,
        });
        appendAuditEvent(get, set, {
          action: "engineering_change_set_created",
          scope: caseId,
          targetId: changeSet.id,
          summary: `Recorded change set: ${changeSet.title}`,
          detail: `${changeSet.fingerprint.algorithm}:${changeSet.fingerprint.value} | ${changeSet.operations.length} operation(s) | validation=${changeSet.validation.valid ? "valid" : "invalid"}`,
        });
      },

      addNetworkGraphIed: (caseId, ied) => {
        const current = get();
        const next = { ...current.networkGraphOverrides };
        const existing = normalizedOverride(next[caseId]);
        next[caseId] = {
          ...existing,
          ieds: [...existing.ieds, ied],
        };
        set({
          networkGraphOverrides: next,
          networkUndoStack: pushNetworkUndo(current, caseId, `Added IED ${ied.make} ${ied.model}`),
        });
        appendAuditEvent(get, set, {
          action: "network_graph_add",
          scope: caseId,
          targetId: ied.id,
          summary: "Added relay IED",
          detail: `${ied.make} ${ied.model} | bay ${ied.bayId}`,
        });
      },

      removeNetworkGraphEntry: (caseId, kind, id) => {
        const current = get();
        const next = { ...current.networkGraphOverrides };
        const existing = next[caseId];
        if (!existing) return;
        const {
          override: updated,
          removedIedIds,
          removedRelationIds,
        } = removeNetworkGraphEntryCascade(normalizedOverride(existing), kind, id);
        const nextCtVtOverrides = { ...current.ctVtOverrides };
        for (const iedId of removedIedIds) delete nextCtVtOverrides[iedId];
        next[caseId] = updated;
        set({
          networkGraphOverrides: next,
          ctVtOverrides: nextCtVtOverrides,
          networkUndoStack: pushNetworkUndo(current, caseId, `Removed ${kind} ${id}`),
          ...(current.activeNetworkLineId && removedRelationIds.includes(current.activeNetworkLineId)
            ? { activeNetworkLineId: null }
            : {}),
        });
        appendAuditEvent(get, set, {
          action: "network_graph_remove",
          scope: caseId,
          targetId: id,
          summary: `Removed ${kind}`,
          detail: removedIedIds.length > 0 ? `Cascade removed ${removedIedIds.length} linked IED(s)` : undefined,
        });
      },

      resetNetworkGraphOverrides: (caseId) => {
        const current = get();
        const next = { ...current.networkGraphOverrides };
        delete next[caseId];
        set({
          networkGraphOverrides: next,
          networkUndoStack: pushNetworkUndo(current, caseId, "Reset network overrides"),
        });
        appendAuditEvent(get, set, {
          action: "network_graph_reset",
          scope: caseId,
          summary: "Reset network graph overrides",
        });
      },

      undoLastNetworkChange: (caseId) => {
        const current = get();
        const stack = current.networkUndoStack[caseId] ?? [];
        const [entry, ...rest] = stack;
        if (!entry) return;
        const nextOverrides = { ...current.networkGraphOverrides };
        if (entry.overrideBefore) {
          nextOverrides[caseId] = cloneNetworkGraphOverride(entry.overrideBefore);
        } else {
          delete nextOverrides[caseId];
        }
        set({
          networkGraphOverrides: nextOverrides,
          networkUndoStack: {
            ...current.networkUndoStack,
            [caseId]: rest,
          },
        });
        appendAuditEvent(get, set, {
          action: "network_graph_reset",
          scope: caseId,
          targetId: entry.id,
          summary: `Undo network change: ${entry.summary}`,
        });
      },

      updateCtVtOverride: (record) => {
        const current = get();
        const existing = current.ctVtOverrides[record.iedId];
        const nextRecord: CtVtOverride = {
          iedId: record.iedId,
          bayId: record.bayId ?? existing?.bayId,
          ct: record.ct === null ? undefined : record.ct ?? existing?.ct,
          vt: record.vt === null ? undefined : record.vt ?? existing?.vt,
          sourceRef: record.sourceRef ?? existing?.sourceRef,
          status: record.status ?? existing?.status ?? "reviewed",
          updatedAt: new Date().toISOString(),
          actor: current.currentPersona,
        };
        set({
          ctVtOverrides: {
            ...current.ctVtOverrides,
            [record.iedId]: nextRecord,
          },
        });
        appendAuditEvent(get, set, {
          action: "ct_vt_update",
          targetId: record.iedId,
          scope: record.bayId,
          summary: "Updated CT/VT master data",
          detail: [
            nextRecord.ct ? `CT ${nextRecord.ct.ratioText}` : "",
            nextRecord.vt ? `VT ${nextRecord.vt.ratioText}` : "",
            nextRecord.sourceRef ? `source=${nextRecord.sourceRef}` : "",
          ].filter(Boolean).join(" | "),
        });
      },

      clearCtVtOverride: (iedId) => {
        const next = { ...get().ctVtOverrides };
        const existing = next[iedId];
        delete next[iedId];
        set({ ctVtOverrides: next });
        appendAuditEvent(get, set, {
          action: "ct_vt_clear",
          targetId: iedId,
          scope: existing?.bayId,
          summary: "Cleared CT/VT override",
        });
      },

      addSourceIntakeRecord: (record) => {
        const current = get();
        const id = `source_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const nextRecord: SourceIntakeRecord = {
          ...record,
          id,
          stagedAt: new Date().toISOString(),
          actor: current.currentPersona,
          status: record.status ?? "staged",
        };
        set({ sourceIntakeRecords: [nextRecord, ...current.sourceIntakeRecords].slice(0, 200) });
        appendAuditEvent(get, set, {
          action: "source_intake_add",
          scope: record.caseId,
          targetId: id,
          summary: "Staged source document",
          detail: `${record.documentType}: ${record.fileName}`,
        });
        return id;
      },

      updateSourceIntakeRecord: (id, patch) => {
        set({
          sourceIntakeRecords: get().sourceIntakeRecords.map((item) =>
            item.id === id ? { ...item, ...patch } : item
          ),
        });
      },

      removeSourceIntakeRecord: (id) => {
        const current = get();
        const isGovernedEvidence = current.settingCases.some(
          (settingCase) =>
            settingCase.baseline?.evidence.some(
              (item) => item.sourceIntakeId === id
            ) ||
            settingCase.proposedDataRevisions.some((revision) =>
              revision.sourceEvidenceIds.includes(id)
            )
        );
        if (isGovernedEvidence) return;
        const record = current.sourceIntakeRecords.find((item) => item.id === id);
        set({ sourceIntakeRecords: current.sourceIntakeRecords.filter((item) => item.id !== id) });
        appendAuditEvent(get, set, {
          action: "source_intake_remove",
          scope: record?.caseId,
          targetId: id,
          summary: "Removed staged source document",
          detail: record?.fileName,
        });
      },

      addPdfTapPromotion: (record) => {
        const current = get();
        const id = `pdftap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const promotion: PdfTapPromotion = {
          ...record,
          id,
          promotedAt: new Date().toISOString(),
          actor: current.currentPersona,
          status: record.status ?? "imported",
        };
        set({ pdfTapPromotions: [promotion, ...current.pdfTapPromotions].slice(0, 200) });
        appendAuditEvent(get, set, {
          action: "pdf_tap_promote",
          scope: record.caseId,
          targetId: record.lineId,
          summary: `Promoted TAP PDF to line ${record.lineId}`,
          detail: `${record.fileName} | ${record.fields.length} fields`,
        });
        return id;
      },

      removePdfTapPromotion: (id) => {
        const promotion = get().pdfTapPromotions.find((item) => item.id === id);
        set({ pdfTapPromotions: get().pdfTapPromotions.filter((item) => item.id !== id) });
        appendAuditEvent(get, set, {
          action: "pdf_tap_unpromote",
          scope: promotion?.caseId,
          targetId: promotion?.lineId,
          summary: "Removed PDF TAP promotion",
          detail: promotion?.fileName,
        });
      },

      addCalculationSnapshot: (record) => {
        const current = get();
        const id = `calc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const snapshot: CalculationSnapshot = {
          ...record,
          id,
          createdAt: new Date().toISOString(),
          actor: current.currentPersona,
          status: record.status ?? "reviewed",
        };
        set({ calculationSnapshots: [snapshot, ...current.calculationSnapshots].slice(0, 200) });
        appendAuditEvent(get, set, {
          action: "calculation_snapshot_add",
          scope: record.caseId,
          targetId: record.lineId,
          summary: `Saved calculation snapshot: ${record.templateName}`,
          detail: `${record.sourceRef} | ${record.functionIds.join(", ")} | ${record.warnings.length} warning(s)`,
        });
        return id;
      },

      removeCalculationSnapshot: (id) => {
        const snapshot = get().calculationSnapshots.find((item) => item.id === id);
        set({ calculationSnapshots: get().calculationSnapshots.filter((item) => item.id !== id) });
        appendAuditEvent(get, set, {
          action: "calculation_snapshot_remove",
          scope: snapshot?.caseId,
          targetId: snapshot?.lineId,
          summary: "Removed calculation snapshot",
          detail: snapshot?.templateName,
        });
      },

      runP545TargetedCalculation: (caseId, overrides) => {
        const current = get();
        const settingCase = current.settingCases.find((item) => item.id === caseId);
        if (!settingCase) {
          return { ok: false, errors: ["Setting Case tidak ditemukan."] };
        }
        if (settingCase.stage !== "calculation") {
          return {
            ok: false,
            errors: [
              `Targeted Calculation Run hanya dapat dibuat pada stage Calculation; stage saat ini ${settingCase.stage}.`,
            ],
          };
        }
        const now = new Date().toISOString();
        const result = executeP545CaseCalculation({
          settingCase,
          overrides,
          runId: `target_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          executedAt: now,
          executedBy: current.currentPersona,
        });
        if (!result.ok) return result;

        set({
          targetedCalculationRuns: [
            result.run,
            ...current.targetedCalculationRuns,
          ],
          settingCases: current.settingCases.map((item) =>
            item.id === caseId
              ? {
                  ...item,
                  updatedAt: now,
                  links: {
                    ...item.links,
                    calculationSnapshotIds: item.links.calculationSnapshotIds.includes(
                      result.run.id
                    )
                      ? item.links.calculationSnapshotIds
                      : [...item.links.calculationSnapshotIds, result.run.id],
                  },
                }
              : item
          ),
        });
        appendAuditEvent(get, set, {
          action: "targeted_calculation_run_created",
          scope: caseId,
          targetId: result.run.id,
          summary: `Created immutable P545 Targeted Calculation Run for "${settingCase.title}"`,
          detail: [
            `fingerprint=${result.run.fingerprint.value}`,
            `baseline=${result.run.baselineId}:${result.run.baselineFingerprint}`,
            `proposal=${result.run.proposedRevisionId ?? "-"}`,
            `blocks=${result.run.executedBlocks.join(",")}`,
            `outputs=${result.run.outputs.length}`,
          ].join(" | "),
        });
        return result;
      },

      addCoordinationCheck: (record) => {
        const current = get();
        const id = `coord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const check: CoordinationCheckRecord = {
          ...record,
          id,
          createdAt: new Date().toISOString(),
          actor: current.currentPersona,
        };
        set({ coordinationChecks: [check, ...current.coordinationChecks].slice(0, 200) });
        appendAuditEvent(get, set, {
          action: "coordination_check_add",
          scope: record.caseId,
          targetId: record.lineId,
          summary: `Saved coordination check: ${record.errorCount} error(s), ${record.warningCount} warning(s)`,
          detail: record.note,
        });
        return id;
      },

      removeCoordinationCheck: (id) => {
        const check = get().coordinationChecks.find((item) => item.id === id);
        set({ coordinationChecks: get().coordinationChecks.filter((item) => item.id !== id) });
        appendAuditEvent(get, set, {
          action: "coordination_check_remove",
          scope: check?.caseId,
          targetId: check?.lineId,
          summary: "Removed coordination check",
        });
      },

      clearAuditEvents: () => set({ auditEvents: [] }),

      getEffectiveRelay: (id) => {
        const base = get().topology.relays.find((r) => r.id === id) || get().topology.relays[0];
        if (!base) {
          // Fallback if no relays exist at all
          return {
            id: "unknown",
            substation_id: "unknown",
            segment_id: "unknown",
            direction: "forward",
            make: "Unknown",
            model: "Unknown",
            bay_name: "Unknown",
            zones: [
              { id: "Z1", X_reach_ohm: 1, R_reach_ohm: 1, RFPP_ohm_per_loop: 1, RFPE_ohm_per_loop: 1, time_delay_pp_s: 0, time_delay_pe_s: 0, operate_pp: true, operate_pe: true },
              { id: "Z2", X_reach_ohm: 2, R_reach_ohm: 2, RFPP_ohm_per_loop: 2, RFPE_ohm_per_loop: 2, time_delay_pp_s: 0.4, time_delay_pe_s: 0.4, operate_pp: true, operate_pe: true },
              { id: "Z3", X_reach_ohm: 3, R_reach_ohm: 3, RFPP_ohm_per_loop: 3, RFPE_ohm_per_loop: 3, time_delay_pp_s: 1.2, time_delay_pe_s: 1.2, operate_pp: true, operate_pe: true }
            ],
            characteristic_angle_deg: 80,
            load_encroachment: { enabled: true, RLdFw_ohm_per_phase: 30, RLdRv_ohm_per_phase: 30, ArgLd_deg: 35 }
          };
        }
        const ov = get().relayOverrides[base.id];
        if (!ov?.zones) return base;
        const merged: Relay = {
          ...base,
          zones: base.zones.map((z) => {
            const patch = ov.zones?.[z.id];
            return patch ? { ...z, ...patch } : z;
          }) as [Zone, Zone, Zone],
        };
        return merged;
      },
    }),
    {
      name: PROTECTION_LIFECYCLE_SNAPSHOT_NAME,
      storage: createJSONStorage(() => createSnapshotStateStorage()),
      partialize: selectProtectionLifecycleSnapshot,
      migrate: (persisted: any, version: number) => {
        if (!persisted) return persisted;
        if (persisted.currentTab === "network") {
          persisted.currentTab = "network-model";
        }
        // v2 -> v3: default tab moved from network-model to inbox; only flip
        // if user has never deliberately changed it (i.e. still on default).
        if (version < 3 && persisted.currentTab === "network-model") {
          persisted.currentTab = "inbox";
        }
        if (version < 4) {
          persisted.auditEvents = persisted.auditEvents ?? [];
        }
        if (version < 5) {
          persisted.sourceIntakeRecords = persisted.sourceIntakeRecords ?? [];
        }
        if (version < 6) {
          persisted.currentTab = "study-dashboard";
        }
        // v6 -> v7: add studies + migrate tab names
        if (version < 7) {
          persisted.studies = persisted.studies ?? LEGACY_MIGRATION_STUDIES;
          persisted.activeStudyId = persisted.activeStudyId ?? LEGACY_MIGRATION_STUDIES[0]?.id ?? null;
          if (persisted.currentTab === "study-dashboard") {
            persisted.currentTab = "home";
          }
        }
        if (version < 8) {
          persisted.ctVtOverrides = persisted.ctVtOverrides ?? {};
        }
        if (version < 9) {
          persisted.calculationSnapshots = persisted.calculationSnapshots ?? [];
        }
        if (version < 10) {
          persisted.networkUndoStack = persisted.networkUndoStack ?? {};
        }
        // v10 -> v11: mini-NMM naming renamed to "network graph" throughout
        // (PLMS's own topology model, unrelated to the external NMM project
        // it was named after — that project is no longer a PLMS dependency).
        // Carry forward any already-persisted override data under the old
        // key/tab id so existing users don't silently lose it.
        if (version < 11) {
          if (persisted.currentTab === "mini-nmm-editor") {
            persisted.currentTab = "network-graph-editor";
          }
          if (persisted.miniNmmOverrides && !persisted.networkGraphOverrides) {
            persisted.networkGraphOverrides = persisted.miniNmmOverrides;
          }
          delete persisted.miniNmmOverrides;
          persisted.graphBuildDecisions = persisted.graphBuildDecisions ?? {};
        }
        // v11 -> v12: the single 4-GI "Koridor DKS-DM-PIK-MKB" Study (wrong
        // scope — one Study covering 4 GI as co-equal subjects instead of
        // one subject line per Study) replaced by two per-line Studies
        // seeded from graph-builder's DIgSILENT-anchored ids. Only swap the
        // seed if the user still has exactly the untouched old default (one
        // Study, that exact id) — never touch a user's real Studies.
        if (version < 12) {
          if (
            Array.isArray(persisted.studies) &&
            persisted.studies.length === 1 &&
            persisted.studies[0]?.id === "study_dks_dm_pik_mkb"
          ) {
            persisted.studies = LEGACY_MIGRATION_STUDIES;
            persisted.activeStudyId = LEGACY_MIGRATION_STUDIES[0].id;
          }
        }
        // v12 -> v13: MVP 1A is now centred on the workbook-backed
        // reference-setting workflow. Existing screens remain available,
        // but the new workflow is the deliberate landing page.
        if (version < 13) {
          persisted.currentTab = "reference-setting";
        }
        if (version < 14) {
          persisted.verificationReferenceDraft = null;
        }
        if (version < 15) {
          persisted.vendorImportHandoffDraft = null;
        }
        // v15 -> v16: introduce versioned engineering source snapshots and
        // Study Scenarios. Existing user-created Studies are preserved and
        // intentionally remain without a scenario until the engineer selects
        // one; only the known untouched default studies receive the historical
        // IHS scenario automatically.
        if (version < 16) {
          persisted.sourceSnapshots =
            Array.isArray(persisted.sourceSnapshots) && persisted.sourceSnapshots.length > 0
              ? persisted.sourceSnapshots
              : cloneDefaultSourceSnapshots();
          persisted.studyScenarios =
            Array.isArray(persisted.studyScenarios) && persisted.studyScenarios.length > 0
              ? persisted.studyScenarios
              : cloneDefaultStudyScenarios();
          if (Array.isArray(persisted.studies)) {
            persisted.studies = persisted.studies.map((study: Study) =>
              LEGACY_MIGRATION_STUDIES.some(
                (seed) =>
                  seed.id === study.id &&
                  seed.subjectLineId === study.subjectLineId &&
                  seed.name === study.name
              )
                ? { ...study, scenarioId: study.scenarioId ?? LEGACY_STUDY_SCENARIO_ID }
                : study
            );
          }
        }
        if (version < 17) {
          persisted.engineeringChangeSets = Array.isArray(
            persisted.engineeringChangeSets
          )
            ? persisted.engineeringChangeSets
            : [];
        }
        if (version < 24) {
          persisted.verificationRuns = Array.isArray(persisted.verificationRuns)
            ? persisted.verificationRuns
            : [];
          if (Array.isArray(persisted.settingCases)) {
            persisted.settingCases = persisted.settingCases.map((settingCase: SettingCase) => ({
              ...settingCase,
              links: {
                ...settingCase.links,
                verificationRunIds: Array.isArray(settingCase.links?.verificationRunIds)
                  ? settingCase.links.verificationRunIds
                  : [],
              },
            }));
          }
        }
        if (version < 25) {
          const legacyStudyIds = new Set([
            "study_dks_dm_pik_mkb",
            "study_dksbi_dnmgt",
            "study_dnmgt_pinka",
          ]);
          persisted.studies = Array.isArray(persisted.studies)
            ? persisted.studies.filter(
                (study: Study) =>
                  !legacyStudyIds.has(study.id) &&
                  !(
                    !study.subjectLineId &&
                    /dks\s*-?\s*dm\s*-?\s*pik\s*-?\s*mkb/i.test(study.name ?? "")
                  )
              )
            : [];
          if (
            !persisted.studies.some(
              (study: Study) => study.id === persisted.activeStudyId
            )
          ) {
            persisted.activeStudyId = null;
          }
          persisted.activeNetworkCaseId = INVENTORY_MASTER_CASE_ID;
          if (persisted.activeNetworkLineId === "unknown") {
            persisted.activeNetworkLineId = null;
          }
        }
        // v17 -> v18: append newly indexed immutable source snapshots without
        // replacing user-created snapshots or changing existing scenario ids.
        if (version < 18) {
          const existingSnapshots = Array.isArray(persisted.sourceSnapshots)
            ? persisted.sourceSnapshots
            : [];
          const existingIds = new Set(
            existingSnapshots.map((snapshot: SourceSnapshot) => snapshot.id)
          );
          persisted.sourceSnapshots = [
            ...existingSnapshots,
            ...cloneDefaultSourceSnapshots().filter(
              (snapshot) => !existingIds.has(snapshot.id)
            ),
          ];
        }
        // v18 -> v19: Setting Case lifecycle (BUSINESS_PROCESS_BLUEPRINT.md).
        // The case work queue becomes the deliberate landing page; existing
        // screens remain reachable from the new navigation.
        if (version < 19) {
          persisted.settingCases = Array.isArray(persisted.settingCases)
            ? persisted.settingCases
            : [];
          persisted.activeSettingCaseId = persisted.activeSettingCaseId ?? null;
          persisted.currentTab = "cases";
        }
        // v19 -> v20: immutable case baseline and append-only proposed data
        // revision history. Existing cases retain their current stage but do
        // not receive an invented baseline.
        if (version < 20 && Array.isArray(persisted.settingCases)) {
          persisted.settingCases = persisted.settingCases.map(
            (settingCase: SettingCase) => ({
              ...settingCase,
              proposedDataRevisions: Array.isArray(
                settingCase.proposedDataRevisions
              )
                ? settingCase.proposedDataRevisions
                : [],
            })
          );
        }
        if (version < 21 && Array.isArray(persisted.settingCases)) {
          persisted.settingCases = persisted.settingCases.map(
            (settingCase: SettingCase) => ({
              ...settingCase,
              impactAssessments: Array.isArray(settingCase.impactAssessments)
                ? settingCase.impactAssessments
                : [],
            })
          );
        }
        // v21 -> v22: append-only Study Scenario compatibility bindings.
        // Existing scenario links are not promoted into bindings because they
        // do not prove revision compatibility.
        if (version < 22 && Array.isArray(persisted.settingCases)) {
          persisted.settingCases = persisted.settingCases.map(
            (settingCase: SettingCase) => ({
              ...settingCase,
              studyBindings: Array.isArray(settingCase.studyBindings)
                ? settingCase.studyBindings
                : [],
            })
          );
        }
        // v22 -> v23: Sprint 4.1 flow authority/activation contract and
        // multi-condition Study Scenario Package. A legacy single-scenario
        // binding is retained as history but is not auto-promoted to a
        // compatible package.
        if (version < 23 && Array.isArray(persisted.settingCases)) {
          persisted.settingCases = persisted.settingCases.map(
            (settingCase: SettingCase) => ({
              ...settingCase,
              flowProfile:
                settingCase.flowProfile ??
                buildCaseFlowProfile({
                  caseType: settingCase.caseType,
                  changeItems: settingCase.changeItems ?? [],
                  urgency: settingCase.urgency ?? "normal",
                  owningUnit: settingCase.owningUnit ?? "",
                  actor: settingCase.createdBy ?? "Migrated user",
                  draft: {
                    ownerLevel: "UPT",
                    notifiedUnits: settingCase.remoteUnit
                      ? [settingCase.remoteUnit]
                      : [],
                  },
                }),
              studyPackageBindings: Array.isArray(
                settingCase.studyPackageBindings
              )
                ? settingCase.studyPackageBindings
                : [],
              links: {
                ...settingCase.links,
                scenarioIds: Array.isArray(settingCase.links?.scenarioIds)
                  ? settingCase.links.scenarioIds
                  : settingCase.links?.scenarioId
                    ? [settingCase.links.scenarioId]
                    : [],
              },
            })
          );
        }
        if (version < 26) {
          persisted.targetedCalculationRuns = Array.isArray(
            persisted.targetedCalculationRuns
          )
            ? persisted.targetedCalculationRuns
            : [];
        }
        return persisted;
      },
      version: PROTECTION_LIFECYCLE_SNAPSHOT_VERSION,
    }
  )
);

type NetworkGraphEntityKind = "substation" | "busbar" | "bay" | "terminal" | "relation" | "ied";

function normalizedOverride(value?: NetworkGraphOverride): NetworkGraphOverride {
  return {
    substations: [...(value?.substations ?? [])],
    busbars: [...(value?.busbars ?? [])],
    bays: [...(value?.bays ?? [])],
    terminals: [...(value?.terminals ?? [])],
    relations: [...(value?.relations ?? [])],
    ieds: [...(value?.ieds ?? [])],
  };
}

function cloneNetworkGraphOverride(value: NetworkGraphOverride): NetworkGraphOverride {
  return normalizedOverride(value);
}

function upsertById<T extends { id: string }>(existing: T[], additions: T[]): T[] {
  const next = [...existing];
  for (const item of additions) {
    const index = next.findIndex((existingItem) => existingItem.id === item.id);
    if (index >= 0) next[index] = item;
    else next.push(item);
  }
  return next;
}

function pushNetworkUndo(
  state: State,
  caseId: string,
  summary: string
): Record<string, NetworkUndoEntry[]> {
  const entry: NetworkUndoEntry = {
    id: `netundo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    caseId,
    at: new Date().toISOString(),
    summary,
    overrideBefore: state.networkGraphOverrides[caseId]
      ? cloneNetworkGraphOverride(state.networkGraphOverrides[caseId])
      : undefined,
  };
  return {
    ...state.networkUndoStack,
    [caseId]: [entry, ...(state.networkUndoStack[caseId] ?? [])].slice(0, 20),
  };
}

function removeNetworkGraphEntryCascade(
  override: NetworkGraphOverride,
  kind: NetworkGraphEntityKind,
  id: string
): {
  override: NetworkGraphOverride;
  removedIedIds: string[];
  removedRelationIds: string[];
} {
  const next = cloneNetworkGraphOverride(override);
  const removedBayIds = new Set<string>();
  const removedBusbarIds = new Set<string>();
  const removedRelationIds = new Set<string>();

  if (kind === "relation") {
    const relation = next.relations.find((item) => item.id === id);
    if (relation) {
      removedRelationIds.add(relation.id);
      removedBayIds.add(relation.fromBayId);
      removedBayIds.add(relation.toBayId);
    }
  }

  if (kind === "substation") {
    for (const relation of next.relations) {
      if (relation.fromSubstationId === id || relation.toSubstationId === id) {
        removedRelationIds.add(relation.id);
        removedBayIds.add(relation.fromBayId);
        removedBayIds.add(relation.toBayId);
      }
    }
    for (const bay of next.bays) {
      if (bay.substationId === id) removedBayIds.add(bay.id);
    }
    for (const busbar of next.busbars) {
      if (busbar.substationId === id) removedBusbarIds.add(busbar.id);
    }
    next.substations = next.substations.filter((item) => item.id !== id);
  }

  if (kind === "bay") {
    removedBayIds.add(id);
    for (const relation of next.relations) {
      if (relation.fromBayId === id || relation.toBayId === id) {
        removedRelationIds.add(relation.id);
        removedBayIds.add(relation.fromBayId);
        removedBayIds.add(relation.toBayId);
      }
    }
  }

  if (kind === "busbar") {
    removedBusbarIds.add(id);
    next.busbars = next.busbars.filter((item) => item.id !== id);
  }

  const removedIedIds = next.ieds
    .filter((item) => (kind === "ied" && item.id === id) || removedBayIds.has(item.bayId))
    .map((item) => item.id);

  if (kind === "terminal") {
    next.terminals = next.terminals.filter((item) => item.id !== id);
  }
  if (kind === "ied") {
    next.ieds = next.ieds.filter((item) => item.id !== id);
  }

  if (removedRelationIds.size > 0) {
    next.relations = next.relations.filter((item) => !removedRelationIds.has(item.id));
  }
  if (removedBayIds.size > 0) {
    next.bays = next.bays.filter((item) => !removedBayIds.has(item.id));
    next.terminals = next.terminals.filter((item) => !removedBayIds.has(item.bayId));
    next.ieds = next.ieds.filter((item) => !removedBayIds.has(item.bayId));
  }
  if (removedBusbarIds.size > 0) {
    next.terminals = next.terminals.filter((item) => !removedBusbarIds.has(item.busbarId));
  }

  return {
    override: next,
    removedIedIds,
    removedRelationIds: Array.from(removedRelationIds),
  };
}

function appendAuditEvent(
  get: () => State,
  set: (partial: Partial<State>) => void,
  event: Omit<AuditEvent, "id" | "at" | "actor">
) {
  const current = get();
  const nextEvent: AuditEvent = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    actor: current.currentPersona,
    ...event,
  };
  set({ auditEvents: [nextEvent, ...current.auditEvents].slice(0, 250) });
}
