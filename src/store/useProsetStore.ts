import { create } from "zustand";
import { persist } from "zustand/middleware";
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
import type { VerificationReferenceDraft } from "../domain/setting-verification";
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
const DEFAULT_STUDIES: Study[] = [
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
    | "reference_verification_staged"
    | "vendor_import_staged";
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
};

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

type ZoneOverride = Partial<Zone>;
type RelayOverride = {
  zones?: { Z1?: ZoneOverride; Z2?: ZoneOverride; Z3?: ZoneOverride };
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

  // UI state
  currentTab: Tab;
  currentPersona: Persona;
  activeCorridorId: string;
  selectedRelayId: string | null;
  rxModalOpen: boolean;
  comparisonBayId: string;
  activeNetworkCaseId: string;
  activeNetworkLineId: string | null;

  // Mutations from user edits (persisted)
  relayOverrides: Record<string, RelayOverride>;
  candidateDecisions: Record<string, CandidateDecision>;
  // Per-GI confirmation decisions from the graph builder (src/domain/graph-builder.ts).
  // Keyed by the GraphBuildGroup's station id. Unlike candidateDecisions
  // (one decision per imported record/row), this is one decision per
  // substation covering all of its bays/relations at once.
  graphBuildDecisions: Record<string, { status: "confirmed" | "rejected"; decidedAt: string }>;
  networkGraphOverrides: Record<string, NetworkGraphOverride>;
  networkUndoStack: Record<string, NetworkUndoEntry[]>;
  ctVtOverrides: Record<string, CtVtOverride>;
  auditEvents: AuditEvent[];
  sourceIntakeRecords: SourceIntakeRecord[];
  pdfTapPromotions: PdfTapPromotion[];
  calculationSnapshots: CalculationSnapshot[];
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
  setPersona: (p: Persona) => void;
  setActiveCorridor: (id: string) => void;
  selectRelay: (id: string | null) => void;
  openRxModal: () => void;
  closeRxModal: () => void;
  setComparisonBay: (id: string) => void;
  setActiveNetworkCase: (id: string) => void;
  setActiveNetworkLine: (id: string | null) => void;
  selectLine: (lineId: string) => void;
  createStudy: (
    name: string,
    description: string,
    substationIds: string[],
    options?: CreateStudyOptions
  ) => void;
  deleteStudy: (id: string) => void;
  setActiveStudy: (id: string) => void;
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
  // Commits one graph-builder GraphBuildGroup (one GI's substation + all its
  // bays + line relations) to the network graph override in a single action, so
  // review happens per-GI instead of per-record.
  confirmGraphBuildGroup: (
    caseId: string,
    payload: { substation: UnifiedSubstation; bays: Bay[]; relations: LineRelation[] }
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

      studies: DEFAULT_STUDIES,
      activeStudyId: DEFAULT_STUDIES[0]?.id ?? null,
      sourceSnapshots: cloneDefaultSourceSnapshots(),
      studyScenarios: cloneDefaultStudyScenarios(),
      engineeringChangeSets: [],

      currentTab: "reference-setting",
      currentPersona: "Engineer",
      activeCorridorId: CORRIDORS.length > 0 ? CORRIDORS[0].id : "unknown",
      selectedRelayId: TOPOLOGY.relays.length > 0 ? TOPOLOGY.relays[0].id : "unknown",
      rxModalOpen: false,
      comparisonBayId: COMPARISON_BAYS.length > 0 ? COMPARISON_BAYS[0].bay.id : "unknown",
      activeNetworkCaseId: "case_dks_dm_pik_mkb",
      activeNetworkLineId: "unknown", // Will be set by Network Model view

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

      // Single action that propagates a line selection to all related context:
      // active line + case + comparison bay + corridor + selected relay.
      // Use this from any "open this line" interaction so other tabs are
      // already in-context when the user navigates to them.
      selectLine: (lineId) => {
        const state = get();
        const inventoryCase =
          NETWORK_CASES.find((c) => c.id === INVENTORY_MASTER_CASE_ID) ?? NETWORK_CASES[0];
        const masterNetworkGraph = getEffectiveNetworkGraph(
          INVENTORY_MASTER_CASE_ID,
          state.networkGraphOverrides[INVENTORY_MASTER_CASE_ID],
          buildUnifiedNetwork(inventoryCase)
        );
        const owningCase = NETWORK_CASES.find((c) => {
          if (c.lines.some((l) => l.id === lineId)) return true;
          const effective = mergeMasterRelationsIntoCase(
            getEffectiveNetworkGraph(c.id, state.networkGraphOverrides[c.id], buildUnifiedNetwork(c)),
            masterNetworkGraph
          );
          return Boolean(effective && networkLinesFromGraph(effective).some((l) => l.id === lineId));
        });
        if (!owningCase) return;
        const effective = mergeMasterRelationsIntoCase(
          getEffectiveNetworkGraph(owningCase.id, state.networkGraphOverrides[owningCase.id], buildUnifiedNetwork(owningCase)),
          masterNetworkGraph
        );
        const line =
          owningCase.lines.find((l) => l.id === lineId) ??
          (effective ? networkLinesFromGraph(effective).find((l) => l.id === lineId) : undefined);
        if (!line) return;
        const compareBay = findComparisonBayIdForLine(lineId);
        const corridorId =
          owningCase.id === "case_dks_dm_pik_mkb"
            ? "corr_dks_dm_pik_mkb"
            : get().activeCorridorId;
        const relayId = `rel_${line.fromNodeId}_fwd_${line.toNodeId}`;
        set({
          activeNetworkLineId: lineId,
          activeNetworkCaseId: owningCase.id,
          activeCorridorId: corridorId,
          selectedRelayId: relayId,
          ...(compareBay ? { comparisonBayId: compareBay } : {}),
        });
        appendAuditEvent(get, set, {
          action: "line_selected",
          scope: owningCase.id,
          targetId: lineId,
          summary: `Selected line ${line.circuit}`,
          detail: `${line.fromNodeId} -> ${line.toNodeId}`,
        });
      },

      createStudy: (name, description, substationIds, options) => {
        const id = `study_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newStudy: Study = {
          id,
          name,
          description,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          substationIds,
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
          activeNetworkCaseId: "case_dks_dm_pik_mkb",
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
          get().selectLine(options.subjectLineId);
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
        const study = get().studies.find((s) => s.id === id);
        appendAuditEvent(get, set, {
          action: "study_selected",
          scope: id,
          summary: `Selected study${study ? `: ${study.name}` : ""}`,
        });
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
          substations: upsertById(existing.substations, [payload.substation]),
          bays: upsertById(existing.bays, payload.bays),
          relations: upsertById(existing.relations, payload.relations),
        };
        set({
          networkGraphOverrides: next,
          networkUndoStack: pushNetworkUndo(
            current,
            caseId,
            `Confirmed graph-builder group for ${payload.substation.name}`
          ),
          graphBuildDecisions: {
            ...current.graphBuildDecisions,
            [payload.substation.id]: { status: "confirmed", decidedAt: new Date().toISOString() },
          },
        });
        appendAuditEvent(get, set, {
          action: "network_graph_add",
          scope: caseId,
          targetId: payload.substation.id,
          summary: "Confirmed graph-builder GI group",
          detail: `${payload.substation.name}: ${payload.bays.length} bay(s), ${payload.relations.length} relation(s)`,
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
        const record = get().sourceIntakeRecords.find((item) => item.id === id);
        set({ sourceIntakeRecords: get().sourceIntakeRecords.filter((item) => item.id !== id) });
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
      name: "proset-poc-state-v1",
      partialize: (state) => ({
        relayOverrides: state.relayOverrides,
        candidateDecisions: state.candidateDecisions,
        graphBuildDecisions: state.graphBuildDecisions,
        networkGraphOverrides: state.networkGraphOverrides,
        networkUndoStack: state.networkUndoStack,
        ctVtOverrides: state.ctVtOverrides,
        auditEvents: state.auditEvents,
        sourceIntakeRecords: state.sourceIntakeRecords,
        pdfTapPromotions: state.pdfTapPromotions,
        calculationSnapshots: state.calculationSnapshots,
        verificationReferenceDraft: state.verificationReferenceDraft,
        vendorImportHandoffDraft: state.vendorImportHandoffDraft,
        studies: state.studies,
        activeStudyId: state.activeStudyId,
        sourceSnapshots: state.sourceSnapshots,
        studyScenarios: state.studyScenarios,
        engineeringChangeSets: state.engineeringChangeSets,
        currentTab: state.currentTab,
        activeCorridorId: state.activeCorridorId,
        selectedRelayId: state.selectedRelayId,
        comparisonBayId: state.comparisonBayId,
        activeNetworkCaseId: state.activeNetworkCaseId,
        activeNetworkLineId: state.activeNetworkLineId,
      }),
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
          persisted.studies = persisted.studies ?? DEFAULT_STUDIES;
          persisted.activeStudyId = persisted.activeStudyId ?? DEFAULT_STUDIES[0]?.id ?? null;
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
            persisted.studies = DEFAULT_STUDIES;
            persisted.activeStudyId = DEFAULT_STUDIES[0].id;
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
              DEFAULT_STUDIES.some(
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
        return persisted;
      },
      version: 18,
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
