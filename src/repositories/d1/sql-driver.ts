// SSOT-2D.1: minimal driver contract shaped after Cloudflare's D1Database API
// (prepare().bind().run()/first()/all()). Adapters written against this
// interface run unmodified against a real D1 binding or against the
// better-sqlite3-backed local driver in `better-sqlite3-driver.ts` — the
// local driver exists only because a D1 binding cannot be reached from a
// plain Node/tsx process (see docs/adr/0001-ssot-2d0-persistence-and-
// authority-design.md §2's D1 decision; this file is the seam that decision
// requires, not a departure from it).

export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  run(): Promise<{ readonly changes: number }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ readonly results: readonly T[] }>;
}

export interface SqlDriver {
  prepare(query: string): SqlStatement;
  batch(statements: readonly SqlStatement[]): Promise<void>;
}
