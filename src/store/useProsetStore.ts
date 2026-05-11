import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Relay, Zone } from "../domain/types";
import { TOPOLOGY, CORRIDORS } from "../domain/seed-corridor";
import { COMPARISON_BAYS, findComparisonBayIdForLine } from "../domain/seed-comparison";
import { NETWORK_CASES } from "../domain/seed-network-registry";
import { buildUnifiedNetwork } from "../domain/unified";
import {
  getEffectiveMiniNmm,
  INVENTORY_MASTER_CASE_ID,
  mergeMasterRelationsIntoCase,
  networkLinesFromMiniNmm,
} from "../domain/mini-nmm";
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

export type MiniNmmOverride = {
  substations: UnifiedSubstation[];
  busbars: Busbar[];
  bays: Bay[];
  terminals: Terminal[];
  relations: LineRelation[];
  ieds: RelayIED[];
};

const EMPTY_OVERRIDE: MiniNmmOverride = {
  substations: [],
  busbars: [],
  bays: [],
  terminals: [],
  relations: [],
  ieds: [],
};

export type Tab =
  | "home"
  | "master-data"
  | "study-dashboard"
  | "network-model"
  | "mini-nmm-editor"
  | "source-index"
  | "inbox"
  | "line-registry"
  | "calculation"
  | "comparison"
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
  sourceBridge?: Study["sourceBridge"];
};

