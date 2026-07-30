import type { SettingCaseBaseline } from "./case-baseline";
import type { ChangeItem, ChangeItemKind, SettingCase } from "./setting-case";

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
  const baselineEvidenceIds = new Set(
    input.baseline.evidence.map((item) => item.sourceIntakeId)
  );
  const sourceEvidenceIds = unique(input.draft.sourceEvidenceIds).filter((id) =>
    baselineEvidenceIds.has(id)
  );

  if (sourceEvidenceIds.length === 0) {
    errors.push("Pilih minimal satu evidence dari baseline beku.");
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
    fieldChanges.push({
      fieldKey: definition.key,
      label: definition.label,
      valueType: definition.valueType,
      unit: definition.unit,
      beforeValue: baselineValueForField(input.baseline, definition.key),
      proposedValue,
    });
  }

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
      valid: errors.length === 0,
      errors,
    },
  };

  return {
    id: input.id,
    ...payload,
    status: errors.length === 0 ? "ready_for_impact" : "draft",
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    fingerprint: {
      algorithm: "fnv1a32",
      value: fnv1a32(stableStringify(payload)),
    },
  };
}

function baselineValueForField(
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
