import type { EngineeringChangeSet } from "./engineering-change";
import {
  evaluateDataReadiness,
  type DataReadinessItem,
  type DataReadinessResult,
} from "./engineering-readiness";

export type DigsilentStagingSubstation = {
  id: string;
  name: string;
  shortCode: string;
  kind: string;
  voltageKv: number;
};

export type DigsilentStagingLine = {
  id: string;
  fromSubstationId: string;
  toSubstationId: string;
  circuit: string;
  voltageKv: number;
  lengthKm: number;
  r1OhmTotal: number;
  x1OhmTotal: number;
  r0OhmTotal: number;
  x0OhmTotal: number;
  r1OhmPerKm: number;
  x1OhmPerKm: number;
  r0OhmPerKm: number;
  x0OhmPerKm: number;
  lifecycleStatus: string;
};

export type DigsilentStagingPackage = {
  schemaVersion: "plms-digsilent-staging/1.0";
  packageType: "neutral-preview";
  generatedAt: string;
  importReady: boolean;
  disclaimer: string;
  source: {
    changeSetId: string;
    changeFingerprint: string;
    caseId: string;
    networkRevisionId: string;
    networkSnapshotId?: string;
    scenarioId?: string;
  };
  validationReport: {
    status: DataReadinessResult["status"];
    requiredFieldMatrixVersion: string;
    counts: DataReadinessResult["counts"];
    issues: DataReadinessItem[];
  };
  substations: DigsilentStagingSubstation[];
  lines: DigsilentStagingLine[];
};

export type DigsilentStagingBuildResult =
  | {
      status: "blocked";
      readiness: DataReadinessResult;
      reason: string;
    }
  | {
      status: "ready";
      readiness: DataReadinessResult;
      package: DigsilentStagingPackage;
    };

/**
 * Produces a vendor-neutral preview package. It is intentionally not an
 * official PowerFactory DGS writer: field/address mapping and round-trip
 * validation remain a later integration task.
 */
export function buildDigsilentStagingPackage(
  changeSet: EngineeringChangeSet,
  generatedAt: string
): DigsilentStagingBuildResult {
  const readiness = evaluateDataReadiness(changeSet);
  if (!readiness.canGeneratePreview) {
    return {
      status: "blocked",
      readiness,
      reason:
        "Neutral staging preview is blocked until required topology/electrical fields and conflicts are resolved.",
    };
  }

  const addedSubstationIds = new Set(
    changeSet.operations
      .filter(
        (operation) =>
          operation.operation === "add" &&
          operation.entityKind === "substation"
      )
      .map((operation) => operation.entityId)
  );
  const addedRelationIds = new Set(
    changeSet.operations
      .filter(
        (operation) =>
          operation.operation === "add" && operation.entityKind === "relation"
      )
      .map((operation) => operation.entityId)
  );

  const substations = changeSet.after.substations
    .filter((substation) => addedSubstationIds.has(substation.id))
    .map<DigsilentStagingSubstation>((substation) => ({
      id: substation.id,
      name: substation.name,
      shortCode: substation.shortCode,
      kind: substation.kind,
      voltageKv: substation.voltageKv,
    }))
    .sort(byId);

  const lines = changeSet.after.relations
    .filter((relation) => addedRelationIds.has(relation.id))
    .map<DigsilentStagingLine>((relation) => {
      const lengthKm = requiredNumber(relation.physicalLengthKm, "physicalLengthKm");
      const r1OhmTotal = requiredNumber(relation.r1Ohm, "r1Ohm");
      const x1OhmTotal = requiredNumber(
        relation.x1Ohm ?? relation.lineXOhm,
        "x1Ohm"
      );
      const r0OhmTotal = requiredNumber(relation.r0Ohm, "r0Ohm");
      const x0OhmTotal = requiredNumber(relation.x0Ohm, "x0Ohm");
      return {
        id: relation.id,
        fromSubstationId: relation.fromSubstationId,
        toSubstationId: relation.toSubstationId,
        circuit: relation.circuit,
        voltageKv: relation.voltageKv,
        lengthKm,
        r1OhmTotal,
        x1OhmTotal,
        r0OhmTotal,
        x0OhmTotal,
        r1OhmPerKm: r1OhmTotal / lengthKm,
        x1OhmPerKm: x1OhmTotal / lengthKm,
        r0OhmPerKm: r0OhmTotal / lengthKm,
        x0OhmPerKm: x0OhmTotal / lengthKm,
        lifecycleStatus: relation.status,
      };
    })
    .sort(byId);

  return {
    status: "ready",
    readiness,
    package: {
      schemaVersion: "plms-digsilent-staging/1.0",
      packageType: "neutral-preview",
      generatedAt,
      importReady: readiness.readyForStudy,
      disclaimer:
        "Neutral PLMS staging preview only. This is not an official DIgSILENT PowerFactory DGS file and must not be imported without adapter mapping and engineer validation.",
      source: {
        changeSetId: changeSet.id,
        changeFingerprint: `${changeSet.fingerprint.algorithm}:${changeSet.fingerprint.value}`,
        caseId: changeSet.caseId,
        networkRevisionId: changeSet.baseline.networkRevisionId,
        networkSnapshotId: changeSet.baseline.networkSnapshotId,
        scenarioId: changeSet.baseline.scenarioId,
      },
      validationReport: {
        status: readiness.status,
        requiredFieldMatrixVersion: readiness.requiredFieldMatrixVersion,
        counts: readiness.counts,
        issues: readiness.items.filter((readinessItem) => readinessItem.status !== "complete"),
      },
      substations,
      lines,
    },
  };
}

