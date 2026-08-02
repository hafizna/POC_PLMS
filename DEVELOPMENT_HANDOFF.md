# PLMS Development Handoff

Last reviewed: 2026-08-03  
Current boundary: SSOT-2C repository boundary  
Primary branch: `master`

This file is the cross-agent continuation context for Codex, Claude Code, or a
human developer. Read this file first, then `README.md`,
`BUSINESS_PROCESS_BLUEPRINT.md`, and the newest entries in
`IMPLEMENTATION_NOTES.md`.

## 1. Product Direction

PLMS is a Protection Lifecycle Management System, not a generic calculator and
not a replacement asset registry. The current product target is targeted
recalculation and actual-setting verification for line protection, initially
Distance and Line Differential, using controlled data and evidence.

The authoritative flow is:

```text
Business reason / work trigger
  -> Setting Case
  -> scoped immutable baseline
  -> governed technical/equipment/topology proposal
  -> impact and data readiness
  -> compatible study scenario
  -> targeted recalculation of affected blocks
  -> coordination and engineering review
  -> approval and issued setting package
  -> field implementation / commissioning
  -> policy-driven data activation
  -> native relay readback and verification
  -> closure with immutable audit trail
```

Approval must not activate data. Commissioning/manual-controlled/effective-date
policy determines activation. PDF TAP is issued/expected evidence; native relay
readback from the official vendor tool is the authority for actual device state.

## 2. Non-negotiable Domain Invariants

1. Canonical physical/logical entity IDs are stable across revisions.
2. Source documents and extracted values are evidence, not active truth.
3. Revisions are immutable and linked to their predecessor.
4. At most one active revision applies to an entity at one instant. Never use
   array order or “latest row wins” to resolve conflicts.
5. Proposed values never overwrite the active baseline.
6. Proposal, review/approval, and activation are separate transactions.
7. Activation checks baseline drift and atomically activates the new revision,
   supersedes the old revision, and appends a `DataActivationEvent`.
8. The proposal creator cannot approve the same proposal.
9. Multi-condition work may create multiple proposals, one per canonical target.
10. Missing engineering data must fail closed or create a governed task; do not
    invent silent defaults.

## 3. Current Implemented Slices

### SSOT-1 — Asset & Setting Explorer

- `Data Teknis` is a dense searchable line/bay registry plus Asset 360.
- It projects confirmed `UnifiedNetwork`, relay/CT-VT, setting records, evidence,
  quality issues, and open Setting Cases.
- Active canonical data is read-only.
- ANGKE–ANCOL #1 is the real regression vertical slice.

### SSOT-2A — Governed domain contract

- `src/domain/ssot-governance.ts` defines authority domains, stable entity refs,
  typed governed revisions, proposals, effective-time resolution, approval,
  activation, supersession, and conflict handling.
- Reconductoring and relay-replacement lifecycle regressions exist.

### SSOT-2B — Governed proposal UI

- Asset 360 exposes `Usulkan perubahan` with a business reason.
- Stable line/bay/GI scope is handed to the Setting Case wizard.
- The wizard still creates a `draft`; it does not bypass scoping or baseline
  freeze.
- The case proposal editor shows canonical target, baseline revision,
  before/proposed values, evidence, activation policy, and active-data status.
- Unchanged values are not recorded as field changes.
- A case with multiple change kinds creates one governed proposal per canonical
  target, such as `line_technical` plus `instrument_transformer`.

### SSOT-2C — Repository boundary

- `src/repositories/protection-lifecycle-repository.ts` defines ports for:
  - Setting Cases;
  - governed revision/proposal/atomic activation;
  - source observations;
  - audit events.
- Persistence uses an explicit snapshot allowlist. Transient state such as the
  wizard request, modal state, opened-from-case navigation, and action functions
  is not persisted.
- Zustand remains the POC application-state orchestrator, but its persisted
  storage is now wired through the repository adapter rather than implicit
  browser storage.
