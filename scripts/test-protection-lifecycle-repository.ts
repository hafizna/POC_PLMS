import assert from "node:assert/strict";
import { createSettingCaseObject } from "../src/domain/setting-case";
import {
  createSnapshotStateStorage,
  InMemorySettingCaseRepository,
  MemorySerializedSnapshotRepository,
  PROTECTION_LIFECYCLE_SNAPSHOT_KEYS,
  RepositoryConflictError,
  selectProtectionLifecycleSnapshot,
} from "../src/repositories/protection-lifecycle-repository";

const sourceState = Object.fromEntries(
  PROTECTION_LIFECYCLE_SNAPSHOT_KEYS.map((key) => [key, `value:${key}`])
) as Record<(typeof PROTECTION_LIFECYCLE_SNAPSHOT_KEYS)[number], unknown> & {
  caseWizardRequest?: unknown;
  openedFromCaseId?: unknown;
  setTab?: unknown;
};
sourceState.caseWizardRequest = { caseType: "new_setting" };
sourceState.openedFromCaseId = "case_transient";
sourceState.setTab = () => undefined;

const selected = selectProtectionLifecycleSnapshot(sourceState);
assert.deepEqual(Object.keys(selected), [...PROTECTION_LIFECYCLE_SNAPSHOT_KEYS]);
assert.equal("caseWizardRequest" in selected, false);
assert.equal("openedFromCaseId" in selected, false);
assert.equal("setTab" in selected, false);

const serializedRepository = new MemorySerializedSnapshotRepository();
const stateStorage = createSnapshotStateStorage(serializedRepository);
assert.equal(stateStorage.getItem("plms"), null);
stateStorage.setItem("plms", JSON.stringify({ state: selected, version: 26 }));
assert.match(stateStorage.getItem("plms") ?? "", /activeSettingCaseId/);
stateStorage.removeItem("plms");
assert.equal(stateStorage.getItem("plms"), null);

const settingCase = createSettingCaseObject(
  {
    caseType: "network_change",
    title: "Repository contract case",
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
  "case_repository_1"
);

const cases = new InMemorySettingCaseRepository();
const created = await cases.save(settingCase);
assert.equal(created.version, "v1");
created.record.title = "Mutated outside repository";
assert.equal((await cases.getById(settingCase.id))?.title, settingCase.title);

const updated = await cases.save(
  { ...settingCase, title: "Repository contract case v2" },
  { expectedVersion: "v1" }
);
assert.equal(updated.version, "v2");
assert.equal((await cases.list()).length, 1);

await assert.rejects(
  () => cases.save(settingCase, { expectedVersion: "v1" }),
  RepositoryConflictError
);

console.log(
  "Protection lifecycle repository regression passed: snapshot allowlist, transient exclusion, storage adapter, detached reads, and optimistic concurrency."
);