export function serializeStagingPackageJson(
  stagingPackage: DigsilentStagingPackage
): string {
  return JSON.stringify(stagingPackage, null, 2);
}

export function serializeStagingLinesCsv(
  stagingPackage: DigsilentStagingPackage
): string {
  const headers: Array<keyof DigsilentStagingLine> = [
    "id",
    "fromSubstationId",
    "toSubstationId",
    "circuit",
    "voltageKv",
    "lengthKm",
    "r1OhmTotal",
    "x1OhmTotal",
    "r0OhmTotal",
    "x0OhmTotal",
    "r1OhmPerKm",
    "x1OhmPerKm",
    "r0OhmPerKm",
    "x0OhmPerKm",
    "lifecycleStatus",
  ];
  return [
    headers.join(","),
    ...stagingPackage.lines.map((line) =>
      headers.map((header) => csvCell(line[header])).join(",")
    ),
  ].join("\r\n");
}

export function serializeNeutralDgsPreview(
  stagingPackage: DigsilentStagingPackage
): string {
  const rows = [
    "$$PLMS_NEUTRAL_DGS_PREVIEW;1.0",
    `$$DISCLAIMER;${stagingPackage.disclaimer}`,
    `$$CHANGE_SET;${stagingPackage.source.changeSetId};${stagingPackage.source.changeFingerprint}`,
    "$SUBSTATIONS;id;name;shortCode;kind;voltageKv",
    ...stagingPackage.substations.map((substation) =>
      [
        "SUB",
        substation.id,
        substation.name,
        substation.shortCode,
        substation.kind,
        substation.voltageKv,
      ]
        .map(dgsCell)
        .join(";")
    ),
    "$LINES;id;from;to;circuit;voltageKv;lengthKm;r1OhmPerKm;x1OhmPerKm;r0OhmPerKm;x0OhmPerKm",
    ...stagingPackage.lines.map((line) =>
      [
        "LINE",
        line.id,
        line.fromSubstationId,
        line.toSubstationId,
        line.circuit,
        line.voltageKv,
        line.lengthKm,
        line.r1OhmPerKm,
        line.x1OhmPerKm,
        line.r0OhmPerKm,
        line.x0OhmPerKm,
      ]
        .map(dgsCell)
        .join(";")
    ),
  ];
  return rows.join("\r\n");
}

function requiredNumber(value: number | undefined, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} passed readiness but is not a positive number.`);
  }
  return value;
}

function byId<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function dgsCell(value: string | number): string {
  return String(value).replace(/[;\r\n]/g, " ");
}
