# ADR-0001: SSOT-2D.0 — Persistence and Authority Design

Status: draft for review
Date: 2026-08-03
Scope: SSOT-2D.0 per `DEVELOPMENT_HANDOFF.md` §7 and `BUSINESS_PROCESS_BLUEPRINT.md`
§13. This is a design document only. It does not provision a database, does not
change application code, and is not itself SSOT-2D.1.

## 1. Why this document exists

`DEVELOPMENT_HANDOFF.md` and `BUSINESS_PROCESS_BLUEPRINT.md` both gate
SSOT-2D.0 behind two things: an ADR/ERD, and a recap of open business
decisions with the product owner. This document does both, but the business
decisions in §3 are recorded as **explicit assumptions**, not confirmed
answers — they are the fastest way to keep ERD design moving, and every one
of them must be revisited before SSOT-2D.1 writes real schema. Do not treat
any line in §3 as settled.

## 2. Decision: Cloudflare D1

**Decision: D1, not PostgreSQL, for SSOT-2D.1/2D.2.**

Reasoning, in order of weight:

1. **The app is already a Cloudflare Worker.** `CLOUDFLARE_DEPLOYMENT.md`
   documents a live deployment (`plms-poc-protected`) using Workers + Static
   Assets, and `wrangler` is already a devDependency. A D1 database binds
   directly into the same Worker with zero network hop; PostgreSQL would
   require either Hyperdrive (extra moving part, extra latency budget, extra
   secret to manage) or moving compute off Workers entirely.
2. **Write volume is low and structured.** This is a governed lifecycle
   system (cases, revisions, proposals, activations) — not a high-throughput
   telemetry or analytics system. D1's SQLite-per-database model and current
   scaling ceiling are not a constraint at this product's actual write rate.
3. **Atomicity requirement is satisfiable.** SSOT-2A's
   `activateApprovedProposal()` and the `GovernedDataRepository.activate()`
   port both require one atomic transaction: validate baseline → activate →
   supersede → append event. D1 supports transactional batches
   (`db.batch()`) sufficient for this; the domain layer already returns a
   single commit payload (`GovernedActivationCommit`) shaped for exactly one
   write.
4. **Operational simplicity for a pilot.** One ULTG pilot with a bounded
   dataset (§5.2 of the handoff: ANGKE–ANCOL plus one P545 case, one
   crosscheck case) does not need PostgreSQL's relational feature depth
   (window functions, extensions, replication topologies). D1 keeps the
   pilot on one platform, one auth model (Cloudflare Access, already flagged
   as the upgrade path from Basic Auth), one deploy pipeline.

**When to revisit this decision**: if SSOT-2D.2 requirements grow to need
row-level multi-tenant RBAC enforced at the database layer, heavy
cross-entity relational queries (e.g. ad-hoc impact-analysis joins across
thousands of revisions), or if UIT/corporate scale-up requires a
database not tied to one Cloudflare account — those are the concrete
triggers to reopen this ADR, not a default preference for either engine.

## 3. Assumptions standing in for confirmed business decisions

Per `DEVELOPMENT_HANDOFF.md` §6 and `BUSINESS_PROCESS_BLUEPRINT.md` §14, the
following must be confirmed with the product owner before SSOT-2D.1 schema
is finalized. Each assumption below is marked `ASSUMPTION — PENDING REVIEW`
and exists only so the ERD in §4 has concrete field types and relations to
work from.

1. **Canonical identity source.** `ASSUMPTION — PENDING REVIEW`: PLMS
   generates and owns its own canonical entity IDs (`CanonicalEntityRef.id`)
   for the pilot; external asset-registry IDs (PST or equivalent) are stored
   as an optional external-reference field on the entity, not as the primary
   key. Rationale: no external asset registry is integrated today (per
   `BUSINESS_PROCESS_BLUEPRINT.md` §6, "external_asset_registry" is named as
   system-of-record in the target model but has no current integration).
   Reconciliation against a real external ID becomes a later migration, not
   a blocker now.
2. **UPT vs UIT authority per case type.** `ASSUMPTION — PENDING REVIEW`:
   for the pilot, one `CaseFlowProfile` per case (already implemented,
   `src/domain/case-flow-hardening.ts:52`) is sufficient — maker/checker/
   approver roles are recorded as free-text role labels, not resolved
   against a real org-directory table. A dedicated `Organization`/`Role`
   table is deferred to SSOT-2D.2 when server-side identity exists.
