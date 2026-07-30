import type {
  Bay,
  Busbar,
  LineRelation,
  Terminal,
  UnifiedNetwork,
  UnifiedSubstation,
} from "./unified";

export type EngineeringChangeType =
  | "insert-substation"
  | "add-bay"
  | "reconductoring"
  | "replace-instrument-transformer"
  | "replace-relay"
  | "revise-setting";

export type EngineeringChangeBaseline = {
  readonly studyId?: string;
  readonly scenarioId?: string;
  readonly networkSnapshotId?: string;
  readonly faultSnapshotId?: string;
  readonly networkRevisionId: string;
  readonly warnings: readonly string[];
};

export type AffectedTopologySnapshot = {
  readonly substations: readonly UnifiedSubstation[];
  readonly busbars: readonly Busbar[];
  readonly bays: readonly Bay[];
  readonly terminals: readonly Terminal[];
  readonly relations: readonly LineRelation[];
};

export type TopologyEntityKind =
  | "substation"
  | "busbar"
  | "bay"
  | "terminal"
  | "relation";

export type TopologyChangeOperation = {
  readonly operation: "add" | "remove" | "update";
  readonly entityKind: TopologyEntityKind;
  readonly entityId: string;
  readonly changedFields: readonly string[];
  readonly before?: unknown;
  readonly after?: unknown;
};

export type EngineeringChangeSet = {
  readonly id: string;
  readonly caseId: string;
  readonly changeType: EngineeringChangeType;
  readonly title: string;
  readonly summary: string;
  readonly createdAt: string;
  readonly actor: string;
  readonly baseline: EngineeringChangeBaseline;
  readonly affectedEntityIds: readonly string[];
  readonly before: AffectedTopologySnapshot;
  readonly after: AffectedTopologySnapshot;
  readonly operations: readonly TopologyChangeOperation[];
  readonly fingerprint: {
    readonly algorithm: "fnv1a32";
    readonly value: string;
  };
  readonly validation: {
    readonly valid: boolean;
    readonly errors: readonly string[];
  };
};

export type BuildInsertionChangeSetInput = {
  id: string;
  caseId: string;
  createdAt: string;
  actor: string;
  baseline: EngineeringChangeBaseline;
  beforeNetwork: UnifiedNetwork;
  afterNetwork: UnifiedNetwork;
  oldRelationId: string;
  newSubstationId: string;
  newRelationIds: string[];
};

const ENTITY_ORDER: TopologyEntityKind[] = [
  "substation",
  "busbar",
  "bay",
  "terminal",
  "relation",
];

/**
 * Builds an append-only evidence record for a GI insertion. The snapshot is
 * intentionally limited to the affected subgraph, so one change set does not
 * duplicate the full UPT network in local persistence.
 */
