// SSOT-2A: executable contract for governed protection-domain data.
//
// This module deliberately does not persist anything. It defines the stable
// identities, source authority, immutable revision, proposal, approval, and
// activation semantics that a future database/repository must preserve.

export type CanonicalEntityKind =
  | "substation"
  | "voltage_level"
  | "bay"
  | "line_relation"
  | "relay_ied"
  | "relay_installation"
  | "protection_function"
  | "line_technical"
  | "instrument_transformer"
  | "network_topology"
  | "setting_package"
  | "setting_revision";

export type CanonicalEntityRef = {
  readonly kind: CanonicalEntityKind;
  readonly id: string;
};

export type DataAuthorityDomain =
  | "asset_identity"
  | "protection_topology"
  | "electrical_parameters"
  | "relay_capability"
  | "issued_setting"
  | "actual_setting"
  | "source_document";

export type DataAuthorityRule = {
  readonly domain: DataAuthorityDomain;
  readonly systemOfRecord:
    | "external_asset_registry"
    | "validated_network_model"
    | "approved_technical_registry"
    | "reviewed_vendor_library"
    | "plms_setting_lifecycle"
    | "physical_relay_readback"
    | "controlled_document_repository";
  readonly plmsRole: "reference" | "reconcile" | "govern" | "observe";
  readonly activationAuthority: string;
  readonly note: string;
};

export const DEFAULT_DATA_AUTHORITY_MATRIX: readonly DataAuthorityRule[] = [
  {
    domain: "asset_identity",
    systemOfRecord: "external_asset_registry",
    plmsRole: "reconcile",
    activationAuthority: "Asset Data Steward",
    note: "PLMS retains external IDs and aliases; it does not silently mint a competing physical-asset identity.",
  },
  {
    domain: "protection_topology",
    systemOfRecord: "validated_network_model",
    plmsRole: "govern",
    activationAuthority: "Network/Protection Data Approver",
    note: "Protection-relevant topology is versioned in PLMS and reconciled with the validated enterprise network model.",
  },
  {
    domain: "electrical_parameters",
    systemOfRecord: "approved_technical_registry",
    plmsRole: "govern",
    activationAuthority: "Technical Data Approver",
    note: "Line constants, conductor rating, and CT/VT data activate only through an approved effective revision.",
  },
  {
    domain: "relay_capability",
    systemOfRecord: "reviewed_vendor_library",
    plmsRole: "reference",
    activationAuthority: "Protection Method Library Owner",
    note: "Manual-derived capability is reviewed and versioned separately from an installed relay instance.",
  },
  {
    domain: "issued_setting",
    systemOfRecord: "plms_setting_lifecycle",
    plmsRole: "govern",
    activationAuthority: "Authorized Setting Approver/Issuer",
    note: "An approved setting is not actual until field implementation/readback evidence exists.",
  },
  {
    domain: "actual_setting",
    systemOfRecord: "physical_relay_readback",
    plmsRole: "observe",
    activationAuthority: "Field/Commissioning Engineer",
    note: "Native readback plus acquisition evidence represents the observed device state.",
  },
  {
    domain: "source_document",
    systemOfRecord: "controlled_document_repository",
    plmsRole: "reference",
    activationAuthority: "Document/Data Steward",
    note: "A document is evidence; extraction does not automatically promote its values into active canonical data.",
  },
] as const;

export type SourceObservation = {
  readonly id: string;
  readonly domain: DataAuthorityDomain;
  readonly sourceSystem: string;
  readonly externalId?: string;
  readonly capturedAt: string;
  readonly capturedBy: string;
  readonly artifactRef: string;
  readonly checksum?: { readonly algorithm: "sha256"; readonly value: string };
  readonly status: "candidate" | "accepted_evidence" | "rejected";
};

export type LineTechnicalRevisionPayload = {
  readonly type: "line_technical";
  readonly lineRelationId: string;
  readonly conductorDesignation?: string;
  readonly physicalLengthKm?: number;
  readonly currentRatingA?: number;
  readonly r1Ohm?: number;
  readonly x1Ohm?: number;
  readonly r0Ohm?: number;
  readonly x0Ohm?: number;
  readonly c1NfPerKm?: number;
  readonly c0NfPerKm?: number;
};

export type RelayInstallationRevisionPayload = {
  readonly type: "relay_installation";
  readonly bayId: string;
  readonly slotRole: "main_1" | "main_2" | "backup" | "other";
  readonly relayIedId: string;
  readonly ctRevisionId?: string;
  readonly vtRevisionId?: string;
};

