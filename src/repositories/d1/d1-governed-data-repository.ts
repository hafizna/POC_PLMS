// SSOT-2D.1 slice 2: D1-shaped GovernedDataRepository. The hard half of
// SSOT-2C's repository ports — activate() must be one atomic transaction
// per the interface's own doc comment. This adapter does not re-implement
// any business rule: `activateApprovedProposal()` in ssot-governance.ts
// already computes baseline-drift checks, trigger validation, and
// commissioning-evidence requirements. This file's only job is to load the
// rows that function needs, hand them to it unmodified, and persist its
// already-validated result atomically.
import {
  activateApprovedProposal,
  type CanonicalEntityRef,
  type CanonicalRevisionPayload,
  type DataActivationEvent,
  type DataChangeProposal,
  type EffectiveRevisionResolution,
  type GovernedRevision,
  resolveEffectiveRevision,
} from "../../domain/ssot-governance";
import {
  RepositoryConflictError,
  type GovernedActivationCommand,
  type GovernedActivationCommit,
  type GovernedDataRepository,
  type RepositoryWriteOptions,
  type RepositoryWriteResult,
} from "../protection-lifecycle-repository";
import type { SqlDriver, SqlStatement } from "./sql-driver";

type GovernedRevisionRow = {
  readonly id: string;
  readonly entity_id: string;
  readonly entity_kind: string;
  readonly revision_number: number;
  readonly predecessor_revision_id: string | null;
  readonly case_id: string;
  readonly state: string;
  readonly payload_type: string;
  readonly payload_json: string;
  readonly source_evidence_ids: string;
  readonly created_at: string;
  readonly created_by: string;
  readonly approved_at: string | null;
  readonly approved_by: string | null;
  readonly valid_from: string | null;
  readonly valid_to: string | null;
  readonly fingerprint: string;
};

type DataChangeProposalRow = {
  readonly id: string;
  readonly case_id: string;
  readonly target_entity_id: string;
  readonly target_entity_kind: string;
  readonly baseline_revision_id: string;
  readonly proposed_revision_id: string;
  readonly reason: string;
  readonly field_changes_json: string;
  readonly source_evidence_ids: string;
  readonly activation_policy: string;
  readonly planned_effective_at: string | null;
  readonly status: string;
  readonly validation_json: string;
  readonly created_at: string;
  readonly created_by: string;
  readonly submitted_at: string | null;
  readonly approved_at: string | null;
  readonly approved_by: string | null;
  readonly activated_at: string | null;
  readonly fingerprint: string;
  readonly row_version: number;
};

function revisionFromRow(row: GovernedRevisionRow): GovernedRevision {
  const base: GovernedRevision = {
    id: row.id,
    entity: { kind: row.entity_kind as CanonicalEntityRef["kind"], id: row.entity_id },
    revisionNumber: row.revision_number,
    predecessorRevisionId: row.predecessor_revision_id ?? undefined,
    caseId: row.case_id,
    state: row.state as GovernedRevision["state"],
    payload: JSON.parse(row.payload_json) as CanonicalRevisionPayload,
    sourceEvidenceIds: JSON.parse(row.source_evidence_ids),
    createdAt: row.created_at,
    createdBy: row.created_by,
    fingerprint: row.fingerprint,
  };
  return {
    ...base,
    approvedAt: row.approved_at ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    validFrom: row.valid_from ?? undefined,
    validTo: row.valid_to ?? undefined,
  };
}

function revisionToRow(revision: GovernedRevision): GovernedRevisionRow {
  return {
    id: revision.id,
    entity_id: revision.entity.id,
    entity_kind: revision.entity.kind,
    revision_number: revision.revisionNumber,
    predecessor_revision_id: revision.predecessorRevisionId ?? null,
    case_id: revision.caseId,
    state: revision.state,
    payload_type: revision.payload.type,
    payload_json: JSON.stringify(revision.payload),
    source_evidence_ids: JSON.stringify(revision.sourceEvidenceIds),
    created_at: revision.createdAt,
    created_by: revision.createdBy,
    approved_at: revision.approvedAt ?? null,
    approved_by: revision.approvedBy ?? null,
    valid_from: revision.validFrom ?? null,
    valid_to: revision.validTo ?? null,
    fingerprint: revision.fingerprint,
  };
}