const DEFAULT_STUDIES: Study[] = [
  {
    id: "study_dks_dm_pik_mkb",
    name: "Koridor DKS - DM - PIK - MKB",
    description:
      "Analisis distance/LCD setting penghantar 150 kV koridor Durikosambi - Daan Mogot - Pantai Indah Kapuk - Muarakarang Baru, termasuk cabang DKS-GRB dan DKS-KBJ.",
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-05-09T00:00:00Z",
    substationIds: ["dks", "daan_mogot", "pantai_indah_kapuk", "muarakarang_baru_gi", "grogol_baru", "kebon_jeruk"],
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
    | "line_selected"
    | "zone_updated"
    | "relay_reset"
    | "reset_edits"
    | "mini_nmm_add"
    | "mini_nmm_remove"
    | "mini_nmm_reset"
    | "ct_vt_update"
    | "ct_vt_clear"
    | "pdf_tap_promote"
    | "pdf_tap_unpromote"
    | "calculation_snapshot_add"
    | "calculation_snapshot_remove";
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
  miniNmmOverrides: Record<string, MiniNmmOverride>;
  ctVtOverrides: Record<string, CtVtOverride>;
  auditEvents: AuditEvent[];
  sourceIntakeRecords: SourceIntakeRecord[];
  pdfTapPromotions: PdfTapPromotion[];
  calculationSnapshots: CalculationSnapshot[];

  // Actions
  setTab: (tab: Tab) => void;
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
  addMiniNmmSubstation: (caseId: string, sub: UnifiedSubstation) => void;
  addMiniNmmBusbar: (caseId: string, busbar: Busbar) => void;
  addMiniNmmBay: (caseId: string, bay: Bay) => void;
  addMiniNmmTerminal: (caseId: string, terminal: Terminal) => void;
  addMiniNmmRelation: (caseId: string, relation: LineRelation) => void;
  addMiniNmmIed: (caseId: string, ied: RelayIED) => void;
  removeMiniNmmEntry: (caseId: string, kind: "substation" | "busbar" | "bay" | "terminal" | "relation" | "ied", id: string) => void;
  resetMiniNmmOverrides: (caseId: string) => void;
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

      currentTab: "home",
      currentPersona: "Engineer",
      activeCorridorId: CORRIDORS.length > 0 ? CORRIDORS[0].id : "unknown",
      selectedRelayId: TOPOLOGY.relays.length > 0 ? TOPOLOGY.relays[0].id : "unknown",
      rxModalOpen: false,
      comparisonBayId: COMPARISON_BAYS.length > 0 ? COMPARISON_BAYS[0].bay.id : "unknown",
      activeNetworkCaseId: "case_dks_dm_pik_mkb",
      activeNetworkLineId: "unknown", // Will be set by Network Model view

      relayOverrides: {},
      candidateDecisions: {},
      miniNmmOverrides: {},
      ctVtOverrides: {},
      auditEvents: [],
      sourceIntakeRecords: [],
      pdfTapPromotions: [],
      calculationSnapshots: [],

      setTab: (tab) => set({ currentTab: tab }),
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
        const masterMiniNmm = getEffectiveMiniNmm(
          INVENTORY_MASTER_CASE_ID,
          state.miniNmmOverrides[INVENTORY_MASTER_CASE_ID],
          buildUnifiedNetwork(inventoryCase)
        );
        const owningCase = NETWORK_CASES.find((c) => {
          if (c.lines.some((l) => l.id === lineId)) return true;
          const effective = mergeMasterRelationsIntoCase(
            getEffectiveMiniNmm(c.id, state.miniNmmOverrides[c.id], buildUnifiedNetwork(c)),
            masterMiniNmm
          );
          return Boolean(effective && networkLinesFromMiniNmm(effective).some((l) => l.id === lineId));
        });
        if (!owningCase) return;
        const effective = mergeMasterRelationsIntoCase(
          getEffectiveMiniNmm(owningCase.id, state.miniNmmOverrides[owningCase.id], buildUnifiedNetwork(owningCase)),
          masterMiniNmm
        );
        const line =
          owningCase.lines.find((l) => l.id === lineId) ??
          (effective ? networkLinesFromMiniNmm(effective).find((l) => l.id === lineId) : undefined);
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
        set({ relayOverrides: {}, candidateDecisions: {} });
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

      addMiniNmmSubstation: (caseId, sub) => {
        const next = { ...get().miniNmmOverrides };
        const existing = next[caseId] ?? { ...EMPTY_OVERRIDE };
        next[caseId] = {
          ...existing,
          busbars: existing.busbars ?? [],
          terminals: existing.terminals ?? [],
          substations: [...existing.substations, sub],
        };
        set({ miniNmmOverrides: next });
        appendAuditEvent(get, set, {
          action: "mini_nmm_add",
          scope: caseId,
          targetId: sub.id,
          summary: "Added substation",
          detail: `${sub.shortCode} ${sub.name}`,
        });
      },

      addMiniNmmBusbar: (caseId, busbar) => {
        const next = { ...get().miniNmmOverrides };
        const existing = next[caseId] ?? { ...EMPTY_OVERRIDE };
        next[caseId] = {
          ...existing,
          busbars: [...(existing.busbars ?? []), busbar],
          terminals: existing.terminals ?? [],
        };
        set({ miniNmmOverrides: next });
        appendAuditEvent(get, set, {
          action: "mini_nmm_add",
          scope: caseId,
          targetId: busbar.id,
          summary: "Added busbar",
          detail: `${busbar.substationId} ${busbar.label}`,
        });
      },

      addMiniNmmBay: (caseId, bay) => {
        const next = { ...get().miniNmmOverrides };
        const existing = next[caseId] ?? { ...EMPTY_OVERRIDE };
        next[caseId] = {
          ...existing,
          busbars: existing.busbars ?? [],
          terminals: existing.terminals ?? [],
          bays: [...existing.bays, bay],
        };
        set({ miniNmmOverrides: next });
        appendAuditEvent(get, set, {
          action: "mini_nmm_add",
          scope: caseId,
          targetId: bay.id,
          summary: "Added bay",
          detail: `${bay.substationId} ${bay.rawName}`,
        });
      },

      addMiniNmmTerminal: (caseId, terminal) => {
        const next = { ...get().miniNmmOverrides };
        const existing = next[caseId] ?? { ...EMPTY_OVERRIDE };
        next[caseId] = {
          ...existing,
          busbars: existing.busbars ?? [],
          terminals: [...(existing.terminals ?? []), terminal],
        };
        set({ miniNmmOverrides: next });
        appendAuditEvent(get, set, {
          action: "mini_nmm_add",
          scope: caseId,
          targetId: terminal.id,
          summary: "Added terminal",
          detail: `${terminal.bayId} -> ${terminal.busbarId}`,
        });
      },

      addMiniNmmRelation: (caseId, relation) => {
        const next = { ...get().miniNmmOverrides };
        const existing = next[caseId] ?? { ...EMPTY_OVERRIDE };
        next[caseId] = {
          ...existing,
          busbars: existing.busbars ?? [],
          terminals: existing.terminals ?? [],
          relations: [...existing.relations, relation],
        };
        set({ miniNmmOverrides: next });
        appendAuditEvent(get, set, {
          action: "mini_nmm_add",
          scope: caseId,
          targetId: relation.id,
          summary: "Added line relation",
          detail: `${relation.fromSubstationId} -> ${relation.toSubstationId} #${relation.circuit}`,
        });
      },

      addMiniNmmIed: (caseId, ied) => {
        const next = { ...get().miniNmmOverrides };
        const existing = next[caseId] ?? { ...EMPTY_OVERRIDE };
        next[caseId] = {
          ...existing,
          busbars: existing.busbars ?? [],
          terminals: existing.terminals ?? [],
          ieds: [...existing.ieds, ied],
        };
        set({ miniNmmOverrides: next });
        appendAuditEvent(get, set, {
          action: "mini_nmm_add",
          scope: caseId,
          targetId: ied.id,
          summary: "Added relay IED",
          detail: `${ied.make} ${ied.model} | bay ${ied.bayId}`,
        });
      },

      removeMiniNmmEntry: (caseId, kind, id) => {
        const next = { ...get().miniNmmOverrides };
        const existing = next[caseId];
        if (!existing) return;
        const updated = { ...existing };
        if (kind === "substation") updated.substations = existing.substations.filter((s) => s.id !== id);
        if (kind === "busbar") updated.busbars = (existing.busbars ?? []).filter((b) => b.id !== id);
        if (kind === "bay") updated.bays = existing.bays.filter((b) => b.id !== id);
        if (kind === "terminal") updated.terminals = (existing.terminals ?? []).filter((t) => t.id !== id);
        if (kind === "relation") updated.relations = existing.relations.filter((r) => r.id !== id);
        if (kind === "ied") updated.ieds = existing.ieds.filter((i) => i.id !== id);
        next[caseId] = updated;
        set({ miniNmmOverrides: next });
        appendAuditEvent(get, set, {
          action: "mini_nmm_remove",
          scope: caseId,
          targetId: id,
          summary: `Removed ${kind}`,
        });
      },

      resetMiniNmmOverrides: (caseId) => {
        const next = { ...get().miniNmmOverrides };
        delete next[caseId];
        set({ miniNmmOverrides: next });
        appendAuditEvent(get, set, {
          action: "mini_nmm_reset",
          scope: caseId,
          summary: "Reset mini-NMM overrides",
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
        miniNmmOverrides: state.miniNmmOverrides,
        ctVtOverrides: state.ctVtOverrides,
        auditEvents: state.auditEvents,
        sourceIntakeRecords: state.sourceIntakeRecords,
        pdfTapPromotions: state.pdfTapPromotions,
        calculationSnapshots: state.calculationSnapshots,
        studies: state.studies,
        activeStudyId: state.activeStudyId,
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
        return persisted;
      },
      version: 9,
    }
  )
);

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
