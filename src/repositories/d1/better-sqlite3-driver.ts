// SSOT-2D.1: local/dev-only driver. Talks to a plain file (or in-memory)
// SQLite database via better-sqlite3 so repository adapters can be exercised
// from a Node/tsx test script, exactly like every other regression in this
// project (`npm run test:*`). This is not the production path — a real D1
// binding satisfies the same `SqlDriver` interface inside the Worker
// runtime. Node/tsx can never reach a D1 binding directly (no such runtime
// exists outside workerd), so this file is what makes SSOT-2D.1's contract
// tests runnable at all without standing up vitest-pool-workers.
import DatabaseConstructor, { type Database } from "better-sqlite3";
import type { SqlDriver, SqlStatement } from "./sql-driver";

class BetterSqlite3Statement implements SqlStatement {
  boundValues: unknown[] = [];

  constructor(
    readonly db: Database,
    readonly query: string
  ) {}

  bind(...values: unknown[]): SqlStatement {
    this.boundValues = values;
    return this;
  }

  runSync(): { readonly changes: number } {
    const info = this.db.prepare(this.query).run(...this.boundValues);
    return { changes: info.changes };
  }

  async run(): Promise<{ readonly changes: number }> {
    return this.runSync();
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.db.prepare(this.query).get(...this.boundValues) as T | undefined;
    return row ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ readonly results: readonly T[] }> {
    const rows = this.db.prepare(this.query).all(...this.boundValues) as T[];
    return { results: rows };
  }
}

export class BetterSqlite3Driver implements SqlDriver {
  constructor(private readonly db: Database) {}

  prepare(query: string): SqlStatement {
    return new BetterSqlite3Statement(this.db, query);
  }

  async batch(statements: readonly SqlStatement[]): Promise<void> {
    // db.transaction() requires a synchronous callback, so this calls
    // runSync() directly rather than the async run() wrapper — calling an
    // async method here would return before the statement actually
    // executes, silently breaking the atomicity this method exists to
    // provide.
    const run = this.db.transaction(() => {
      for (const statement of statements) {
        if (!(statement instanceof BetterSqlite3Statement)) {
          throw new Error("batch() only accepts statements created by this driver.");
        }
        statement.runSync();
      }
    });
    run();
  }
}

export function openLocalDatabase(pathOrMemory: string): Database {
  const db = new DatabaseConstructor(pathOrMemory);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function applyMigration(db: Database, migrationSql: string): void {
  db.exec(migrationSql);
}
