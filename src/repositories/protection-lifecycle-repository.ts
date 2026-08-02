import type { SettingCase } from "../domain/setting-case";
import type {
  CanonicalEntityRef,
  CanonicalRevisionPayload,
  DataActivationEvent,
  DataChangeProposal,
  EffectiveRevisionResolution,
  GovernedRevision,
  SourceObservation,
} from "../domain/ssot-governance";

/**
 * SSOT-2C repository ports.
 *
 * Domain and application code may depend on these contracts. Implementations
 * may use the current browser snapshot, Cloudflare D1, or another backend,
 * but must preserve optimistic concurrency and atomic activation semantics.
 */

export type RepositoryWriteOptions = {
  readonly expectedVersion?: string;
};

export type RepositoryWriteResult<T> = {
  readonly record: T;
  readonly version: string;
};

export class RepositoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryConflictError";
  }
}

export interface SettingCaseRepository {
  list(): Promise<readonly SettingCase[]>;
  getById(id: string): Promise<SettingCase | undefined>;
  save(
    settingCase: SettingCase,
    options?: RepositoryWriteOptions
  ): Promise<RepositoryWriteResult<SettingCase>>;
}

/** Reference adapter for contract tests and non-persistent previews. */
export class InMemorySettingCaseRepository implements SettingCaseRepository {
  private readonly records = new Map<
    string,
    { record: SettingCase; revision: number }
  >();

  async list(): Promise<readonly SettingCase[]> {
    return [...this.records.values()].map(({ record }) => clone(record));
  }

  async getById(id: string): Promise<SettingCase | undefined> {
    const found = this.records.get(id);
    return found ? clone(found.record) : undefined;
  }

  async save(
    settingCase: SettingCase,
    options: RepositoryWriteOptions = {}
  ): Promise<RepositoryWriteResult<SettingCase>> {
    const existing = this.records.get(settingCase.id);
    const currentVersion = existing ? versionLabel(existing.revision) : undefined;
    if (
      options.expectedVersion !== undefined &&
      options.expectedVersion !== currentVersion
    ) {
      throw new RepositoryConflictError(
        `Setting Case ${settingCase.id} berubah: expected ${options.expectedVersion}, current ${currentVersion ?? "missing"}.`
      );
    }
    const revision = (existing?.revision ?? 0) + 1;
    const record = clone(settingCase);
    this.records.set(settingCase.id, { record, revision });
    return { record: clone(record), version: versionLabel(revision) };
  }
}

export type GovernedActivationCommand = {
  readonly proposalId: string;
  readonly proposedRevisionId: string;
  readonly expectedBaselineRevisionId: string;
  readonly activatedAt: string;
  readonly activatedBy: string;
  readonly trigger: "commissioning" | "effective_date" | "manual_controlled";
  readonly evidenceIds: readonly string[];
};

export type GovernedActivationCommit = {
  readonly proposal: DataChangeProposal;
  readonly activatedRevision: GovernedRevision;
  readonly supersededRevision?: GovernedRevision;
  readonly event: DataActivationEvent;
};

export interface GovernedDataRepository {
  listRevisions(entity: CanonicalEntityRef): Promise<readonly GovernedRevision[]>;
  resolveEffective(
    entity: CanonicalEntityRef,
    at: string
  ): Promise<EffectiveRevisionResolution>;
  saveDraftRevision<TPayload extends CanonicalRevisionPayload>(
    revision: GovernedRevision<TPayload>,
    options?: RepositoryWriteOptions
  ): Promise<RepositoryWriteResult<GovernedRevision<TPayload>>>;
  saveProposal(
    proposal: DataChangeProposal,
    options?: RepositoryWriteOptions
  ): Promise<RepositoryWriteResult<DataChangeProposal>>;
  /**
   * Must be one backend transaction: validate baseline, activate the proposed
   * revision, supersede the prior active revision, and append activation event.
   */
  activate(command: GovernedActivationCommand): Promise<GovernedActivationCommit>;
}

export interface SourceObservationRepository {
  getById(id: string): Promise<SourceObservation | undefined>;
  listByIds(ids: readonly string[]): Promise<readonly SourceObservation[]>;
  append(observation: SourceObservation): Promise<SourceObservation>;
}

