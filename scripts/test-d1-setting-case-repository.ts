// SSOT-2D.1 slice 1: proves D1SettingCaseRepository (backed locally by
// better-sqlite3, see src/repositories/d1/better-sqlite3-driver.ts) honors
// the exact same contract as InMemorySettingCaseRepository. This is
// deliberately the same sequence of assertions as the SettingCaseRepository
// portion of scripts/test-protection-lifecycle-repository.ts — SSOT-2D.1's
// job is proving parity, not inventing a new contract.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSettingCaseObject } from "../src/domain/setting-case";
import { RepositoryConflictError } from "../src/repositories/protection-lifecycle-repository";
import { applyMigration, openLocalDatabase } from "../src/repositories/d1/better-sqlite3-driver";
import { BetterSqlite3Driver } from "../src/repositories/d1/better-sqlite3-driver";
import { D1SettingCaseRepository } from "../src/repositories/d1/d1-setting-case-repository";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationSql = fs.readFileSync(
  path.join(currentDir, "..", "migrations", "0001_setting_case.sql"),
  "utf-8"
);

const db = openLocalDatabase(":memory:");
applyMigration(db, migrationSql);
const driver = new BetterSqlite3Driver(db);
const cases = new D1SettingCaseRepository(driver);

const settingCase = createSettingCaseObject(
  {
    caseType: "network_change",
    title: "D1 repository contract case",
    primaryReason: "reconductoring",
    changeItems: [{ id: "change_1", kind: "reconductoring" }],
    urgency: "normal",
    plannedEffectiveDate: "2026-09-01",
    owningUnit: "UPT Test",
    flowProfileDraft: {
      ownerLevel: "UPT",
      notifiedUnits: ["UIT Test"],
      lifecycleIntent: "permanent",
    },
    protectedScope: {
      networkCaseId: "case_inventory",
      subjectLineId: "line_1",
      subjectBayId: "bay_1",
      subjectLabel: "GI A - GI B #1",
      substationIds: ["sub_a", "sub_b"],
    },
  },
  "Engineer",
  "2026-08-03T00:00:00.000Z",
  "case_d1_repository_1"
);

// save() creates, returns v1
const created = await cases.save(settingCase);
assert.equal(created.version, "v1");
assert.equal(created.record.title, settingCase.title);

// mutating the returned record must not affect stored state (detached reads)
created.record.title = "Mutated outside repository";
assert.equal((await cases.getById(settingCase.id))?.title, settingCase.title);

// stageHistory round-trips through case_stage_event
const fetched = await cases.getById(settingCase.id);
assert.deepEqual(fetched?.stageHistory, settingCase.stageHistory);

// optimistic concurrency: correct expectedVersion succeeds
const updated = await cases.save(
  { ...settingCase, title: "D1 repository contract case v2" },
  { expectedVersion: "v1" }
);
assert.equal(updated.version, "v2");
assert.equal((await cases.list()).length, 1);
assert.equal((await cases.getById(settingCase.id))?.title, "D1 repository contract case v2");

// stale expectedVersion is rejected
await assert.rejects(
  () => cases.save(settingCase, { expectedVersion: "v1" }),
  RepositoryConflictError
);

// stage transition persists and stageHistory grows append-only
const advanced = {
  ...settingCase,
  title: "D1 repository contract case v2",
  stage: "scoping" as const,
  stageHistory: [
    ...settingCase.stageHistory,
    { stage: "scoping" as const, at: "2026-08-03T01:00:00.000Z", actor: "Engineer" },
  ],
};
const advancedResult = await cases.save(advanced, { expectedVersion: "v2" });
assert.equal(advancedResult.version, "v3");
assert.equal(advancedResult.record.stage, "scoping");
assert.equal(advancedResult.record.stageHistory.length, 2);

db.close();

console.log(
  "D1 setting case repository regression passed: create/read, detached reads, stage-history round-trip, and optimistic concurrency match the in-memory reference contract."
);