function proposalFromRow(row: DataChangeProposalRow): DataChangeProposal {
  return {
    id: row.id,
    caseId: row.case_id,
    target: { kind: row.target_entity_kind as CanonicalEntityRef["kind"], id: row.target_entity_id },
    baselineRevisionId: row.baseline_revision_id,
    proposedRevisionId: row.proposed_revision_id,
    reason: row.reason,
    fieldChanges: JSON.parse(row.field_changes_json),
    sourceEvidenceIds: JSON.parse(row.source_evidence_ids),
    activationPolicy: row.activation_policy as DataChangeProposal["activationPolicy"],
    plannedEffectiveAt: row.planned_effective_at ?? undefined,
    status: row.status as DataChangeProposal["status"],
    validation: JSON.parse(row.validation_json),
    createdAt: row.created_at,
    createdBy: row.created_by,
    submittedAt: row.submitted_at ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    activatedAt: row.activated_at ?? undefined,
    fingerprint: row.fingerprint,
  };
}

function proposalToRow(proposal: DataChangeProposal, rowVersion: number): DataChangeProposalRow {
  return {
    id: proposal.id,
    case_id: proposal.caseId,
    target_entity_id: proposal.target.id,
    target_entity_kind: proposal.target.kind,
    baseline_revision_id: proposal.baselineRevisionId,
    proposed_revision_id: proposal.proposedRevisionId,
    reason: proposal.reason,
    field_changes_json: JSON.stringify(proposal.fieldChanges),
    source_evidence_ids: JSON.stringify(proposal.sourceEvidenceIds),
    activation_policy: proposal.activationPolicy,
    planned_effective_at: proposal.plannedEffectiveAt ?? null,
    status: proposal.status,
    validation_json: JSON.stringify(proposal.validation),
    created_at: proposal.createdAt,
    created_by: proposal.createdBy,
    submitted_at: proposal.submittedAt ?? null,
    approved_at: proposal.approvedAt ?? null,
    approved_by: proposal.approvedBy ?? null,
    activated_at: proposal.activatedAt ?? null,
    fingerprint: proposal.fingerprint,
    row_version: rowVersion,
  };
}

function versionLabel(rowVersion: number): string {
  return `v${rowVersion}`;
}

export class D1GovernedDataRepository implements GovernedDataRepository {
  constructor(private readonly driver: SqlDriver) {}

  async listRevisions(entity: CanonicalEntityRef): Promise<readonly GovernedRevision[]> {
    const { results } = await this.driver
      .prepare(
        "SELECT * FROM governed_revision WHERE entity_id = ? AND entity_kind = ? ORDER BY revision_number ASC"
      )
      .bind(entity.id, entity.kind)
      .all<GovernedRevisionRow>();
    return results.map(revisionFromRow);
  }

  async resolveEffective(
    entity: CanonicalEntityRef,
    at: string
  ): Promise<EffectiveRevisionResolution> {
    const revisions = await this.listRevisions(entity);
    return resolveEffectiveRevision(revisions, entity, at);
  }

  async saveDraftRevision<TPayload extends CanonicalRevisionPayload>(
    revision: GovernedRevision<TPayload>,
    _options?: RepositoryWriteOptions
  ): Promise<RepositoryWriteResult<GovernedRevision<TPayload>>> {
    // Upsert by id, not insert-only: the *content* of a revision (payload,
    // predecessor, entity) is immutable once created — SSOT-2A never
    // mutates a payload in place — but its *state* legitimately transitions
    // in storage (draft -> approved/scheduled -> active -> superseded) via
    // approveDataChangeProposal()/activateApprovedProposal() returning an
    // updated copy of the same revision id. Rejecting a re-save on conflict
    // would make saveDraftRevision() unusable for anything past the first
    // "draft" write.
    await this.driver
      .prepare(
        `INSERT INTO canonical_entity (id, kind, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO NOTHING`
      )
      .bind(revision.entity.id, revision.entity.kind, revision.createdAt)
      .run();

    const row = revisionToRow(revision);
    await this.driver
      .prepare(
        `INSERT INTO governed_revision (
          id, entity_id, entity_kind, revision_number, predecessor_revision_id,
          case_id, state, payload_type, payload_json, source_evidence_ids,
          created_at, created_by, approved_at, approved_by, valid_from,
          valid_to, fingerprint
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          state = excluded.state,
          approved_at = excluded.approved_at,
          approved_by = excluded.approved_by,
          valid_from = excluded.valid_from,
          valid_to = excluded.valid_to,
          fingerprint = excluded.fingerprint`
      )
      .bind(
        row.id,
        row.entity_id,
        row.entity_kind,
        row.revision_number,
        row.predecessor_revision_id,
        row.case_id,
        row.state,
        row.payload_type,
        row.payload_json,
        row.source_evidence_ids,
        row.created_at,
        row.created_by,
        row.approved_at,
        row.approved_by,
        row.valid_from,
        row.valid_to,
        row.fingerprint
      )
      .run();
    // Re-read rather than returning the input reference, so a caller
    // mutating the object it passed in cannot appear to mutate stored
    // state — same detached-read guarantee saveProposal()/save() give.
    const stored = await this.driver
      .prepare("SELECT * FROM governed_revision WHERE id = ?")
      .bind(revision.id)
      .first<GovernedRevisionRow>();
    if (!stored) {
      throw new Error(`Revision ${revision.id} tidak ditemukan setelah saveDraftRevision().`);
    }
    return {
      record: revisionFromRow(stored) as GovernedRevision<TPayload>,
      version: stored.fingerprint,
    };
  }

