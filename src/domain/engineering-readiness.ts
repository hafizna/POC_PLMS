import type { EngineeringChangeSet } from "./engineering-change";
import type { LineRelation } from "./unified";

export type ReadinessStatus = "complete" | "missing" | "conflict" | "stale";
export type ReadinessSeverity = "info" | "warning" | "blocker";

export type DataReadinessItem = {
  id: string;
  category: "baseline" | "topology" | "electrical" | "consistency";
  entityId?: string;
  field?: string;
  status: ReadinessStatus;
  severity: ReadinessSeverity;
  message: string;
  value?: number | string;
};

export type DataReadinessResult = {
  changeSetId: string;
  status: "ready" | "review" | "blocked";
  canGeneratePreview: boolean;
  readyForStudy: boolean;
  items: DataReadinessItem[];
  counts: Record<ReadinessStatus, number>;
  requiredFieldMatrixVersion: string;
};

export const REQUIRED_FIELD_MATRIX_VERSION = "insert-substation-v1";

export const INSERT_SUBSTATION_REQUIRED_FIELDS = {
  baseline: ["scenarioId", "networkSnapshotId", "networkRevisionId"],
  substation: ["name", "shortCode", "voltageKv", "kind"],
  relation: [
    "fromSubstationId",
    "toSubstationId",
    "fromBayId",
    "toBayId",
    "circuit",
    "voltageKv",
    "physicalLengthKm",
    "r1Ohm",
    "x1Ohm",
    "r0Ohm",
    "x0Ohm",
  ],
} as const;

const SUM_TOLERANCE_RATIO = 0.05;

export function evaluateDataReadiness(
  changeSet: EngineeringChangeSet
): DataReadinessResult {
  const items: DataReadinessItem[] = [];

  addBaselineItems(changeSet, items);

  if (changeSet.validation.valid) {
    items.push(
      item(
        "topology-references",
        "topology",
        "complete",
        "info",
        "Affected topology references are internally valid."
      )
    );
  } else {
    for (const [index, error] of changeSet.validation.errors.entries()) {
      items.push(
        item(
          `topology-reference-${index}`,
          "topology",
          "conflict",
          "blocker",
          error
        )
      );
    }
  }

  if (changeSet.changeType === "insert-substation") {
    evaluateInsertion(changeSet, items);
  } else {
    items.push(
      item(
        "unsupported-change-type",
        "topology",
        "missing",
        "blocker",
        `Required-field rules are not implemented for ${changeSet.changeType}.`
      )
    );
  }

  const counts: Record<ReadinessStatus, number> = {
    complete: 0,
    missing: 0,
    conflict: 0,
    stale: 0,
  };
  for (const readinessItem of items) counts[readinessItem.status] += 1;

  const hasBlocker = items.some(
    (readinessItem) =>
      readinessItem.severity === "blocker" &&
      (readinessItem.status === "missing" ||
        readinessItem.status === "conflict")
  );
  const hasStale = counts.stale > 0;
  return {
    changeSetId: changeSet.id,
    status: hasBlocker ? "blocked" : hasStale ? "review" : "ready",
    canGeneratePreview: !hasBlocker,
    readyForStudy: !hasBlocker && !hasStale,
    items,
    counts,
    requiredFieldMatrixVersion: REQUIRED_FIELD_MATRIX_VERSION,
  };
}

function addBaselineItems(
  changeSet: EngineeringChangeSet,
  items: DataReadinessItem[]
) {
  for (const field of INSERT_SUBSTATION_REQUIRED_FIELDS.baseline) {
    const value = changeSet.baseline[field];
    if (hasValue(value)) {
      items.push(
        item(
          `baseline-${field}`,
          "baseline",
          "complete",
          "info",
          `Baseline ${field} is available.`,
          undefined,
          field,
          String(value)
        )
      );
    } else {
      items.push(
        item(
          `baseline-${field}`,
          "baseline",
          "missing",
          "blocker",
          `Baseline ${field} is required.`,
          undefined,
          field
        )
      );
    }
  }

  for (const [index, warning] of changeSet.baseline.warnings.entries()) {
    items.push(
      item(
        `baseline-warning-${index}`,
        "baseline",
        "stale",
        "warning",
        warning
      )
    );
  }
}

