// SSOT-2D.1: assembles the four D1-shaped adapters into one
// ProtectionLifecycleRepositories, completing the port set SSOT-2C defined
// (settingCases, governedData, sourceObservations, audit). This is wiring
// only — no adapter here does anything not already covered by its own
// parity regression (test:d1-setting-case-repository,
// test:d1-governed-data-repository, test:d1-source-observation-audit-
// repository). Not wired into the running app: the exported factory takes
// a SqlDriver explicitly rather than defaulting to one, so importing this
// module has no side effect and does not implicitly open a database
// connection or change Zustand's storage path.
import type { ProtectionLifecycleRepositories } from "../protection-lifecycle-repository";
import type { SqlDriver } from "./sql-driver";
import { D1SettingCaseRepository } from "./d1-setting-case-repository";
import { D1GovernedDataRepository } from "./d1-governed-data-repository";
import { D1SourceObservationRepository } from "./d1-source-observation-repository";
import { D1AuditRepository } from "./d1-audit-repository";

export function createD1ProtectionLifecycleRepositories(
  driver: SqlDriver
): ProtectionLifecycleRepositories {
  return {
    settingCases: new D1SettingCaseRepository(driver),
    governedData: new D1GovernedDataRepository(driver),
    sourceObservations: new D1SourceObservationRepository(driver),
    audit: new D1AuditRepository(driver),
  };
}