  async saveProposal(
    proposal: DataChangeProposal,
    options: RepositoryWriteOptions = {}
  ): Promise<RepositoryWriteResult<DataChangeProposal>> {
    const existing = await this.driver
      .prepare("SELECT row_version FROM data_change_proposal WHERE id = ?")
      .bind(proposal.id)
      .first<{ row_version: number }>();
    const currentVersion = existing ? versionLabel(existing.row_version) : undefined;
    if (
      options.expectedVersion !== undefined &&
      options.expectedVersion !== currentVersion
    ) {
      throw new RepositoryConflictError(
        `Data Change Proposal ${proposal.id} berubah: expected ${options.expectedVersion}, current ${currentVersion ?? "missing"}.`
      );
    }

    const nextVersion = (existing?.row_version ?? 0) + 1;
    const row = proposalToRow(proposal, nextVersion);

    if (existing) {
      const result = await this.driver
        .prepare(
          `UPDATE data_change_proposal SET
            case_id = ?, target_entity_id = ?, target_entity_kind = ?,
            baseline_revision_id = ?, proposed_revision_id = ?, reason = ?,
            field_changes_json = ?, source_evidence_ids = ?,
            activation_policy = ?, planned_effective_at = ?, status = ?,
            validation_json = ?, submitted_at = ?, approved_at = ?,
            approved_by = ?, activated_at = ?, fingerprint = ?,
            row_version = ?
          WHERE id = ? AND row_version = ?`
        )
        .bind(
          row.case_id,
          row.target_entity_id,
          row.target_entity_kind,
          row.baseline_revision_id,
          row.proposed_revision_id,
          row.reason,
          row.field_changes_json,
          row.source_evidence_ids,
          row.activation_policy,
          row.planned_effective_at,
          row.status,
          row.validation_json,
          row.submitted_at,
          row.approved_at,
          row.approved_by,
          row.activated_at,
          row.fingerprint,
          row.row_version,
          row.id,
          existing.row_version
        )
        .run();
      if (result.changes === 0) {
        throw new RepositoryConflictError(
          `Data Change Proposal ${proposal.id} berubah bersamaan (concurrent write terdeteksi saat UPDATE).`
        );
      }
    } else {
      await this.driver
        .prepare(
          `INSERT INTO data_change_proposal (
            id, case_id, target_entity_id, target_entity_kind,
            baseline_revision_id, proposed_revision_id, reason,
            field_changes_json, source_evidence_ids, activation_policy,
            planned_effective_at, status, validation_json, created_at,
            created_by, submitted_at, approved_at, approved_by,
            activated_at, fingerprint, row_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.id,
          row.case_id,
          row.target_entity_id,
          row.target_entity_kind,
          row.baseline_revision_id,
          row.proposed_revision_id,
          row.reason,
          row.field_changes_json,
          row.source_evidence_ids,
          row.activation_policy,
          row.planned_effective_at,
          row.status,
          row.validation_json,
          row.created_at,
          row.created_by,
          row.submitted_at,
          row.approved_at,
          row.approved_by,
          row.activated_at,
          row.fingerprint,
          row.row_version
        )
        .run();
    }

    const record = await this.getProposalById(proposal.id);
    if (!record) throw new Error(`Proposal ${proposal.id} tidak ditemukan setelah save().`);
    return { record, version: versionLabel(nextVersion) };
  }

  async activate(command: GovernedActivationCommand): Promise<GovernedActivationCommit> {
    const proposalRow = await this.driver
      .prepare("SELECT * FROM data_change_proposal WHERE id = ?")
      .bind(command.proposalId)
      .first<DataChangeProposalRow>();
    if (!proposalRow) {
      throw new Error(`Proposal ${command.proposalId} tidak ditemukan.`);
    }
    const proposal = proposalFromRow(proposalRow);

    const proposedRevisionRow = await this.driver
      .prepare("SELECT * FROM governed_revision WHERE id = ?")
      .bind(command.proposedRevisionId)
      .first<GovernedRevisionRow>();
    if (!proposedRevisionRow) {
      throw new Error(`Proposed revision ${command.proposedRevisionId} tidak ditemukan.`);
    }
    const proposedRevision = revisionFromRow(proposedRevisionRow);

    // resolveEffectiveRevision inside activateApprovedProposal() needs every
    // existing revision for this entity to detect baseline drift and
    // multiple-active conflicts — not just the one row named by the
    // baseline id, since drift is exactly "something else became active".
    const existingRevisions = await this.listRevisions(proposal.target);

    // activateApprovedProposal() is the single source of truth for whether
    // this activation is allowed. This adapter adds no additional business
    // rule beyond what that function already checks (baseline drift,
    // trigger/policy match, commissioning evidence, revision state).
    const result = activateApprovedProposal({
      proposal,
      proposedRevision,
      existingRevisions,
      trigger: command.trigger,
      activatedAt: command.activatedAt,
      activatedBy: command.activatedBy,
      evidenceIds: command.evidenceIds,
      eventId: `activation_${command.proposalId}_${command.activatedAt}`,
    });
    if (!result.ok) {
      throw new Error(`Activation ditolak: ${result.errors.join("; ")}`);
    }
    if (proposal.baselineRevisionId !== command.expectedBaselineRevisionId) {
      // Defense in depth: the command's caller asserted what baseline it
      // expected when it decided to activate; if that no longer matches
      // the proposal's own baseline binding, something raced between
      // decision and execution even though activateApprovedProposal()'s
      // own drift check (against *current active* revision) passed.
      throw new RepositoryConflictError(
        `Activation command's expected baseline (${command.expectedBaselineRevisionId}) tidak cocok dengan proposal baseline (${proposal.baselineRevisionId}).`
      );
    }

    const statements: SqlStatement[] = [];

    if (result.supersededRevision) {
      statements.push(
        this.driver
          .prepare("UPDATE governed_revision SET state = ?, valid_to = ? WHERE id = ?")
          .bind(result.supersededRevision.state, result.supersededRevision.validTo ?? null, result.supersededRevision.id)
      );
    }
    statements.push(
      this.driver
        .prepare("UPDATE governed_revision SET state = ?, valid_from = ?, valid_to = ? WHERE id = ?")
        .bind(
          result.activatedRevision.state,
          result.activatedRevision.validFrom ?? null,
          result.activatedRevision.validTo ?? null,
          result.activatedRevision.id
        )
    );
    statements.push(
      this.driver
        .prepare("UPDATE data_change_proposal SET status = ?, activated_at = ?, row_version = row_version + 1 WHERE id = ?")
        .bind(result.proposal.status, result.proposal.activatedAt ?? null, result.proposal.id)
    );
    const event: DataActivationEvent = result.event;
    statements.push(
      this.driver
        .prepare(
          `INSERT INTO data_activation_event (
            id, proposal_id, case_id, entity_id, entity_kind,
            activated_revision_id, superseded_revision_id, trigger,
            activated_at, activated_by, evidence_ids
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          event.id,
          event.proposalId,
          event.caseId,
          event.entity.id,
          event.entity.kind,
          event.activatedRevisionId,
          event.supersededRevisionId ?? null,
          event.trigger,
          event.activatedAt,
          event.activatedBy,
          JSON.stringify(event.evidenceIds)
        )
    );

    await this.driver.batch(statements);

    return {
      proposal: result.proposal,
      activatedRevision: result.activatedRevision,
      supersededRevision: result.supersededRevision,
      event: result.event,
    };
  }

  private async getProposalById(id: string): Promise<DataChangeProposal | undefined> {
    const row = await this.driver
      .prepare("SELECT * FROM data_change_proposal WHERE id = ?")
      .bind(id)
      .first<DataChangeProposalRow>();
    return row ? proposalFromRow(row) : undefined;
  }
}
