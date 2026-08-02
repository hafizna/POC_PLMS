import type { SettingCaseBaseline } from "./case-baseline";
import type { ChangeItem, ChangeItemKind, SettingCase } from "./setting-case";
import {
  createDataChangeProposal,
  createGovernedRevision,
  type ActivationPolicy,
  type CanonicalEntityRef,
  type CanonicalRevisionPayload,
  type DataChangeProposal,
  type GovernedRevision,
  type InstrumentTransformerRevisionPayload,
  type LineTechnicalRevisionPayload,
  type NetworkTopologyRevisionPayload,
} from "./ssot-governance";

export type ProposedRevisionKind =
  | "line_technical"
  | "instrument_ct"
  | "instrument_vt"
  | "relay_asset"
  | "network_topology"
  | "policy_rule"
  | "master_correction"
  | "other_technical";

export type ProposedFieldValueType = "number" | "text";

export type ProposedFieldDefinition = {
  key: string;
  label: string;
  valueType: ProposedFieldValueType;
  unit?: string;
  required: boolean;
};

export type ProposedFieldChange = {
  readonly fieldKey: string;
  readonly label: string;
  readonly valueType: ProposedFieldValueType;
  readonly unit?: string;
  readonly beforeValue?: string | number;
  readonly proposedValue: string | number;
};

export type ProposedDataRevision = {
  readonly id: string;
  readonly settingCaseId: string;
  readonly baselineId: string;
  readonly version: number;
  readonly kind: ProposedRevisionKind;
  readonly kinds: readonly ProposedRevisionKind[];
  readonly primaryReason: ChangeItemKind;
  readonly targetEntityId?: string;
  readonly targetLabel?: string;
  readonly plannedEffectiveDate?: string;
  readonly sourceEvidenceIds: readonly string[];
  readonly fieldChanges: readonly ProposedFieldChange[];
  readonly assumptions?: string;
  readonly status: "draft" | "ready_for_impact";
  readonly validation: {
    readonly valid: boolean;
    readonly errors: readonly string[];
  };
  readonly createdAt: string;
  readonly createdBy: string;
  readonly fingerprint: {
    readonly algorithm: "fnv1a32";
    readonly value: string;
  };
  /** SSOT-2B governed wrapper. Legacy persisted drafts may not have it. */
  readonly governedProposal?: DataChangeProposal;
  /** One governed proposal per canonical target when a case has multiple change kinds. */
  readonly governedProposals?: readonly DataChangeProposal[];
  /**
   * Real GovernedRevision rows backing each governedProposals[].proposedRevisionId
   * that has a typed CanonicalRevisionPayload (line_technical, instrument_ct/vt,
   * relay_asset, network_topology). Proposal kinds without a corresponding
   * payload type (policy_rule, master_correction, other_technical) have no
   * entry here and keep a synthetic proposedRevisionId — see
   * payloadForProposalKind()'s comment for why that gap is not closed here.
   */
  readonly governedRevisions?: readonly GovernedRevision[];
};

export type ProposedDataRevisionDraft = {
  targetEntityId?: string;
  targetLabel?: string;
  sourceEvidenceIds: string[];
  values: Record<string, string>;
  assumptions?: string;
};