function evaluateInsertion(
  changeSet: EngineeringChangeSet,
  items: DataReadinessItem[]
) {
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
  const addedSubstations = changeSet.after.substations.filter((substation) =>
    addedSubstationIds.has(substation.id)
  );
  const addedRelations = changeSet.after.relations.filter((relation) =>
    addedRelationIds.has(relation.id)
  );

  if (addedSubstations.length !== 1) {
    items.push(
      item(
        "inserted-substation-count",
        "topology",
        "conflict",
        "blocker",
        `GI insertion must add exactly one substation; found ${addedSubstations.length}.`
      )
    );
  }
  if (addedRelations.length !== 2) {
    items.push(
      item(
        "inserted-relation-count",
        "topology",
        "conflict",
        "blocker",
        `GI insertion must add exactly two line segments; found ${addedRelations.length}.`
      )
    );
  }

  for (const substation of addedSubstations) {
    for (const field of INSERT_SUBSTATION_REQUIRED_FIELDS.substation) {
      addRequiredField(
        items,
        "topology",
        substation.id,
        field,
        substation[field],
        isPositiveField(field)
      );
    }
  }

  for (const relation of addedRelations) {
    for (const field of INSERT_SUBSTATION_REQUIRED_FIELDS.relation) {
      addRequiredField(
        items,
        field.endsWith("Ohm") || field === "physicalLengthKm"
          ? "electrical"
          : "topology",
        relation.id,
        field,
        relation[field],
        isPositiveField(field)
      );
    }
    if (
      relation.lineXOhm != null &&
      relation.x1Ohm != null &&
      !withinTolerance(relation.lineXOhm, relation.x1Ohm, 1e-9)
    ) {
      items.push(
        item(
          `${relation.id}-x1-alias-conflict`,
          "consistency",
          "conflict",
          "blocker",
          `Legacy lineXOhm (${relation.lineXOhm}) differs from x1Ohm (${relation.x1Ohm}).`,
          relation.id,
          "x1Ohm"
        )
      );
    }
  }

  const original = changeSet.before.relations.find((relation) =>
    changeSet.operations.some(
      (operation) =>
        operation.operation === "update" &&
        operation.entityKind === "relation" &&
        operation.entityId === relation.id &&
        operation.changedFields.includes("status")
    )
  );
  if (original && addedRelations.length === 2) {
    compareSegmentSum(items, original, addedRelations, "physicalLengthKm");
    compareSegmentSum(items, original, addedRelations, "r1Ohm");
    compareSegmentSum(items, original, addedRelations, "x1Ohm");
    compareSegmentSum(items, original, addedRelations, "r0Ohm");
    compareSegmentSum(items, original, addedRelations, "x0Ohm");
  }
}

function addRequiredField(
  items: DataReadinessItem[],
  category: DataReadinessItem["category"],
  entityId: string,
  field: string,
  value: unknown,
  mustBePositive: boolean
) {
  const numericInvalid =
    mustBePositive &&
    (typeof value !== "number" || !Number.isFinite(value) || value <= 0);
  if (!hasValue(value) || numericInvalid) {
    items.push(
      item(
        `${entityId}-${field}`,
        category,
        "missing",
        "blocker",
        `${field} is required${mustBePositive ? " and must be greater than zero" : ""}.`,
        entityId,
        field
      )
    );
    return;
  }
  items.push(
    item(
      `${entityId}-${field}`,
      category,
      "complete",
      "info",
      `${field} is available.`,
      entityId,
      field,
      typeof value === "number" || typeof value === "string"
        ? value
        : String(value)
    )
  );
}

function compareSegmentSum(
  items: DataReadinessItem[],
  original: LineRelation,
  segments: readonly LineRelation[],
  field: "physicalLengthKm" | "r1Ohm" | "x1Ohm" | "r0Ohm" | "x0Ohm"
) {
  const originalValue =
    field === "x1Ohm"
      ? original.x1Ohm ?? original.lineXOhm
      : original[field];
  const segmentValues = segments.map((segment) =>
    field === "x1Ohm" ? segment.x1Ohm ?? segment.lineXOhm : segment[field]
  );
  if (
    typeof originalValue !== "number" ||
    segmentValues.some((value) => typeof value !== "number")
  ) {
    return;
  }
  const sum = segmentValues.reduce<number>(
    (total, value) => total + (value as number),
    0
  );
  if (!withinTolerance(originalValue, sum, SUM_TOLERANCE_RATIO)) {
    items.push(
      item(
        `segment-sum-${field}`,
        "consistency",
        "conflict",
        "blocker",
        `${field} segment sum ${sum} differs from original ${originalValue} by more than ${SUM_TOLERANCE_RATIO * 100}%.`,
        original.id,
        field,
        sum
      )
    );
  } else {
    items.push(
      item(
        `segment-sum-${field}`,
        "consistency",
        "complete",
        "info",
        `${field} segment sum is consistent with the original line.`,
        original.id,
        field,
        sum
      )
    );
  }
}

function item(
  id: string,
  category: DataReadinessItem["category"],
  status: ReadinessStatus,
  severity: ReadinessSeverity,
  message: string,
  entityId?: string,
  field?: string,
  value?: number | string
): DataReadinessItem {
  return {
    id,
    category,
    entityId,
    field,
    status,
    severity,
    message,
    value,
  };
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function isPositiveField(field: string): boolean {
  return (
    field === "voltageKv" ||
    field === "physicalLengthKm" ||
    field === "r1Ohm" ||
    field === "x1Ohm" ||
    field === "r0Ohm" ||
    field === "x0Ohm"
  );
}

function withinTolerance(
  expected: number,
  actual: number,
  ratio: number
): boolean {
  const denominator = Math.max(Math.abs(expected), 1e-12);
  return Math.abs(actual - expected) / denominator <= ratio;
}