export function buildInsertionChangeSet(
  input: BuildInsertionChangeSetInput
): EngineeringChangeSet {
  const relationIds = uniqueSorted([input.oldRelationId, ...input.newRelationIds]);
  const substationIds = collectAffectedSubstationIds(
    input.beforeNetwork,
    input.afterNetwork,
    relationIds,
    input.newSubstationId
  );
  const bayIds = collectAffectedBayIds(
    input.beforeNetwork,
    input.afterNetwork,
    relationIds
  );

  const before = captureAffectedTopology(
    input.beforeNetwork,
    substationIds,
    bayIds,
    relationIds
  );
  const after = captureAffectedTopology(
    input.afterNetwork,
    substationIds,
    bayIds,
    relationIds
  );
  const operations = diffAffectedTopology(before, after);
  const validationErrors = validateAffectedTopology(after);

  const oldBefore = before.relations.find(
    (relation) => relation.id === input.oldRelationId
  );
  const oldAfter = after.relations.find(
    (relation) => relation.id === input.oldRelationId
  );
  if (!oldBefore) {
    validationErrors.push(`Original relation ${input.oldRelationId} is missing from before snapshot.`);
  }
  if (oldAfter?.status !== "superseded") {
    validationErrors.push(
      `Original relation ${input.oldRelationId} must be superseded in after snapshot.`
    );
  }
  for (const relationId of input.newRelationIds) {
    if (!after.relations.some((relation) => relation.id === relationId)) {
      validationErrors.push(`New relation ${relationId} is missing from after snapshot.`);
    }
  }
  if (
    !after.substations.some(
      (substation) => substation.id === input.newSubstationId
    )
  ) {
    validationErrors.push(
      `Inserted substation ${input.newSubstationId} is missing from after snapshot.`
    );
  }

  const newSubstation = after.substations.find(
    (substation) => substation.id === input.newSubstationId
  );
  const fingerprintPayload = {
    changeType: "insert-substation",
    caseId: input.caseId,
    baseline: input.baseline,
    before,
    after,
    operations,
  };

  const changeSet: EngineeringChangeSet = {
    id: input.id,
    caseId: input.caseId,
    changeType: "insert-substation",
    title: `Insert ${newSubstation?.name ?? input.newSubstationId}`,
    summary: `${input.oldRelationId} -> ${input.newRelationIds.join(" + ")}`,
    createdAt: input.createdAt,
    actor: input.actor,
    baseline: cloneBaseline(input.baseline),
    affectedEntityIds: uniqueSorted([
      ...substationIds,
      ...bayIds,
      ...relationIds,
      ...before.busbars.map((item) => item.id),
      ...after.busbars.map((item) => item.id),
      ...before.terminals.map((item) => item.id),
      ...after.terminals.map((item) => item.id),
    ]),
    before,
    after,
    operations,
    fingerprint: {
      algorithm: "fnv1a32",
      value: fnv1a32(stableStringify(fingerprintPayload)),
    },
    validation: {
      valid: validationErrors.length === 0,
      errors: uniqueSorted(validationErrors),
    },
  };

  return deepFreeze(changeSet);
}

export function diffAffectedTopology(
  before: AffectedTopologySnapshot,
  after: AffectedTopologySnapshot
): TopologyChangeOperation[] {
  const beforeByKind = topologyArrays(before);
  const afterByKind = topologyArrays(after);
  const operations: TopologyChangeOperation[] = [];

  for (const kind of ENTITY_ORDER) {
    const beforeItems = new Map(
      beforeByKind[kind].map((item) => [item.id, item])
    );
    const afterItems = new Map(
      afterByKind[kind].map((item) => [item.id, item])
    );
    const ids = uniqueSorted([...beforeItems.keys(), ...afterItems.keys()]);

    for (const id of ids) {
      const previous = beforeItems.get(id);
      const next = afterItems.get(id);
      if (!previous && next) {
        operations.push({
          operation: "add",
          entityKind: kind,
          entityId: id,
          changedFields: Object.keys(next).sort(),
          after: cloneJson(next),
        });
        continue;
      }
      if (previous && !next) {
        operations.push({
          operation: "remove",
          entityKind: kind,
          entityId: id,
          changedFields: Object.keys(previous).sort(),
          before: cloneJson(previous),
        });
        continue;
      }
      if (!previous || !next) continue;
      const changedFields = changedTopLevelFields(previous, next);
      if (changedFields.length > 0) {
        operations.push({
          operation: "update",
          entityKind: kind,
          entityId: id,
          changedFields,
          before: cloneJson(previous),
          after: cloneJson(next),
        });
      }
    }
  }

  return operations;
}