- Browser storage keeps the existing key and JSON format. Existing local data
  should hydrate without migration or key changes.
- Node/test environments use an explicit in-memory adapter.
- `InMemorySettingCaseRepository` is the reference optimistic-concurrency
  implementation for repository contract tests.

## 4. Important Existing Engineering Capability

- P545 Distance core and auxiliary parity: 55/55 saved Mathcad checks.
- Case-scoped P545 targeted execution is immutable and fail-closed.
- Actual-setting crosscheck accepts supported native/derived inputs, but actual
  authority requires readback acquisition manifest and device/session evidence.
- TAP PDF audit and actual relay readback are separate P1 modes.
- GI insertion, working-network impact, data readiness, and neutral DIgSILENT
  staging preview exist as a pilot.
- Vendor-native setting-file writer remains deliberately deferred until
  round-trip validation with official vendor software is available.
- Full setting design from zero, transformer protection, expanded OCR/GFR, and
  broad multi-vendor conversion are not the active scope.

## 5. What SSOT-2C Does Not Mean

- There is no production or staging database.
- The aggregate repository ports are not backed by HTTP/D1 yet.
- Browser localStorage is still the POC persistence implementation.
- Local snapshot migration code still resides in `useProsetStore.ts`; it is
  legacy-browser compatibility logic, not the future backend migration system.
- There is no server-side authentication, organizational RBAC, locking, or
  cross-user review.
- Submit/review/approval/activation UI for setting-change cases is not complete.
- Repository ports must not be presented as proof that atomic database
  activation already exists.

## 6. Required Review Before Database Work

Before SSOT-2D staging persistence, recap and confirm with the product owner:

1. Canonical identity source and external asset-ID reconciliation.
2. UPT versus UIT ownership, notification, reviewer, approver, and activation
   authority for each case type.
3. Exact proposal -> submit -> review -> approval -> commissioning -> activation
   state transitions.
4. Temporary/emergency expiry and restoration obligations.
5. Evidence retention: native relay files, PDF/Excel, checksum, parser artifacts,
   acquisition manifest, and who may download each artifact.
6. Whether one case may cover multiple UPTs and who owns the remote-side task.
7. Initial pilot dataset and migration acceptance criteria.

Do not provision a production database merely because repository interfaces now
exist.

## 7. Recommended Future Development

### SSOT-2D.0 — Persistence and authority design (next)

- Produce an ADR/ERD, not a production deployment.
- Separate authoritative write tables from Explorer/read projections.
- Define transaction and optimistic-lock behavior.
- Define D1/PostgreSQL decision criteria and file/object-storage boundary.
- Draft migration/backfill and rollback strategy.

Candidate authoritative records:

- canonical entity and external identity binding;
- governed technical/network/equipment revision;
- Setting Case and append-only stage events;
- Data Change Proposal and field/evidence links;
- review and approval decisions;
- issued Setting Package/Setting Revision;
- field implementation and commissioning evidence;
- Data Activation Event;
- actual readback session and normalized result;
- audit event.

Explorer grids, KPI counts, readiness summaries, and Asset 360 are projections,
not directly editable authoritative tables.

### SSOT-2D.1 — Local database pilot

- Implement the repository ports against a local/dev database.
- Seed a bounded real dataset, preferably ANGKE–ANCOL plus one P545 calculation
  case and one crosscheck case.
- Run the local adapter and database adapter against the same contract tests.
- Rehearse snapshot import without treating imported rows as automatically
  active canonical data.

### SSOT-2D.2 — Staging multi-user workflow

- Required before credible submit/review/approval across different users.
- Add server-side identity, UPT/UIT scope, RBAC, segregation of duties,
  optimistic concurrency, transaction-backed activation, and audit retention.
- Store large source/native artifacts in object storage; keep governed metadata,
  checksums, and relations in the transactional database.

### After persistence is credible