export type InstrumentTransformerRevisionPayload = {
  readonly type: "instrument_transformer";
  readonly bayId: string;
  readonly transformerKind: "CT" | "VT" | "CVT";
  readonly primary: number;
  readonly secondary: number;
  readonly accuracyClass?: string;
  readonly burdenVa?: number;
  readonly polarityRef?: string;
};

export type NetworkTopologyRevisionPayload = {
  readonly type: "network_topology";
  readonly substationIds: readonly string[];
  readonly activeLineRelationIds: readonly string[];
  readonly supersededLineRelationIds: readonly string[];
  readonly changeDescription: string;
};

export type SettingRevisionPayload = {
  readonly type: "setting_revision";
  readonly settingPackageId: string;
  readonly endpointBayId: string;
  readonly relayInstallationRevisionId: string;
  readonly canonicalParameterSetRef: string;
  readonly issuedDocumentRef?: string;
};

export type CanonicalRevisionPayload =
  | LineTechnicalRevisionPayload
  | RelayInstallationRevisionPayload
  | InstrumentTransformerRevisionPayload
  | NetworkTopologyRevisionPayload
  | SettingRevisionPayload;

export type RevisionState =
  | "draft"
  | "submitted"
  | "approved"
  | "scheduled"
  | "active"
  | "superseded"
  | "rejected"
  | "cancelled";

export type GovernedRevision<TPayload extends CanonicalRevisionPayload = CanonicalRevisionPayload> = {
  readonly id: string;
  readonly entity: CanonicalEntityRef;
  readonly revisionNumber: number;
  readonly predecessorRevisionId?: string;
  readonly caseId: string;
  readonly state: RevisionState;
  readonly payload: TPayload;
  readonly sourceEvidenceIds: readonly string[];
  readonly createdAt: string;
  readonly createdBy: string;
  readonly approvedAt?: string;
  readonly approvedBy?: string;
  readonly validFrom?: string;
  readonly validTo?: string;
  readonly fingerprint: string;
};

export type GovernedFieldChange = {
  readonly fieldPath: string;
  readonly beforeValue: unknown;
  readonly proposedValue: unknown;
  readonly unit?: string;
  readonly sourceEvidenceIds: readonly string[];
};

export type ActivationPolicy =
  | "commissioning"
  | "approved_effective_date"
  | "manual_controlled";

export type DataChangeProposalStatus =
  | "draft"
  | "ready"
  | "submitted"
  | "approved"
  | "rejected"
  | "cancelled"
  | "activated";

export type DataChangeProposal = {
  readonly id: string;
  readonly caseId: string;
  readonly target: CanonicalEntityRef;
  readonly baselineRevisionId: string;
  readonly proposedRevisionId: string;
  readonly reason: string;
  readonly fieldChanges: readonly GovernedFieldChange[];
  readonly sourceEvidenceIds: readonly string[];
  readonly activationPolicy: ActivationPolicy;
  readonly plannedEffectiveAt?: string;
  readonly status: DataChangeProposalStatus;
  readonly validation: {
    readonly valid: boolean;
    readonly errors: readonly string[];
  };
  readonly createdAt: string;
  readonly createdBy: string;
  readonly submittedAt?: string;
  readonly approvedAt?: string;
  readonly approvedBy?: string;
  readonly activatedAt?: string;
  readonly fingerprint: string;
};

export type ActivationTrigger =
  | "commissioning"
  | "effective_date"
  | "manual_controlled";

export type DataActivationEvent = {
  readonly id: string;
  readonly proposalId: string;
  readonly caseId: string;
  readonly entity: CanonicalEntityRef;
  readonly activatedRevisionId: string;
  readonly supersededRevisionId?: string;
  readonly trigger: ActivationTrigger;
  readonly activatedAt: string;
  readonly activatedBy: string;
  readonly evidenceIds: readonly string[];
};

export type EffectiveRevisionResolution<TPayload extends CanonicalRevisionPayload = CanonicalRevisionPayload> = {
  readonly revision?: GovernedRevision<TPayload>;
  readonly conflicts: readonly string[];
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)])
    );
  }
  return value;
}