const FIELD_DEFINITIONS: Record<ProposedRevisionKind, ProposedFieldDefinition[]> = {
  line_technical: [
    field(
      "line.proposed_network_revision_ref",
      "Referensi proposed network revision / change set",
      "text",
      true
    ),
    field("line.conductor_designation", "Konduktor / kabel", "text", true),
    field("line.current_rating_a", "CCC / current rating", "number", true, "A"),
    field("line.physical_length_km", "Panjang fisik", "number", true, "km"),
    field("line.r1_ohm", "R1 total", "number", true, "Ω"),
    field("line.x1_ohm", "X1 total", "number", true, "Ω"),
    field("line.r0_ohm", "R0 total", "number", true, "Ω"),
    field("line.x0_ohm", "X0 total", "number", true, "Ω"),
    field("line.c1_nf_per_km", "C1", "number", true, "nF/km"),
    field("line.c0_nf_per_km", "C0", "number", true, "nF/km"),
  ],
  instrument_ct: [
    field("ct.primary_a", "CT primary", "number", true, "A"),
    field("ct.secondary_a", "CT secondary", "number", true, "A"),
    field("ct.accuracy_class", "Kelas CT", "text", true),
    field("ct.burden_va", "Burden", "number", true, "VA"),
    field("ct.location", "Lokasi CT", "text", true),
    field("ct.polarity", "Polaritas", "text", true),
  ],
  instrument_vt: [
    field("vt.primary_kv", "VT primary", "number", true, "kV"),
    field("vt.secondary_v", "VT secondary", "number", true, "V"),
    field("vt.accuracy_class", "Kelas VT", "text", true),
    field("vt.winding", "Winding yang digunakan", "text", true),
    field("vt.location", "Lokasi VT", "text", true),
    field("vt.polarity", "Polaritas", "text", true),
  ],
  relay_asset: [
    field("relay.make", "Vendor", "text", true),
    field("relay.model", "Model", "text", true),
    field("relay.firmware", "Firmware", "text", true),
    field("relay.order_code", "Order code", "text", true),
    field("relay.capability_profile", "Capability profile", "text", true),
    field("relay.logic_communication_notes", "I/O, logic, dan komunikasi", "text", true),
  ],
  network_topology: [
    field("topology.change_description", "Deskripsi perubahan topologi", "text", true),
    field("topology.affected_asset_ids", "ID aset terdampak", "text", true),
    field(
      "topology.proposed_revision_ref",
      "Referensi proposed network revision / change set",
      "text",
      true
    ),
  ],
  policy_rule: [
    field("policy.reference", "Referensi kebijakan", "text", true),
    field("policy.rule_version", "Versi aturan", "text", true),
    field("policy.change_summary", "Ringkasan perubahan aturan", "text", true),
  ],
  master_correction: [
    field("master.entity_type", "Jenis entitas", "text", true),
    field("master.field_name", "Field yang dikoreksi", "text", true),
    field("master.corrected_value", "Nilai koreksi", "text", true),
    field("master.correction_reason", "Alasan koreksi", "text", true),
  ],
  other_technical: [
    field("other.change_description", "Deskripsi perubahan", "text", true),
    field("other.affected_asset_ids", "ID aset terdampak", "text", true),
  ],
};

export function proposedRevisionKindForReason(
  reason: ChangeItemKind
): ProposedRevisionKind {
  switch (reason) {
    case "reconductoring":
      return "line_technical";
    case "ct_replacement":
      return "instrument_ct";
    case "vt_replacement":
      return "instrument_vt";
    case "relay_replacement":
      return "relay_asset";
    case "new_gi_insertion":
    case "topology_change":
    case "remote_side_work":
      return "network_topology";
    case "policy_revision":
      return "policy_rule";
    case "data_correction":
      return "master_correction";
    default:
      return "other_technical";
  }
}

export function proposedFieldDefinitions(
  reason: ChangeItemKind
): ProposedFieldDefinition[] {
  return FIELD_DEFINITIONS[proposedRevisionKindForReason(reason)].map((item) => ({
    ...item,
  }));
}

export function proposedFieldDefinitionsForChangeItems(
  changeItems: readonly ChangeItem[],
  fallbackReason: ChangeItemKind
): ProposedFieldDefinition[] {
  const reasons =
    changeItems.length > 0
      ? changeItems.map((item) => item.kind)
      : [fallbackReason];
  const seen = new Set<string>();
  return reasons.flatMap((reason) =>
    proposedFieldDefinitions(reason).filter((definition) => {
      if (seen.has(definition.key)) return false;
      seen.add(definition.key);
      return true;
    })
  );
}

