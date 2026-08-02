// SSOT-2D.1 slice 1: D1-shaped SettingCaseRepository. Runs unmodified
// against a real D1Database binding or the local better-sqlite3 driver
// (see sql-driver.ts). Contract must match InMemorySettingCaseRepository
// exactly — same regression suite (scripts/test-protection-lifecycle-
// repository.ts) exercises both.
import type { SettingCase, SettingCaseStageEvent } from "../../domain/setting-case";
import {
  RepositoryConflictError,
  type RepositoryWriteOptions,
  type RepositoryWriteResult,
  type SettingCaseRepository,
} from "../protection-lifecycle-repository";
import type { SqlDriver } from "./sql-driver";

type SettingCaseRow = {
  readonly id: string;
  readonly case_type: string;
  readonly title: string;
  readonly description: string | null;
  readonly primary_reason: string;
  readonly change_items_json: string;
  readonly urgency: string;
  readonly flow_profile_json: string;
  readonly planned_effective_date: string | null;
  readonly owning_unit: string;
  readonly remote_unit: string | null;
  readonly protected_scope_json: string;
  readonly baseline_json: string | null;
  readonly proposed_data_revisions_json: string;
  readonly impact_assessments_json: string;
  readonly study_bindings_json: string;
  readonly study_package_bindings_json: string;
  readonly links_json: string;
  readonly stage: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly created_by: string;
  readonly row_version: number;
};

type StageEventRow = {
  readonly id: string;
  readonly case_id: string;
  readonly stage: string;
  readonly at: string;
  readonly actor: string;
  readonly note: string | null;
};

function toRow(settingCase: SettingCase, rowVersion: number): SettingCaseRow {
  return {
    id: settingCase.id,
    case_type: settingCase.caseType,
    title: settingCase.title,
    description: settingCase.description ?? null,
    primary_reason: settingCase.primaryReason,
    change_items_json: JSON.stringify(settingCase.changeItems),
    urgency: settingCase.urgency,
    flow_profile_json: JSON.stringify(settingCase.flowProfile),
    planned_effective_date: settingCase.plannedEffectiveDate ?? null,
    owning_unit: settingCase.owningUnit,
    remote_unit: settingCase.remoteUnit ?? null,
    protected_scope_json: JSON.stringify(settingCase.protectedScope),
    baseline_json: settingCase.baseline ? JSON.stringify(settingCase.baseline) : null,
    proposed_data_revisions_json: JSON.stringify(settingCase.proposedDataRevisions),
    impact_assessments_json: JSON.stringify(settingCase.impactAssessments),
    study_bindings_json: JSON.stringify(settingCase.studyBindings),
    study_package_bindings_json: JSON.stringify(settingCase.studyPackageBindings),
    links_json: JSON.stringify(settingCase.links),
    stage: settingCase.stage,
    created_at: settingCase.createdAt,
    updated_at: settingCase.updatedAt,
    created_by: settingCase.createdBy,
    row_version: rowVersion,
  };
}