3. **Exact state-transition ownership.** `ASSUMPTION — PENDING REVIEW`: the
   `SettingCaseStage` enum already in `src/domain/setting-case.ts:54-73` is
   treated as authoritative for schema purposes. No additional states are
   assumed beyond what's already executable.
4. **Temporary/emergency expiry and restoration.** `ASSUMPTION — PENDING
   REVIEW`: `SettingCaseUrgency` (`normal`/`high`/`emergency`) and the
   `restoration` stage already in the stage enum are the schema's only
   representation of this for now. No separate expiry-scheduler table is
   assumed; expiry is treated as a field on the case, not a background job,
   until confirmed otherwise.
5. **Evidence retention and download authority.** `ASSUMPTION — PENDING
   REVIEW`: all evidence artifacts (native relay files, PDF/Excel, parser
   output) are stored as opaque blobs in object storage (R2, given the
   Cloudflare platform choice) with metadata/checksum in D1; every
   authenticated user with case access may download evidence linked to that
   case. No per-artifact download ACL is assumed yet — flagged as the
   riskiest assumption in this list since it has real information-security
   consequences (see §6).
6. **Multi-UPT case ownership.** `ASSUMPTION — PENDING REVIEW`: the ERD
   below models `owningUnit`/`remoteUnit` as two plain string fields on
   `SettingCase` (matching current code — `src/domain/setting-case.ts:217-
   218`), not as a many-to-many `CaseEndpointWorkPackage` table. Per the
   2026-08-03 review, the Parent Case → Local/Remote Endpoint Work Package
   structure in `BUSINESS_PROCESS_BLUEPRINT.md` §3.5 is target design, not
   implemented — the schema below must not imply it already exists.
7. **Initial pilot dataset / migration acceptance.** `ASSUMPTION — PENDING
   REVIEW`: ANGKE–ANCOL #1 plus one P545 calculation case plus one crosscheck
   case, per `DEVELOPMENT_HANDOFF.md:179`. No other line is assumed ready
   for migration.

## 4. Entity-Relationship Design

### 4.1 Scope boundary