export function buildProposedDataRevision(input: {
  settingCase: SettingCase;
  baseline: SettingCaseBaseline;
  draft: ProposedDataRevisionDraft;
  version: number;
  id: string;
  createdAt: string;
  createdBy: string;
}): ProposedDataRevision {
  const kind = proposedRevisionKindForReason(input.settingCase.primaryReason);
  const kinds = unique(
    input.settingCase.changeItems.map((item) =>
      proposedRevisionKindForReason(item.kind)
    )
  ) as ProposedRevisionKind[];
  if (kinds.length === 0) kinds.push(kind);
  const definitions = proposedFieldDefinitionsForChangeItems(
    input.settingCase.changeItems,
    input.settingCase.primaryReason
  );
  const errors: string[] = [];
  const linkedCaseEvidenceIds = new Set(
    input.settingCase.links.sourceIntakeIds
  );
  const sourceEvidenceIds = unique(input.draft.sourceEvidenceIds).filter((id) =>
    linkedCaseEvidenceIds.has(id)
  );

  if (sourceEvidenceIds.length === 0) {
    errors.push(
      "Pilih minimal satu evidence perubahan yang ditautkan ke Setting Case."
    );
  }
  if (
    kinds.some(
      (item) => item !== "policy_rule" && item !== "master_correction"
    ) &&
    !input.settingCase.plannedEffectiveDate
  ) {
    errors.push("Tanggal efektif/energize rencana wajib untuk perubahan fisik/teknis.");
  }

  const fieldChanges: ProposedFieldChange[] = [];
  for (const definition of definitions) {
    const raw = input.draft.values[definition.key]?.trim() ?? "";
    if (!raw) {
      if (definition.required) errors.push(`${definition.label} wajib diisi.`);
      continue;
    }
    const proposedValue =
      definition.valueType === "number" ? Number(raw.replace(",", ".")) : raw;
    if (
      definition.valueType === "number" &&
      (!Number.isFinite(proposedValue) || Number(proposedValue) < 0)
    ) {
      errors.push(`${definition.label} harus berupa angka non-negatif.`);
      continue;
    }
    const beforeValue = baselineValueForProposedField(
      input.baseline,
      definition.key
    );
    if (
      beforeValue !== undefined &&
      String(beforeValue).trim() === String(proposedValue).trim()
    ) {
      continue;
    }
    fieldChanges.push({
      fieldKey: definition.key,
      label: definition.label,
      valueType: definition.valueType,
      unit: definition.unit,
      beforeValue,
      proposedValue,
    });
  }

  const proposalId = input.id;
  const governedRevisions: GovernedRevision[] = [];
  const governedProposals = kinds.map((proposalKind) => {
    const allowedFields = new Set(
      FIELD_DEFINITIONS[proposalKind].map((definition) => definition.key)
    );
    const kindFieldChanges = fieldChanges.filter((change) => allowedFields.has(change.fieldKey));
    const target = canonicalTargetForProposal(
      input.settingCase,
      proposalKind,
      input.draft.targetEntityId
    );
    // A real GovernedRevision only gets built for kinds that have a typed
    // CanonicalRevisionPayload to hold their fields (line_technical,
    // instrument_ct/vt, relay_asset, network_topology). policy_rule and
    // master_correction/other_technical stay on the synthetic
    // `${proposalId}:${kind}` id below — SettingRevisionPayload's shape
    // (settingPackageId/endpointBayId/canonicalParameterSetRef) has no
    // correspondence to the policy/correction field definitions collected
    // here, and line_relation/bay/substation have no payload type in
    // ssot-governance.ts at all. Forcing either into a payload would
    // fabricate data, not close the gap — flagged as a separate
    // ssot-governance.ts extension, not something this function should
    // guess at.
    const revisionPayload = payloadForProposalKind(proposalKind, target, kindFieldChanges, input.baseline);
    let proposedRevisionId = `${proposalId}:${proposalKind}`;
    if (revisionPayload && target.id) {
      const revision = createGovernedRevision({
        id: `governed_rev_${proposalId}_${proposalKind}`,
        entity: target,
        revisionNumber: 2, // 1 is reserved for the case-local baseline revision (see baselineRevisionId below); this is POC-local numbering, not an enterprise revision count.
        caseId: input.settingCase.id,
        payload: revisionPayload,
        sourceEvidenceIds: sourceEvidenceIds.length > 0 ? sourceEvidenceIds : ["pending-evidence"],
        createdAt: input.createdAt,
        createdBy: input.createdBy,
      });
      governedRevisions.push(revision);
      proposedRevisionId = revision.id;
    }
    const base = createDataChangeProposal({
      id: `data_change_${proposalId}_${proposalKind}`,
      caseId: input.settingCase.id,
      target,
      baselineRevisionId:
        input.baseline.revisionBindings.technicalDataRevisionId ?? input.baseline.id,
      proposedRevisionId,
      reason: input.settingCase.changeItems.find(
        (item) => proposedRevisionKindForReason(item.kind) === proposalKind
      )?.kind ?? input.settingCase.primaryReason,
      fieldChanges: kindFieldChanges.map((change) => ({
        fieldPath: change.fieldKey,
        beforeValue: change.beforeValue,
        proposedValue: change.proposedValue,
        unit: change.unit,
        sourceEvidenceIds,
      })),
      sourceEvidenceIds,
      activationPolicy: activationPolicyForReason(
        input.settingCase.changeItems.find(
          (item) => proposedRevisionKindForReason(item.kind) === proposalKind
        )?.kind ?? input.settingCase.primaryReason
      ),
      plannedEffectiveAt: input.settingCase.plannedEffectiveDate,
      createdAt: input.createdAt,
      createdBy: input.createdBy,
    });
    const proposalErrors = unique([...errors, ...base.validation.errors]);
    return {
      ...base,
      status: proposalErrors.length === 0 ? "ready" as const : "draft" as const,
      validation: {
        valid: proposalErrors.length === 0,
        errors: proposalErrors,
      },
    };
  });
  const governedProposal =
    governedProposals.find((proposal) => proposal.target.kind === canonicalKindForRevision(kind)) ??
    governedProposals[0];
  const combinedErrors = unique([
    ...errors,
    ...governedProposals.flatMap((proposal) => proposal.validation.errors),
  ]);

  const payload = {
    settingCaseId: input.settingCase.id,
    baselineId: input.baseline.id,
    version: input.version,
    kind,
    kinds,
    primaryReason: input.settingCase.primaryReason,
    targetEntityId: input.draft.targetEntityId?.trim() || undefined,
    targetLabel: input.draft.targetLabel?.trim() || undefined,
    plannedEffectiveDate: input.settingCase.plannedEffectiveDate,
    sourceEvidenceIds,
    fieldChanges,
    assumptions: input.draft.assumptions?.trim() || undefined,
    validation: {
      valid: combinedErrors.length === 0,
      errors: combinedErrors,
    },
  };

  return {
    id: input.id,
    ...payload,
    status: combinedErrors.length === 0 ? "ready_for_impact" : "draft",
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    fingerprint: {
      algorithm: "fnv1a32",
      value: fnv1a32(stableStringify(payload)),
    },
    governedProposal,
    governedProposals,
    governedRevisions,
  };
}