export type RepositoryAuditEvent = {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly action: string;
  readonly scope?: string;
  readonly targetId?: string;
  readonly summary: string;
  readonly detail?: string;
};

export interface AuditRepository {
  list(scope?: string): Promise<readonly RepositoryAuditEvent[]>;
  append(event: RepositoryAuditEvent): Promise<RepositoryAuditEvent>;
}

export type ProtectionLifecycleRepositories = {
  readonly settingCases: SettingCaseRepository;
  readonly governedData: GovernedDataRepository;
  readonly sourceObservations: SourceObservationRepository;
  readonly audit: AuditRepository;
};

// The current POC still persists one browser snapshot. This allowlist is the
// compatibility boundary: transient navigation, modal, wizard, and action
// functions must never leak into the persisted repository payload.
export const PROTECTION_LIFECYCLE_SNAPSHOT_KEYS = [
  "relayOverrides",
  "candidateDecisions",
  "graphBuildDecisions",
  "networkGraphOverrides",
  "networkUndoStack",
  "ctVtOverrides",
  "auditEvents",
  "sourceIntakeRecords",
  "pdfTapPromotions",
  "calculationSnapshots",
  "targetedCalculationRuns",
  "coordinationChecks",
  "verificationRuns",
  "verificationReferenceDraft",
  "vendorImportHandoffDraft",
  "studies",
  "activeStudyId",
  "sourceSnapshots",
  "studyScenarios",
  "engineeringChangeSets",
  "settingCases",
  "activeSettingCaseId",
  "currentTab",
  "activeCorridorId",
  "selectedRelayId",
  "comparisonBayId",
  "activeNetworkCaseId",
  "activeNetworkLineId",
] as const;

export type ProtectionLifecycleSnapshotKey =
  (typeof PROTECTION_LIFECYCLE_SNAPSHOT_KEYS)[number];

export function selectProtectionLifecycleSnapshot<
  TState extends Record<ProtectionLifecycleSnapshotKey, unknown>,
>(state: TState): Pick<TState, ProtectionLifecycleSnapshotKey> {
  return Object.fromEntries(
    PROTECTION_LIFECYCLE_SNAPSHOT_KEYS.map((key) => [key, state[key]])
  ) as Pick<TState, ProtectionLifecycleSnapshotKey>;
}

/** Minimal serialized repository used by Zustand's compatibility adapter. */
export interface SerializedSnapshotRepository {
  get(key: string): string | null;
  put(key: string, value: string): void;
  remove(key: string): void;
}

export class MemorySerializedSnapshotRepository
  implements SerializedSnapshotRepository
{
  private readonly records = new Map<string, string>();

  get(key: string): string | null {
    return this.records.get(key) ?? null;
  }

  put(key: string, value: string): void {
    this.records.set(key, value);
  }

  remove(key: string): void {
    this.records.delete(key);
  }
}

class BrowserSerializedSnapshotRepository
  implements SerializedSnapshotRepository
{
  constructor(private readonly storage: Storage) {}

  get(key: string): string | null {
    return this.storage.getItem(key);
  }

  put(key: string, value: string): void {
    this.storage.setItem(key, value);
  }

  remove(key: string): void {
    this.storage.removeItem(key);
  }
}

const nonBrowserSnapshotRepository = new MemorySerializedSnapshotRepository();

export function createLocalSnapshotRepository(): SerializedSnapshotRepository {
  if (typeof window === "undefined") {
    return nonBrowserSnapshotRepository;
  }
  try {
    return window.localStorage
      ? new BrowserSerializedSnapshotRepository(window.localStorage)
      : nonBrowserSnapshotRepository;
  } catch {
    return nonBrowserSnapshotRepository;
  }
}

/** Structurally compatible with Zustand StateStorage without importing it. */
export function createSnapshotStateStorage(
  repository: SerializedSnapshotRepository = createLocalSnapshotRepository()
): {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
  removeItem(name: string): void;
} {
  return {
    getItem: (name) => repository.get(name),
    setItem: (name, value) => repository.put(name, value),
    removeItem: (name) => repository.remove(name),
  };
}

export const PROTECTION_LIFECYCLE_SNAPSHOT_NAME = "proset-poc-state-v1";
export const PROTECTION_LIFECYCLE_SNAPSHOT_VERSION = 26;

function versionLabel(revision: number): string {
  return `v${revision}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
