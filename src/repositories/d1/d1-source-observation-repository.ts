// SSOT-2D.1 slice 3: D1-shaped SourceObservationRepository. Evidence
// records only — this port never promotes a source_observation into active
// canonical data (invariant #2); it just stores and retrieves what was
// captured. No update path exists here on purpose: an accepted/rejected
// status change is a new observation row's concern, not a mutation of the
// original capture, matching SourceObservation's fully-readonly shape.
import type { SourceObservation } from "../../domain/ssot-governance";
import type { SourceObservationRepository } from "../protection-lifecycle-repository";
import type { SqlDriver } from "./sql-driver";

type SourceObservationRow = {
  readonly id: string;
  readonly domain: string;
  readonly source_system: string;
  readonly external_id: string | null;
  readonly captured_at: string;
  readonly captured_by: string;
  readonly artifact_ref: string;
  readonly checksum_algo: string | null;
  readonly checksum_value: string | null;
  readonly status: string;
};

function fromRow(row: SourceObservationRow): SourceObservation {
  // Optional fields are omitted entirely when absent (not set to
  // `undefined`), matching how these objects are built in-memory —
  // otherwise deepEqual against the original object shape fails, since
  // `{ externalId: undefined }` and "no externalId key" are distinct to
  // strict equality even though both read as `undefined`.
  const base: SourceObservation = {
    id: row.id,
    domain: row.domain as SourceObservation["domain"],
    sourceSystem: row.source_system,
    capturedAt: row.captured_at,
    capturedBy: row.captured_by,
    artifactRef: row.artifact_ref,
    status: row.status as SourceObservation["status"],
  };
  const withExternalId = row.external_id ? { ...base, externalId: row.external_id } : base;
  return row.checksum_algo && row.checksum_value
    ? { ...withExternalId, checksum: { algorithm: "sha256", value: row.checksum_value } }
    : withExternalId;
}

export class D1SourceObservationRepository implements SourceObservationRepository {
  constructor(private readonly driver: SqlDriver) {}

  async getById(id: string): Promise<SourceObservation | undefined> {
    const row = await this.driver
      .prepare("SELECT * FROM source_observation WHERE id = ?")
      .bind(id)
      .first<SourceObservationRow>();
    return row ? fromRow(row) : undefined;
  }

  async listByIds(ids: readonly string[]): Promise<readonly SourceObservation[]> {
    if (ids.length === 0) return [];
    // D1/SQLite has no array bind — build a placeholder list sized to the
    // input. Safe from injection since only `?` placeholders carry values;
    // the query text itself contains no interpolated data.
    const placeholders = ids.map(() => "?").join(", ");
    const { results } = await this.driver
      .prepare(`SELECT * FROM source_observation WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<SourceObservationRow>();
    // Preserve caller-supplied order and drop ids that resolved to nothing,
    // matching what a Promise.all(ids.map(getById)) + filter would return.
    const byId = new Map(results.map((row) => [row.id, fromRow(row)]));
    return ids.map((id) => byId.get(id)).filter((value): value is SourceObservation => value !== undefined);
  }

  async append(observation: SourceObservation): Promise<SourceObservation> {
    await this.driver
      .prepare(
        `INSERT INTO source_observation (
          id, domain, source_system, external_id, captured_at, captured_by,
          artifact_ref, checksum_algo, checksum_value, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        observation.id,
        observation.domain,
        observation.sourceSystem,
        observation.externalId ?? null,
        observation.capturedAt,
        observation.capturedBy,
        observation.artifactRef,
        observation.checksum?.algorithm ?? null,
        observation.checksum?.value ?? null,
        observation.status
      )
      .run();
    const stored = await this.getById(observation.id);
    if (!stored) {
      throw new Error(`Source observation ${observation.id} tidak ditemukan setelah append().`);
    }
    return stored;
  }
}