function canonicalKindForRevision(
  kind: ProposedRevisionKind
): CanonicalEntityRef["kind"] {
  switch (kind) {
    case "line_technical": return "line_technical";
    case "instrument_ct":
    case "instrument_vt": return "instrument_transformer";
    case "relay_asset": return "relay_installation";
    case "network_topology": return "network_topology";
    case "policy_rule": return "setting_revision";
    case "master_correction":
    case "other_technical": return "line_relation";
  }
}

export function canonicalTargetForProposal(
  settingCase: SettingCase,
  kind: ProposedRevisionKind = proposedRevisionKindForReason(settingCase.primaryReason),
  requestedTargetId?: string
): CanonicalEntityRef {
  const lineId = settingCase.protectedScope.subjectLineId;
  const bayId = settingCase.protectedScope.subjectBayId;
  switch (kind) {
    case "line_technical":
      return { kind: "line_technical", id: lineId ?? requestedTargetId ?? "" };
    case "instrument_ct":
      return {
        kind: "instrument_transformer",
        id: bayId ? `${bayId}:CT` : requestedTargetId ?? "",
      };
    case "instrument_vt":
      return {
        kind: "instrument_transformer",
        id: bayId ? `${bayId}:VT` : requestedTargetId ?? "",
      };
    case "relay_asset":
      return {
        kind: "relay_installation",
        id: bayId ? `${bayId}:main_1` : requestedTargetId ?? "",
      };
    case "network_topology":
      return {
        kind: "network_topology",
        id: settingCase.protectedScope.networkCaseId,
      };
    case "policy_rule":
      return {
        kind: "setting_revision",
        id: lineId ?? bayId ?? requestedTargetId ?? "",
      };
    case "master_correction":
    case "other_technical":
      return {
        kind: lineId ? "line_relation" : bayId ? "bay" : "substation",
        id:
          lineId ??
          bayId ??
          requestedTargetId ??
          settingCase.protectedScope.substationIds[0] ??
          "",
      };
  }
}