- Complete internal review, approval, issuance, field implementation,
  commissioning, and setting-change verification.
- Then continue canonical Setting Revision/TAP composition.
- Expand Line Differential performance and only afterward reconsider broader
  OCR/GFR, transformer, or multi-vendor conversion scope.

## 8. Manual UI Review Script

1. Login as Engineer.
2. Open `Data Teknis`.
3. Select ANGKE–ANCOL or another confirmed line.
4. Click `Usulkan perubahan`.
5. Choose reconductoring, CT/VT replacement, relay replacement, remote work,
   topology change, or data correction.
6. Confirm title/reason/scope are prefilled in the Setting Case wizard.
7. Complete owner/unit, notification, and planned date.
8. Create the case; verify the case detail opens directly at `draft`.
9. Advance to scoping and freeze the baseline.
10. Attach post-freeze change evidence from `Dokumen Perubahan`.
11. Advance to `Persiapan Perubahan Data`.
12. Verify canonical target, baseline revision, before/proposed fields,
    evidence, activation policy, and `active tetap tidak berubah` indicator.
13. Save twice and confirm append-only revision history.

UI browser automation was unavailable during the SSOT-2B implementation turn,
so this manual flow remains an explicit acceptance task.

## 9. Regression and Build Commands

Run at minimum:

```powershell
npx tsc --noEmit
npm run test:repository
npm run test:ssot-governance
npm run test:setting-case
npm run test:case-baseline-flow
npm run test:asset-explorer
npm run test:p545-case-execution
npm run build
git diff --check
```

Expected non-fatal build condition: Vite currently warns about chunks larger
than 500 kB. Do not mix chunk optimization into SSOT/domain changes unless it is
the explicit task.

## 10. Key Files

- `BUSINESS_PROCESS_BLUEPRINT.md` — normative target process and authority.
- `README.md` — product boundary, status, and ordered roadmap.
- `IMPLEMENTATION_NOTES.md` — chronological implementation evidence.
- `src/domain/ssot-governance.ts` — executable SSOT invariants.
- `src/repositories/protection-lifecycle-repository.ts` — SSOT-2C ports and
  local snapshot adapter.
- `src/domain/case-proposed-revision.ts` — case proposal to governed proposal
  bridge.
- `src/store/useProsetStore.ts` — POC application state/actions and historical
  local snapshot migrations.
- `src/components/master/MasterDataView.tsx` — Asset 360 and change entry point.
- `src/components/cases/SettingCaseWizard.tsx` — intent/scope intake.
- `src/components/cases/ProposedRevisionEditor.tsx` — proposed technical data.

## 11. Source Materials Already Used

- `Aplikasi Crosscheck Setting Relay [Digsilent_ 9 Maret 2021, IHS 1-2021].xlsx`
- `Data Setting Penghantar UPT DKSBI (1).xlsx`
- `Tap Setting MiCom P545 GI Ciledug Bay Alam Sutera #1.xmcd`
- `official tap setting UGC OHL GIS PIK - Muarakarang baru 1,2_LCD_DIST_AR_SYNC-P545_OCR-7SJ63_rev01.pdf`
- `Bay Angke arah Ancol.PDF`

Do not assume every required fault level, study condition, generation state,
line constant, CT/VT detail, or vendor capability is present merely because one
of these files was indexed.

## 12. Cross-agent Continuation Checklist

Before editing:

- inspect `git status` and latest commits;
- read this handoff and newest implementation notes;
- preserve user changes and unrelated worktree files;
- confirm the task belongs to the current roadmap slice;
- avoid direct edits to active master data;
- avoid silently promoting extracted evidence;
- add or update regression before declaring a lifecycle gate operational;
- state explicitly whether changes are committed and pushed.

When handing off again, update sections 3, 5, 7, 8, and 9 plus the newest
implementation-note entry. Future plans belong here/README/Blueprint; only
implemented facts belong in `IMPLEMENTATION_NOTES.md`.
