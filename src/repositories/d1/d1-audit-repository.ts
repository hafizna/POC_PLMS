// SSOT-2D.1 slice 3: D1-shaped AuditRepository. Append-only by design —
// there is no update/delete path in the port interface, and none is added
// here.
import type { AuditRepository, RepositoryAuditEvent } from "../protection-lifecycle-repository";
import type { SqlDriver } from "./sql-driver";

type AuditEventRow = {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly action: string;
  readonly scope: string | null;
  readonly target_id: string | null;
  readonly summary: string;
  readonly detail: string | null;
};

function fromRow(row: AuditEventRow): RepositoryAuditEvent {
  // Optional fields omitted entirely when absent — see the identical note
  // in d1-source-observation-repository.ts's fromRow(); an explicit
  // `key: undefined` fails deepEqual against objects built without that key.
  let event: RepositoryAuditEvent = {
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    summary: row.summary,
  };
  if (row.scope) event = { ...event, scope: row.scope };
  if (row.target_id) event = { ...event, targetId: row.target_id };
  if (row.detail) event = { ...event, detail: row.detail };
  return event;
}

export class D1AuditRepository implements AuditRepository {
  constructor(private readonly driver: SqlDriver) {}

  async list(scope?: string): Promise<readonly RepositoryAuditEvent[]> {
    if (scope === undefined) {
      const { results } = await this.driver
        .prepare("SELECT * FROM audit_event ORDER BY at ASC")
        .all<AuditEventRow>();
      return results.map(fromRow);
    }
    const { results } = await this.driver
      .prepare("SELECT * FROM audit_event WHERE scope = ? ORDER BY at ASC")
      .bind(scope)
      .all<AuditEventRow>();
    return results.map(fromRow);
  }

  async append(event: RepositoryAuditEvent): Promise<RepositoryAuditEvent> {
    await this.driver
      .prepare(
        `INSERT INTO audit_event (id, at, actor, action, scope, target_id, summary, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        event.id,
        event.at,
        event.actor,
        event.action,
        event.scope ?? null,
        event.targetId ?? null,
        event.summary,
        event.detail ?? null
      )
      .run();
    const row = await this.driver
      .prepare("SELECT * FROM audit_event WHERE id = ?")
      .bind(event.id)
      .first<AuditEventRow>();
    if (!row) {
      throw new Error(`Audit event ${event.id} tidak ditemukan setelah append().`);
    }
    return fromRow(row);
  }
}