function fromRow(row: SettingCaseRow, stageHistory: SettingCaseStageEvent[]): SettingCase {
  return {
    id: row.id,
    caseType: row.case_type as SettingCase["caseType"],
    title: row.title,
    description: row.description ?? undefined,
    primaryReason: row.primary_reason as SettingCase["primaryReason"],
    changeItems: JSON.parse(row.change_items_json),
    urgency: row.urgency as SettingCase["urgency"],
    flowProfile: JSON.parse(row.flow_profile_json),
    plannedEffectiveDate: row.planned_effective_date ?? undefined,
    owningUnit: row.owning_unit,
    remoteUnit: row.remote_unit ?? undefined,
    protectedScope: JSON.parse(row.protected_scope_json),
    baseline: row.baseline_json ? JSON.parse(row.baseline_json) : undefined,
    proposedDataRevisions: JSON.parse(row.proposed_data_revisions_json),
    impactAssessments: JSON.parse(row.impact_assessments_json),
    studyBindings: JSON.parse(row.study_bindings_json),
    studyPackageBindings: JSON.parse(row.study_package_bindings_json),
    links: JSON.parse(row.links_json),
    stage: row.stage as SettingCase["stage"],
    stageHistory,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function versionLabel(rowVersion: number): string {
  return `v${rowVersion}`;
}

export class D1SettingCaseRepository implements SettingCaseRepository {
  constructor(private readonly driver: SqlDriver) {}

  async list(): Promise<readonly SettingCase[]> {
    const { results } = await this.driver
      .prepare("SELECT * FROM setting_case ORDER BY created_at ASC")
      .all<SettingCaseRow>();
    const cases = await Promise.all(results.map((row) => this.hydrate(row)));
    return cases;
  }

  async getById(id: string): Promise<SettingCase | undefined> {
    const row = await this.driver
      .prepare("SELECT * FROM setting_case WHERE id = ?")
      .bind(id)
      .first<SettingCaseRow>();
    if (!row) return undefined;
    return this.hydrate(row);
  }

  async save(
    settingCase: SettingCase,
    options: RepositoryWriteOptions = {}
  ): Promise<RepositoryWriteResult<SettingCase>> {
    const existing = await this.driver
      .prepare("SELECT row_version FROM setting_case WHERE id = ?")
      .bind(settingCase.id)
      .first<{ row_version: number }>();
    const currentVersion = existing ? versionLabel(existing.row_version) : undefined;
    if (
      options.expectedVersion !== undefined &&
      options.expectedVersion !== currentVersion
    ) {
      throw new RepositoryConflictError(
        `Setting Case ${settingCase.id} berubah: expected ${options.expectedVersion}, current ${currentVersion ?? "missing"}.`
      );
    }

    const nextVersion = (existing?.row_version ?? 0) + 1;
    const row = toRow(settingCase, nextVersion);

    if (existing) {
      const result = await this.driver
        .prepare(
          `UPDATE setting_case SET
            case_type = ?, title = ?, description = ?, primary_reason = ?,
            change_items_json = ?, urgency = ?, flow_profile_json = ?,
            planned_effective_date = ?, owning_unit = ?, remote_unit = ?,
            protected_scope_json = ?, baseline_json = ?,
            proposed_data_revisions_json = ?, impact_assessments_json = ?,
            study_bindings_json = ?, study_package_bindings_json = ?,
            links_json = ?, stage = ?, updated_at = ?, row_version = ?
          WHERE id = ? AND row_version = ?`
        )
        .bind(
          row.case_type,
          row.title,
          row.description,
          row.primary_reason,
          row.change_items_json,
          row.urgency,
          row.flow_profile_json,
          row.planned_effective_date,
          row.owning_unit,
          row.remote_unit,
          row.protected_scope_json,
          row.baseline_json,
          row.proposed_data_revisions_json,
          row.impact_assessments_json,
          row.study_bindings_json,
          row.study_package_bindings_json,
          row.links_json,
          row.stage,
          row.updated_at,
          row.row_version,
          row.id,
          existing.row_version
        )
        .run();
      if (result.changes === 0) {
        throw new RepositoryConflictError(
          `Setting Case ${settingCase.id} berubah bersamaan (concurrent write terdeteksi saat UPDATE).`
        );
      }
    } else {
      await this.driver
        .prepare(
          `INSERT INTO setting_case (
            id, case_type, title, description, primary_reason,
            change_items_json, urgency, flow_profile_json,
            planned_effective_date, owning_unit, remote_unit,
            protected_scope_json, baseline_json,
            proposed_data_revisions_json, impact_assessments_json,
            study_bindings_json, study_package_bindings_json, links_json,
            stage, created_at, updated_at, created_by, row_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.id,
          row.case_type,
          row.title,
          row.description,
          row.primary_reason,
          row.change_items_json,
          row.urgency,
          row.flow_profile_json,
          row.planned_effective_date,
          row.owning_unit,
          row.remote_unit,
          row.protected_scope_json,
          row.baseline_json,
          row.proposed_data_revisions_json,
          row.impact_assessments_json,
          row.study_bindings_json,
          row.study_package_bindings_json,
          row.links_json,
          row.stage,
          row.created_at,
          row.updated_at,
          row.created_by,
          row.row_version
        )
        .run();
    }

    await this.replaceStageHistory(settingCase.id, settingCase.stageHistory);

    const record = await this.getById(settingCase.id);
    if (!record) {
      throw new Error(`Setting Case ${settingCase.id} tidak ditemukan setelah save().`);
    }
    return { record, version: versionLabel(nextVersion) };
  }

  private async replaceStageHistory(
    caseId: string,
    stageHistory: readonly SettingCaseStageEvent[]
  ): Promise<void> {
    await this.driver.prepare("DELETE FROM case_stage_event WHERE case_id = ?").bind(caseId).run();
    for (let index = 0; index < stageHistory.length; index += 1) {
      const event = stageHistory[index];
      await this.driver
        .prepare(
          "INSERT INTO case_stage_event (id, case_id, stage, at, actor, note) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(`${caseId}_stage_${index}`, caseId, event.stage, event.at, event.actor, event.note ?? null)
        .run();
    }
  }

  private async hydrate(row: SettingCaseRow): Promise<SettingCase> {
    const { results } = await this.driver
      .prepare("SELECT * FROM case_stage_event WHERE case_id = ? ORDER BY rowid ASC")
      .bind(row.id)
      .all<StageEventRow>();
    // `note` is omitted entirely when absent (not set to `undefined`),
    // matching the shape of stageHistory entries built in-memory —
    // otherwise deepEqual against the original object shape fails.
    const stageHistory: SettingCaseStageEvent[] = results.map((event) => {
      const base: SettingCaseStageEvent = {
        stage: event.stage as SettingCaseStageEvent["stage"],
        at: event.at,
        actor: event.actor,
      };
      return event.note ? { ...base, note: event.note } : base;
    });
    return fromRow(row, stageHistory);
  }
}