function fingerprint(value: unknown): string {
  const text = JSON.stringify(stableValue(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function sameEntity(a: CanonicalEntityRef, b: CanonicalEntityRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function valueEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(stableValue(a)) === JSON.stringify(stableValue(b));
}

function payloadEntityKind(payload: CanonicalRevisionPayload): CanonicalEntityKind {
  const mapping: Record<CanonicalRevisionPayload["type"], CanonicalEntityKind> = {
    line_technical: "line_technical",
    relay_installation: "relay_installation",
    instrument_transformer: "instrument_transformer",
    network_topology: "network_topology",
    setting_revision: "setting_revision",
  };
  return mapping[payload.type];
}

export function authorityRuleFor(domain: DataAuthorityDomain): DataAuthorityRule {
  const rule = DEFAULT_DATA_AUTHORITY_MATRIX.find((item) => item.domain === domain);
  if (!rule) throw new Error(`Authority rule tidak ditemukan untuk ${domain}.`);
  return rule;
}

export function createGovernedRevision<TPayload extends CanonicalRevisionPayload>(input: {
  id: string;
  entity: CanonicalEntityRef;
  revisionNumber: number;
  predecessorRevisionId?: string;
  caseId: string;
  payload: TPayload;
  sourceEvidenceIds: readonly string[];
  createdAt: string;
  createdBy: string;
  state?: Extract<RevisionState, "draft" | "submitted">;
}): GovernedRevision<TPayload> {
  if (!input.id || !input.entity.id || !input.caseId) {
    throw new Error("Revision membutuhkan id, stable entity id, dan case id.");
  }
  if (!Number.isInteger(input.revisionNumber) || input.revisionNumber < 1) {
    throw new Error("Revision number harus integer positif.");
  }
  if (payloadEntityKind(input.payload) !== input.entity.kind) {
    throw new Error(
      `Payload ${input.payload.type} tidak cocok dengan entity kind ${input.entity.kind}.`
    );
  }
  const evidence = unique(input.sourceEvidenceIds);
  if (evidence.length === 0) {
    throw new Error("Governed revision membutuhkan minimal satu source evidence.");
  }
  const content = {
    id: input.id,
    entity: input.entity,
    revisionNumber: input.revisionNumber,
    predecessorRevisionId: input.predecessorRevisionId,
    caseId: input.caseId,
    payload: input.payload,
    sourceEvidenceIds: evidence,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  };
  return {
    ...content,
    state: input.state ?? "draft",
    fingerprint: fingerprint(content),
  };
}

export function validateRevisionChain(
  revisions: readonly GovernedRevision[]
): readonly string[] {
  const errors: string[] = [];
  const byId = new Map(revisions.map((revision) => [revision.id, revision]));
  const uniqueEntityRevisions = new Set<string>();
  for (const revision of revisions) {
    const key = `${revision.entity.kind}:${revision.entity.id}:${revision.revisionNumber}`;
    if (uniqueEntityRevisions.has(key)) {
      errors.push(`Duplicate revision number ${revision.revisionNumber} untuk ${revision.entity.id}.`);
    }
    uniqueEntityRevisions.add(key);
    if (revision.predecessorRevisionId) {
      const predecessor = byId.get(revision.predecessorRevisionId);
      if (!predecessor) {
        errors.push(`Predecessor ${revision.predecessorRevisionId} tidak ditemukan.`);
      } else if (!sameEntity(predecessor.entity, revision.entity)) {
        errors.push(`Predecessor ${predecessor.id} menunjuk entity yang berbeda.`);
      } else if (predecessor.revisionNumber >= revision.revisionNumber) {
        errors.push(`Revision ${revision.id} tidak lebih baru dari predecessor.`);
      }
    }
  }
  return errors;
}

export function resolveEffectiveRevision<TPayload extends CanonicalRevisionPayload>(
  revisions: readonly GovernedRevision<TPayload>[],
  entity: CanonicalEntityRef,
  at: string
): EffectiveRevisionResolution<TPayload> {
  const instant = new Date(at).getTime();
  if (Number.isNaN(instant)) return { conflicts: [`Timestamp tidak valid: ${at}.`] };
  const candidates = revisions.filter((revision) => {
    if (!sameEntity(revision.entity, entity) || revision.state !== "active") return false;
    const from = revision.validFrom ? new Date(revision.validFrom).getTime() : -Infinity;
    const to = revision.validTo ? new Date(revision.validTo).getTime() : Infinity;
    return instant >= from && instant < to;
  });
  if (candidates.length === 0) return { conflicts: [] };
  if (candidates.length > 1) {
    return {
      conflicts: [
        `Lebih dari satu active revision berlaku untuk ${entity.kind}:${entity.id}: ${candidates
          .map((item) => item.id)
          .join(", ")}.`,
      ],
    };
  }
  return { revision: candidates[0], conflicts: [] };
}

export function createDataChangeProposal(input: {
  id: string;
  caseId: string;
  target: CanonicalEntityRef;
  baselineRevisionId: string;
  proposedRevisionId: string;
  reason: string;
  fieldChanges: readonly GovernedFieldChange[];
  sourceEvidenceIds: readonly string[];
  activationPolicy: ActivationPolicy;
  plannedEffectiveAt?: string;
  createdAt: string;
  createdBy: string;
}): DataChangeProposal {
  const errors: string[] = [];
  const evidence = unique(input.sourceEvidenceIds);
  if (!input.id || !input.caseId || !input.target.id) {
    errors.push("Proposal membutuhkan id, case id, dan stable target id.");
  }
  if (!input.baselineRevisionId) errors.push("Baseline revision wajib dipilih.");
  if (!input.proposedRevisionId) errors.push("Proposed revision wajib dipilih.");
  if (input.baselineRevisionId === input.proposedRevisionId) {
    errors.push("Proposed revision tidak boleh sama dengan baseline revision.");
  }
  if (!input.reason.trim()) errors.push("Alasan perubahan wajib diisi.");
  if (input.fieldChanges.length === 0) errors.push("Minimal satu field change diperlukan.");
  if (evidence.length === 0) errors.push("Minimal satu source evidence diperlukan.");
  for (const change of input.fieldChanges) {
    if (!change.fieldPath) errors.push("Setiap field change membutuhkan field path.");
    if (valueEqual(change.beforeValue, change.proposedValue)) {
      errors.push(`${change.fieldPath} tidak memiliki perubahan nilai.`);
    }
    if (change.sourceEvidenceIds.length === 0) {
      errors.push(`${change.fieldPath} belum memiliki source evidence.`);
    }
    for (const evidenceId of change.sourceEvidenceIds) {
      if (!evidence.includes(evidenceId)) {
        errors.push(`${change.fieldPath} mereferensikan evidence di luar proposal: ${evidenceId}.`);
      }
    }
  }
  if (
    input.activationPolicy === "approved_effective_date" &&
    !input.plannedEffectiveAt
  ) {
    errors.push("Planned effective date wajib untuk approved-effective-date activation.");
  }
  if (
    input.plannedEffectiveAt &&
    Number.isNaN(new Date(input.plannedEffectiveAt).getTime())
  ) {
    errors.push("Planned effective date tidak valid.");
  }
  const content = {
    id: input.id,
    caseId: input.caseId,
    target: input.target,
    baselineRevisionId: input.baselineRevisionId,
    proposedRevisionId: input.proposedRevisionId,
    reason: input.reason.trim(),
    fieldChanges: input.fieldChanges,
    sourceEvidenceIds: evidence,
    activationPolicy: input.activationPolicy,
    plannedEffectiveAt: input.plannedEffectiveAt,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  };
  return {
    ...content,
    status: errors.length === 0 ? "ready" : "draft",
    validation: { valid: errors.length === 0, errors },
    fingerprint: fingerprint(content),
  };
}

export function submitDataChangeProposal(
  proposal: DataChangeProposal,
  submittedAt: string
): DataChangeProposal {
  if (proposal.status !== "ready" || !proposal.validation.valid) {
    throw new Error("Hanya proposal ready yang dapat disubmit.");
  }
  return { ...proposal, status: "submitted", submittedAt };
}

export function approveDataChangeProposal<TPayload extends CanonicalRevisionPayload>(input: {
  proposal: DataChangeProposal;
  proposedRevision: GovernedRevision<TPayload>;
  approvedAt: string;
  approvedBy: string;
}): {
  proposal: DataChangeProposal;
  revision: GovernedRevision<TPayload>;
} {
  if (input.proposal.status !== "submitted") {
    throw new Error("Proposal harus submitted sebelum approval.");
  }
  if (input.proposal.proposedRevisionId !== input.proposedRevision.id) {
    throw new Error("Proposed revision tidak cocok dengan proposal.");
  }
  if (!sameEntity(input.proposal.target, input.proposedRevision.entity)) {
    throw new Error("Target proposal tidak cocok dengan entity revision.");
  }
  if (input.approvedBy === input.proposal.createdBy) {
    throw new Error("Creator proposal tidak boleh menyetujui proposal yang sama.");
  }
  return {
    proposal: {
      ...input.proposal,
      status: "approved",
      approvedAt: input.approvedAt,
      approvedBy: input.approvedBy,
    },
    revision: {
      ...input.proposedRevision,
      state: input.proposal.plannedEffectiveAt ? "scheduled" : "approved",
      approvedAt: input.approvedAt,
      approvedBy: input.approvedBy,
    },
  };
}

export type ActivateProposalResult<TPayload extends CanonicalRevisionPayload> =
  | {
      readonly ok: true;
      readonly proposal: DataChangeProposal;
      readonly activatedRevision: GovernedRevision<TPayload>;
      readonly supersededRevision?: GovernedRevision<TPayload>;
      readonly revisions: readonly GovernedRevision<TPayload>[];
      readonly event: DataActivationEvent;
    }
  | { readonly ok: false; readonly errors: readonly string[] };

export function activateApprovedProposal<TPayload extends CanonicalRevisionPayload>(input: {
  proposal: DataChangeProposal;
  proposedRevision: GovernedRevision<TPayload>;
  existingRevisions: readonly GovernedRevision<TPayload>[];
  trigger: ActivationTrigger;
  activatedAt: string;
  activatedBy: string;
  evidenceIds: readonly string[];
  eventId: string;
}): ActivateProposalResult<TPayload> {
  const errors: string[] = [];
  const evidence = unique(input.evidenceIds);
  if (input.proposal.status !== "approved") errors.push("Proposal belum approved.");
  if (input.proposal.proposedRevisionId !== input.proposedRevision.id) {
    errors.push("Revision activation tidak cocok dengan proposal.");
  }
  if (!sameEntity(input.proposal.target, input.proposedRevision.entity)) {
    errors.push("Entity activation tidak cocok dengan target proposal.");
  }
  if (!input.eventId || !input.activatedBy) {
    errors.push("Activation membutuhkan event id dan actor.");
  }
  if (Number.isNaN(new Date(input.activatedAt).getTime())) {
    errors.push("Activation timestamp tidak valid.");
  }
  if (!["approved", "scheduled"].includes(input.proposedRevision.state)) {
    errors.push("Proposed revision belum approved/scheduled untuk activation.");
  }
  const expectedTrigger: Record<ActivationPolicy, ActivationTrigger> = {
    commissioning: "commissioning",
    approved_effective_date: "effective_date",
    manual_controlled: "manual_controlled",
  };
  if (expectedTrigger[input.proposal.activationPolicy] !== input.trigger) {
    errors.push(
      `Activation policy ${input.proposal.activationPolicy} membutuhkan trigger ${expectedTrigger[input.proposal.activationPolicy]}.`
    );
  }
  if (input.proposal.activationPolicy === "commissioning" && evidence.length === 0) {
    errors.push("Commissioning activation membutuhkan implementation/readback evidence.");
  }
  if (
    input.proposal.activationPolicy === "approved_effective_date" &&
    input.proposal.plannedEffectiveAt &&
    new Date(input.activatedAt).getTime() < new Date(input.proposal.plannedEffectiveAt).getTime()
  ) {
    errors.push("Revision belum boleh aktif sebelum planned effective date.");
  }
  if (errors.length > 0) return { ok: false, errors };

  const currentResolution = resolveEffectiveRevision(
    input.existingRevisions,
    input.proposal.target,
    input.activatedAt
  );
  if (currentResolution.conflicts.length > 0) {
    return { ok: false, errors: currentResolution.conflicts };
  }
  const current = currentResolution.revision;
  if (!current) {
    return {
      ok: false,
      errors: [
        `Baseline drift: tidak ada active revision untuk ${input.proposal.target.kind}:${input.proposal.target.id} pada waktu activation.`,
      ],
    };
  }
  if (current && current.id !== input.proposal.baselineRevisionId) {
    return {
      ok: false,
      errors: [
        `Baseline drift: proposal memakai ${input.proposal.baselineRevisionId}, active revision saat activation adalah ${current.id}.`,
      ],
    };
  }
  const supersededRevision = current
    ? { ...current, state: "superseded" as const, validTo: input.activatedAt }
    : undefined;
  const activatedRevision: GovernedRevision<TPayload> = {
    ...input.proposedRevision,
    state: "active",
    validFrom: input.activatedAt,
    validTo: undefined,
  };
  const revisions = input.existingRevisions
    .filter((revision) => revision.id !== current?.id && revision.id !== activatedRevision.id)
    .concat(
      ...(supersededRevision ? [supersededRevision] : []),
      activatedRevision
    );
  const event: DataActivationEvent = {
    id: input.eventId,
    proposalId: input.proposal.id,
    caseId: input.proposal.caseId,
    entity: input.proposal.target,
    activatedRevisionId: activatedRevision.id,
    supersededRevisionId: supersededRevision?.id,
    trigger: input.trigger,
    activatedAt: input.activatedAt,
    activatedBy: input.activatedBy,
    evidenceIds: evidence,
  };
  return {
    ok: true,
    proposal: {
      ...input.proposal,
      status: "activated",
      activatedAt: input.activatedAt,
    },
    activatedRevision,
    supersededRevision,
    revisions,
    event,
  };
}