Authoritative write tables (this ADR's concern) vs. read projections
(Explorer, KPIs, Asset 360 — never directly written):

```text
AUTHORITATIVE (this document)          PROJECTIONS (unchanged, existing code)
────────────────────────────           ──────────────────────────────────────
canonical_entity                        Asset & Setting Explorer grid
governed_revision                       Asset 360 detail panel
data_change_proposal                    KPI / readiness counts
data_activation_event                   Data Quality Queue summaries
setting_case
case_stage_event
source_observation
audit_event
```

Explorer/KPI/Asset-360 projections continue to be computed client-side (or
later, server-side read models) from the authoritative tables — they are not
separate authoritative storage and must not become directly editable.

### 4.2 Tables

All tables below map directly to existing TypeScript types in
`src/domain/ssot-governance.ts` and `src/domain/setting-case.ts`. No new
domain concept is introduced; this is a storage projection of what the
domain layer already defines as of commit `a3c370a`.

```text
canonical_entity
├── id                    TEXT PRIMARY KEY        -- CanonicalEntityRef.id
├── kind                  TEXT NOT NULL            -- CanonicalEntityKind
├── external_ref          TEXT NULL                -- ASSUMPTION §3.1
└── created_at            TEXT NOT NULL

governed_revision
├── id                    TEXT PRIMARY KEY
├── entity_id             TEXT NOT NULL  FK -> canonical_entity.id
├── entity_kind           TEXT NOT NULL            -- denormalized for query speed
├── revision_number       INTEGER NOT NULL
├── predecessor_revision_id TEXT NULL  FK -> governed_revision.id
├── case_id               TEXT NOT NULL  FK -> setting_case.id
├── state                 TEXT NOT NULL            -- RevisionState
├── payload_type          TEXT NOT NULL            -- CanonicalRevisionPayload.type
├── payload_json          TEXT NOT NULL            -- typed payload, serialized
├── source_evidence_ids   TEXT NOT NULL            -- JSON array of source_observation.id
├── created_at            TEXT NOT NULL
├── created_by            TEXT NOT NULL
├── approved_at           TEXT NULL
├── approved_by           TEXT NULL
├── valid_from             TEXT NULL
├── valid_to               TEXT NULL
├── fingerprint            TEXT NOT NULL
└── UNIQUE(entity_id, revision_number)
    -- enforces invariant #4 (no duplicate revision numbers per entity);
    -- "at most one active" is a runtime invariant (resolveEffectiveRevision),
    -- not a UNIQUE constraint, because state='active' history persists as
    -- superseded rows with the same entity_id.

data_change_proposal
├── id                     TEXT PRIMARY KEY
├── case_id                TEXT NOT NULL  FK -> setting_case.id
├── target_entity_id       TEXT NOT NULL  FK -> canonical_entity.id
├── baseline_revision_id   TEXT NOT NULL  FK -> governed_revision.id
├── proposed_revision_id   TEXT NOT NULL  FK -> governed_revision.id
├── reason                 TEXT NOT NULL
├── field_changes_json     TEXT NOT NULL            -- GovernedFieldChange[]
├── source_evidence_ids    TEXT NOT NULL            -- JSON array
├── activation_policy      TEXT NOT NULL            -- ActivationPolicy
├── planned_effective_at   TEXT NULL
├── status                 TEXT NOT NULL            -- DataChangeProposalStatus
├── validation_json        TEXT NOT NULL
├── created_at             TEXT NOT NULL
├── created_by             TEXT NOT NULL
├── submitted_at           TEXT NULL
├── approved_at            TEXT NULL
├── approved_by            TEXT NULL
├── activated_at           TEXT NULL
├── fingerprint            TEXT NOT NULL
└── CHECK(approved_by IS NULL OR approved_by != created_by)
    -- enforces invariant #8 at the storage layer as defense in depth;
    -- primary enforcement stays in approveDataChangeProposal()

data_activation_event
├── id                       TEXT PRIMARY KEY
├── proposal_id              TEXT NOT NULL  FK -> data_change_proposal.id
├── case_id                  TEXT NOT NULL  FK -> setting_case.id
├── entity_id                TEXT NOT NULL  FK -> canonical_entity.id
├── activated_revision_id    TEXT NOT NULL  FK -> governed_revision.id
├── superseded_revision_id   TEXT NULL      FK -> governed_revision.id
├── trigger                  TEXT NOT NULL            -- ActivationTrigger
├── activated_at             TEXT NOT NULL
├── activated_by             TEXT NOT NULL
└── evidence_ids             TEXT NOT NULL            -- JSON array
    -- append-only. No UPDATE/DELETE path — this table is the audit
    -- backbone for invariant #7 (activation supersedes, never overwrites).

setting_case
├── id                      TEXT PRIMARY KEY
├── case_type               TEXT NOT NULL            -- SettingCaseType
├── title                   TEXT NOT NULL
├── description              TEXT NULL
├── primary_reason           TEXT NOT NULL            -- ChangeItemKind
├── change_items_json        TEXT NOT NULL            -- ChangeItem[]
├── urgency                  TEXT NOT NULL
├── flow_profile_json        TEXT NOT NULL            -- CaseFlowProfile (ASSUMPTION §3.2)
├── planned_effective_date   TEXT NULL
├── owning_unit              TEXT NOT NULL            -- ASSUMPTION §3.6: plain string
├── remote_unit              TEXT NULL                -- ASSUMPTION §3.6: plain string
├── protected_scope_json     TEXT NOT NULL            -- SettingCaseScope
├── baseline_json            TEXT NULL                -- SettingCaseBaseline (immutable once set)
├── stage                    TEXT NOT NULL            -- SettingCaseStatus
├── created_at               TEXT NOT NULL
├── updated_at               TEXT NOT NULL
├── created_by               TEXT NOT NULL
└── row_version               INTEGER NOT NULL DEFAULT 1
    -- backs RepositoryWriteOptions.expectedVersion / RepositoryConflictError

case_stage_event
├── id            TEXT PRIMARY KEY
├── case_id       TEXT NOT NULL  FK -> setting_case.id
├── stage         TEXT NOT NULL
├── at            TEXT NOT NULL
├── actor         TEXT NOT NULL
├── note          TEXT NULL
└── -- append-only; SettingCaseStageEvent[] flattened to rows

-- proposedDataRevisions / impactAssessments / studyBindings /
-- studyPackageBindings / links on SettingCase remain JSON columns
-- (case_proposed_revisions_json etc.) in 2D.1 rather than fully normalized
-- tables. Rationale: these are POC-era append-only arrays already; forcing
-- full normalization now is premature relative to the ADR's own principle
-- (§7) of not building ahead of confirmed need. Revisit if query patterns
-- in 2D.2 require indexing into these arrays server-side.

source_observation
├── id             TEXT PRIMARY KEY
├── domain         TEXT NOT NULL            -- DataAuthorityDomain
├── source_system  TEXT NOT NULL
├── external_id    TEXT NULL
├── captured_at    TEXT NOT NULL
├── captured_by    TEXT NOT NULL
├── artifact_ref   TEXT NOT NULL            -- R2 object key, not the blob itself
├── checksum_algo  TEXT NULL
├── checksum_value TEXT NULL
└── status         TEXT NOT NULL            -- candidate | accepted_evidence | rejected

audit_event
├── id         TEXT PRIMARY KEY
├── at         TEXT NOT NULL
├── actor      TEXT NOT NULL
├── action     TEXT NOT NULL
├── scope      TEXT NULL
├── target_id  TEXT NULL
├── summary    TEXT NOT NULL
├── detail     TEXT NULL
└── -- append-only, matches RepositoryAuditEvent exactly
```

### 4.3 Object storage boundary (R2)

Per `DEVELOPMENT_HANDOFF.md` §7 SSOT-2D.2 guidance ("store large source/
native artifacts in object storage; keep governed metadata, checksums, and
relations in the transactional database"):

- Native relay setting files, PDF TAP documents, Excel workbooks, and
  parser-intermediate artifacts go to R2, keyed by `source_observation.
  artifact_ref`.
- D1 never stores blob bytes — only the R2 key, checksum, and the metadata
  needed to resolve authority (per `ssot-governance.ts`'s
  `SourceObservation` type).
- This split exists in the domain layer already (`SourceObservation.
  artifactRef: string` is a reference, not inline content) — 2D.1 just needs
  to decide R2 as the concrete backing store, which follows from the
  Cloudflare platform decision in §2.

### 4.4 "Most recent confirmed setting" and the provenance gap

A recurring question the schema must answer: for a given relay/bay, what is
the file (e.g. the last XRIO/native readback session) that currently backs
"this is the setting we believe is installed," and who/what/when/where
produced that belief?

The existing domain model answers most of this already through
`source_observation` plus the authority ordering in
`BUSINESS_PROCESS_BLUEPRINT.md` §4 P1 (connected readback > native file +
manifest > structured export from that session > native file without
manifest > PDF/manual fallback):

```text
"What"    -> source_observation.domain            (actual_setting, issued_setting, ...)
"How"     -> source_observation.status             (candidate | accepted_evidence | rejected)
"By whom" -> source_observation.captured_by
"When"    -> source_observation.captured_at
"Where"   -> source_observation.source_system      (which tool/session produced it)
"Which file" -> source_observation.artifact_ref    (R2 key) + checksum
```

**Gap found while answering this**: nothing in the current schema flags
*which* `source_observation` is the currently-authoritative one for a given
entity. "Most recent" today is only derivable implicitly — `MAX(captured_at)
WHERE domain = 'actual_setting' AND <entity match>` — which is fragile:
concurrent uploads, out-of-order manifest timestamps, or a rejected-but-
recently-captured observation could all make a naive `MAX()` return the
wrong row.

**Recommended fix for 2D.1, not yet applied to the ERD in §4.2**: add a join
table rather than a boolean flag column, so "current" is a relationship, not
a mutable bit that different rows must stay in sync about:

```text
entity_current_observation
├── entity_id            TEXT NOT NULL  FK -> canonical_entity.id
├── domain                TEXT NOT NULL            -- DataAuthorityDomain
├── source_observation_id TEXT NOT NULL  FK -> source_observation.id
├── superseded_by_id      TEXT NULL      FK -> source_observation.id
├── set_at                TEXT NOT NULL
├── set_by                TEXT NOT NULL            -- system action, not necessarily a human
└── PRIMARY KEY(entity_id, domain)
    -- one row per (entity, authority-domain): "the current actual_setting
    -- observation for relay X is observation Y." Updated only through an
    -- explicit action (new accepted-evidence observation supersedes the
    -- prior row), never inferred by MAX(captured_at) at read time.
```

This directly answers "flag data X based on action X on X by X at level X":
the flag is `entity_current_observation`, the action is whatever wrote it
(a P1 crosscheck acceptance, a new readback session import), the target is
`entity_id` + `domain`, the actor is `set_by`, and the level is the
authority-domain ordering already defined in `DEFAULT_DATA_AUTHORITY_MATRIX`
(§2.2 of the Blueprint) — a new `accepted_evidence` observation only
replaces the current row if it is equal-or-higher authority than what it
supersedes; a lower-authority observation (e.g. a PDF fallback arriving
after a native readback already exists) must not silently become "current."
That authority-ordering check on write is new logic this table requires and
does not yet exist anywhere in `ssot-governance.ts` — flagged as an open
design item for whoever picks up 2D.1, not something already solved by the
existing domain contract.

This table is additive to §4.2, not a replacement for `governed_revision`/
`data_activation_event` — those two already fully handle *canonical setting
data* provenance (the governed side: proposal → approval → activation).
`entity_current_observation` covers the *evidence* side (the observed side:
which readback/document is currently trusted as representing reality),
which is a distinct concern per the Blueprint's four-layer model (§2.2:
Source Observation is a separate layer from Versioned Technical State).

## 5. Transaction and optimistic-lock behavior

### 5.1 Optimistic concurrency

`InMemorySettingCaseRepository` (`src/repositories/protection-lifecycle-
repository.ts:46-80`) is the reference implementation: `save()` takes an
optional `expectedVersion`, compares it against the current stored version,
and throws `RepositoryConflictError` on mismatch. `setting_case.row_version`
in §4.2 is the D1-side equivalent — a D1 adapter must:

```sql
UPDATE setting_case
SET ..., row_version = row_version + 1
WHERE id = ? AND row_version = ?  -- expectedVersion check
```

A zero-row UPDATE means a conflict — the adapter throws
`RepositoryConflictError`, exactly matching the in-memory reference
behavior. `test:repository` already locks this contract; a D1 adapter must
pass the same test suite unmodified (per `DEVELOPMENT_HANDOFF.md`'s 2D.1
guidance: "Run the local adapter and database adapter against the same
contract tests").

### 5.2 Atomic activation

`GovernedDataRepository.activate()` (`protection-lifecycle-repository.
ts:117`) is documented as requiring "one backend transaction: validate
baseline, activate the proposed revision, supersede the prior active
revision, and append activation event." In D1 this is one `db.batch()` call
wrapping:

1. `SELECT` current active `governed_revision` for the target entity,
   compare against `proposal.baselineRevisionId` (baseline-drift check —
   invariant #7, mirrors `resolveEffectiveRevision()`'s logic).
2. `UPDATE governed_revision SET state = 'superseded', valid_to = ? WHERE id
   = <current active>`.
3. `UPDATE governed_revision SET state = 'active', valid_from = ? WHERE id =
   <proposed>`.
4. `UPDATE data_change_proposal SET status = 'activated', activated_at = ?`.
5. `INSERT INTO data_activation_event ...`.

If any precondition fails (baseline drift, wrong proposal status, missing
evidence for commissioning trigger), the batch is not issued — the
in-memory `activateApprovedProposal()` function already computes and
validates all of this before returning a result; the D1 adapter's job is
only to persist the already-validated outcome atomically, not to
re-implement the business rule.

## 6. Risks flagged for explicit product-owner attention

These are not blocking SSOT-2D.0 (a design doc), but must be resolved before
2D.1 touches real data:

1. **Evidence download ACL (§3.5)** is the least-defended assumption here.
   Native relay files and TAP PDFs may be sensitive; "any authenticated user
   with case access may download" is a placeholder, not a security review.
2. **`entity_current_observation` authority-ordering check (§4.4)** is new
   logic, not something the existing domain contract already validates. Who
   is allowed to mark an observation "current" — automatic on
   `accepted_evidence`, or a separate confirmation action — is unconfirmed
   and directly affects whether "most recent setting" can be trusted without
   a human review step.
3. **`flow_profile_json` and `field_changes_json` as opaque JSON columns**
   trade query-ability for schema stability during the pilot. If SSOT-2D.2
   needs to query "all proposals awaiting a specific approver role," these
   columns will need to be lifted into normalized tables at that point —
   flagged now so it isn't a surprise later.

## 7. Migration, backfill, and rollback strategy (draft)

Per `DEVELOPMENT_HANDOFF.md` §7, SSOT-2D.0 must also draft this — again as
design only, no execution.

### 7.1 Backfill source and shape

The only backfill candidate is the current browser-localStorage snapshot
(`PROTECTION_LIFECYCLE_SNAPSHOT_NAME = "proset-poc-state-v1"`, currently at
schema version 26 — `protection-lifecycle-repository.ts:267-268`), scoped to
the pilot dataset named in assumption §3.7 (ANGKE–ANCOL #1, one P545 case,
one crosscheck case). A backfill script would:

1. Read the existing localStorage snapshot through
   `PROTECTION_LIFECYCLE_SNAPSHOT_KEYS` (the same allowlist the app already
   uses — nothing transient leaks in, by construction).
2. Filter to the pilot scope only (`settingCases` where `protectedScope`
   matches ANGKE–ANCOL, plus their linked `studyScenarios`,
   `engineeringChangeSets`, `sourceIntakeRecords`, `targetedCalculationRuns`,
   `verificationRuns`).
3. Map each in-memory record to the §4.2 table shape. Straightforward for
   `setting_case` (near 1:1 field mapping). `data_change_proposal` is
   *mostly* straightforward too — `buildProposedDataRevision()` in
   `case-proposed-revision.ts:198-281` already builds real
   `DataChangeProposal` objects via `createDataChangeProposal()`, stored on
   `ProposedDataRevision.governedProposals`, so those rows exist in a
   genuine governed shape today, not just something UI-shaped.
   **The actual gap**: `governedProposals[].proposedRevisionId` is set to a
   synthetic string (`${proposalId}:${proposalKind}`,
   `case-proposed-revision.ts:291`), not the `id` of a real, separately
   persisted `GovernedRevision`. No corresponding `governed_revision` row is
   ever constructed for that ID today — `createGovernedRevision()` from
   `ssot-governance.ts` is exercised only by `test:ssot-governance`'s
   fixtures, not by the live case-proposal path. Backfilling
   `data_change_proposal` cleanly means either (a) synthesizing a matching
   `governed_revision` row for each `proposedRevisionId` at migration time,
   inferring its payload from the same `ProposedFieldChange[]` the proposal
   already carries, or (b) wiring `buildProposedDataRevision()` to call
   `createGovernedRevision()` for real before migration, so the backfill has
   an actual row to copy instead of one it must invent. **This wiring gap is
   the single largest unknown in the migration** — it needs its own spike
   before 2D.1 writes the backfill script, not just this ADR's say-so.

### 7.2 Acceptance criteria

Per assumption §3.7, migration acceptance is not yet product-owner-
confirmed. Draft criteria for 2D.1, pending review:

- Every migrated `setting_case` round-trips through the *same*
  `applicableStages()`/stage-gate logic the localStorage version already
  passed — i.e., a case that was validly at `data_change_preparation` in
  localStorage must still validate as being validly at that stage after
  migration, using the existing domain functions, not new ones.
- `test:repository`, `test:ssot-governance`, `test:setting-case`,
  `test:case-baseline-flow`, `test:asset-explorer`, and
  `test:p545-case-execution` (the handoff's minimum command list) all pass
  against the D1-backed repository with the migrated dataset substituted in
  place of the in-memory fixtures.
- No migrated row is marked `active`/`accepted_evidence`/`current` (§4.4)
  without an explicit migration-time decision recorded in `audit_event` —
  migration must not silently promote POC data to authoritative status,
  which would violate invariant #2 (evidence/extraction never
  self-promotes) applied to the migration process itself.

### 7.3 Rollback

Because 2D.1 is explicitly a **local/dev pilot** ("Implement the repository
ports against a local/dev database," `DEVELOPMENT_HANDOFF.md:178`) running
alongside the existing localStorage adapter rather than replacing it,
rollback at this stage is close to free: stop pointing the app at the D1
adapter, resume the localStorage adapter, drop the dev D1 database. This
only becomes a real rollback problem at SSOT-2D.2 (staging, multi-user, real
writes) — this ADR does not attempt to design 2D.2's rollback strategy,
since it depends on decisions (§3) not yet confirmed. Flagged here only so
2D.1 does not accidentally get treated as the point of no return: it should
be built and tested as a parallel, disposable path first.

## 8. What this ADR deliberately does not do

- Does not provision any Cloudflare resource (no `wrangler d1 create`, no R2
  bucket).
- Does not write a migration script.
- Does not implement a D1-backed `SettingCaseRepository`/
  `GovernedDataRepository`.
- Does not resolve the seven assumptions in §3 — it makes them legible and
  swappable, not correct.
- Does not decide SSOT-2D.2's RBAC model beyond noting Cloudflare Access as
  the already-flagged upgrade path from HTTP Basic Auth.

SSOT-2D.1 begins only after this document (or a corrected version of it) is
reviewed.