/**
 * Maps a proposal kind's flat field changes onto a typed CanonicalRevisionPayload,
 * so the DataChangeProposal built for that kind can bind to a real
 * GovernedRevision instead of a synthetic `${caseId}:${kind}` id (the gap
 * flagged in docs/adr/0001-ssot-2d0-persistence-and-authority-design.md
 * §7.1). Returns undefined for kinds with no corresponding payload type in
 * ssot-governance.ts (policy_rule, master_correction, other_technical) —
 * see the caller's comment for why those are not force-mapped here.
 *
 * Unchanged fields fall back to the baseline value via
 * baselineValueForProposedField() so the payload reflects the full proposed
 * state, not just the delta.
 */
function payloadForProposalKind(
  kind: ProposedRevisionKind,
  target: CanonicalEntityRef,
  fieldChanges: readonly ProposedFieldChange[],
  baseline: SettingCaseBaseline
): CanonicalRevisionPayload | undefined {
  const value = (key: string): string | number | undefined => {
    const changed = fieldChanges.find((change) => change.fieldKey === key);
    return changed ? changed.proposedValue : baselineValueForProposedField(baseline, key);
  };
  const numberValue = (key: string): number | undefined => {
    const raw = value(key);
    return typeof raw === "number" ? raw : raw !== undefined ? Number(raw) : undefined;
  };
  const textValue = (key: string): string | undefined => {
    const raw = value(key);
    return raw === undefined ? undefined : String(raw);
  };

  switch (kind) {
    case "line_technical": {
      const payload: LineTechnicalRevisionPayload = {
        type: "line_technical",
        lineRelationId: target.id,
        conductorDesignation: textValue("line.conductor_designation"),
        physicalLengthKm: numberValue("line.physical_length_km"),
        currentRatingA: numberValue("line.current_rating_a"),
        r1Ohm: numberValue("line.r1_ohm"),
        x1Ohm: numberValue("line.x1_ohm"),
        r0Ohm: numberValue("line.r0_ohm"),
        x0Ohm: numberValue("line.x0_ohm"),
        c1NfPerKm: numberValue("line.c1_nf_per_km"),
        c0NfPerKm: numberValue("line.c0_nf_per_km"),
      };
      return payload;
    }
    case "instrument_ct": {
      const primary = numberValue("ct.primary_a");
      const secondary = numberValue("ct.secondary_a");
      if (primary === undefined || secondary === undefined) return undefined;
      const payload: InstrumentTransformerRevisionPayload = {
        type: "instrument_transformer",
        bayId: target.id.replace(/:CT$/, ""),
        transformerKind: "CT",
        primary,
        secondary,
        accuracyClass: textValue("ct.accuracy_class"),
        polarityRef: textValue("ct.polarity"),
      };
      return payload;
    }
    case "instrument_vt": {
      const primary = numberValue("vt.primary_kv");
      const secondary = numberValue("vt.secondary_v");
      if (primary === undefined || secondary === undefined) return undefined;
      const payload: InstrumentTransformerRevisionPayload = {
        type: "instrument_transformer",
        bayId: target.id.replace(/:VT$/, ""),
        transformerKind: "VT",
        primary,
        secondary,
        accuracyClass: textValue("vt.accuracy_class"),
        polarityRef: textValue("vt.polarity"),
      };
      return payload;
    }
    case "relay_asset":
      // No mapping: RelayInstallationRevisionPayload.relayIedId needs the
      // physical relay's stable identity (serial/asset id), but this kind's
      // field definitions (relay.make/model/firmware/order_code/...) only
      // capture specification data, not identity — "MiCOM P545" is a model
      // name, not the id of the specific unit being installed. Mapping
      // relay.model to relayIedId would fabricate an identity the UI never
      // collected. Closing this requires adding a relay-identity field to
      // FIELD_DEFINITIONS.relay_asset first, not a mapping-layer fix.
      return undefined;
    case "network_topology": {
      const changeDescription = textValue("topology.change_description");
      if (!changeDescription) return undefined;
      const affectedIds = (textValue("topology.affected_asset_ids") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const payload: NetworkTopologyRevisionPayload = {
        type: "network_topology",
        substationIds: baseline.protectedScope.substationIds,
        activeLineRelationIds: affectedIds,
        supersededLineRelationIds: [],
        changeDescription,
      };
      return payload;
    }
    case "policy_rule":
    case "master_correction":
    case "other_technical":
      return undefined;
  }
}

export function activationPolicyForReason(
  reason: ChangeItemKind
): ActivationPolicy {
  if (reason === "data_correction") return "manual_controlled";
  if (reason === "policy_revision") return "approved_effective_date";
  return "commissioning";
}

export function baselineValueForProposedField(
  baseline: SettingCaseBaseline,
  key: string
): string | number | undefined {
  const relation =
    baseline.network.lineRelations.find(
      (item) => item.id === baseline.protectedScope.subjectLineId
    ) ?? baseline.network.lineRelations[0];
  const relay =
    baseline.network.relayIeds.find(
      (item) => item.bayId === baseline.protectedScope.subjectBayId
    ) ?? baseline.network.relayIeds[0];

  const values: Record<string, string | number | undefined> = {
    "line.current_rating_a":
      relation?.currentRatingKa === undefined ? undefined : relation.currentRatingKa * 1000,
    "line.physical_length_km": relation?.physicalLengthKm,
    "line.r1_ohm": relation?.r1Ohm,
    "line.x1_ohm": relation?.x1Ohm,
    "line.r0_ohm": relation?.r0Ohm,
    "line.x0_ohm": relation?.x0Ohm,
    "ct.primary_a": relay?.ct?.primaryA,
    "ct.secondary_a": relay?.ct?.secondaryA,
    "ct.accuracy_class": relay?.ct?.accuracyClass,
    "ct.location": relay?.ct?.location,
    "vt.primary_kv": relay?.vt?.primaryKv,
    "vt.secondary_v": relay?.vt?.secondaryV,
    "vt.accuracy_class": relay?.vt?.accuracyClass,
    "vt.location": relay?.vt?.location,
    "relay.make": relay?.make,
    "relay.model": relay?.model,
  };
  return values[key];
}

function field(
  key: string,
  label: string,
  valueType: ProposedFieldValueType,
  required: boolean,
  unit?: string
): ProposedFieldDefinition {
  return { key, label, valueType, required, unit };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
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