export function validateAffectedTopology(
  snapshot: AffectedTopologySnapshot
): string[] {
  const errors: string[] = [];
  const substationIds = new Set(snapshot.substations.map((item) => item.id));
  const busbarIds = new Set(snapshot.busbars.map((item) => item.id));
  const bayIds = new Set(snapshot.bays.map((item) => item.id));

  for (const busbar of snapshot.busbars) {
    if (!substationIds.has(busbar.substationId)) {
      errors.push(
        `Busbar ${busbar.id} references missing substation ${busbar.substationId}.`
      );
    }
  }
  for (const bay of snapshot.bays) {
    if (!substationIds.has(bay.substationId)) {
      errors.push(`Bay ${bay.id} references missing substation ${bay.substationId}.`);
    }
  }
  for (const terminal of snapshot.terminals) {
    if (!bayIds.has(terminal.bayId)) {
      errors.push(`Terminal ${terminal.id} references missing bay ${terminal.bayId}.`);
    }
    if (!busbarIds.has(terminal.busbarId)) {
      errors.push(
        `Terminal ${terminal.id} references missing busbar ${terminal.busbarId}.`
      );
    }
  }
  for (const relation of snapshot.relations) {
    if (!substationIds.has(relation.fromSubstationId)) {
      errors.push(
        `Relation ${relation.id} references missing from-substation ${relation.fromSubstationId}.`
      );
    }
    if (!substationIds.has(relation.toSubstationId)) {
      errors.push(
        `Relation ${relation.id} references missing to-substation ${relation.toSubstationId}.`
      );
    }
    if (!bayIds.has(relation.fromBayId)) {
      errors.push(
        `Relation ${relation.id} references missing from-bay ${relation.fromBayId}.`
      );
    }
    if (!bayIds.has(relation.toBayId)) {
      errors.push(
        `Relation ${relation.id} references missing to-bay ${relation.toBayId}.`
      );
    }
  }

  return uniqueSorted(errors);
}

function captureAffectedTopology(
  network: UnifiedNetwork,
  substationIds: string[],
  bayIds: string[],
  relationIds: string[]
): AffectedTopologySnapshot {
  const substationIdSet = new Set(substationIds);
  const bayIdSet = new Set(bayIds);
  const relationIdSet = new Set(relationIds);
  return {
    substations: cloneAndSort(
      network.substations.filter((item) => substationIdSet.has(item.id))
    ),
    busbars: cloneAndSort(
      network.busbars.filter((item) => substationIdSet.has(item.substationId))
    ),
    bays: cloneAndSort(network.bays.filter((item) => bayIdSet.has(item.id))),
    terminals: cloneAndSort(
      network.terminals.filter((item) => bayIdSet.has(item.bayId))
    ),
    relations: cloneAndSort(
      network.lineRelations.filter((item) => relationIdSet.has(item.id))
    ),
  };
}

function collectAffectedSubstationIds(
  before: UnifiedNetwork,
  after: UnifiedNetwork,
  relationIds: string[],
  newSubstationId: string
): string[] {
  const ids = [newSubstationId];
  for (const network of [before, after]) {
    for (const relation of network.lineRelations) {
      if (!relationIds.includes(relation.id)) continue;
      ids.push(relation.fromSubstationId, relation.toSubstationId);
    }
  }
  return uniqueSorted(ids);
}

function collectAffectedBayIds(
  before: UnifiedNetwork,
  after: UnifiedNetwork,
  relationIds: string[]
): string[] {
  const ids: string[] = [];
  for (const network of [before, after]) {
    for (const relation of network.lineRelations) {
      if (!relationIds.includes(relation.id)) continue;
      ids.push(relation.fromBayId, relation.toBayId);
    }
  }
  return uniqueSorted(ids);
}

function topologyArrays(
  snapshot: AffectedTopologySnapshot
): Record<TopologyEntityKind, ReadonlyArray<{ id: string }>> {
  return {
    substation: snapshot.substations,
    busbar: snapshot.busbars,
    bay: snapshot.bays,
    terminal: snapshot.terminals,
    relation: snapshot.relations,
  };
}

function changedTopLevelFields(
  before: { id: string },
  after: { id: string }
): string[] {
  const beforeRecord = before as unknown as Record<string, unknown>;
  const afterRecord = after as unknown as Record<string, unknown>;
  return uniqueSorted([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]).filter(
    (key) => stableStringify(beforeRecord[key]) !== stableStringify(afterRecord[key])
  );
}

function cloneAndSort<T extends { id: string }>(items: T[]): T[] {
  return items
    .map((item) => cloneJson(item))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function cloneBaseline(
  baseline: EngineeringChangeBaseline
): EngineeringChangeBaseline {
  return {
    ...baseline,
    warnings: [...baseline.warnings],
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right)
  );
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
