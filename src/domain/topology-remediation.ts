import type { GraphBuildGroup } from "./graph-builder";
import type { Bay, LineRelation, UnifiedSubstation } from "./unified";

export type TopologyReviewScope = {
  id: string;
  subjectLineId?: string;
  subjectBayId?: string;
  substationIds: string[];
};

export type ScopedTopologyCandidate = {
  group: GraphBuildGroup;
  relation: LineRelation;
  bays: Bay[];
  supportingSubstations: UnifiedSubstation[];
};

export function topologyDecisionKey(contextId: string, relationId: string) {
  return `topology:${contextId}:${relationId}`;
}

export function findGraphSubstation(groups: GraphBuildGroup[], id: string) {
  return groups
    .flatMap((group) => [group.station, ...group.supportingSubstations])
    .find((station) => station.id === id);
}

/**
 * Converts the ULTG-wide extraction into the smallest reviewable set for one
 * Case or Study. Subject line wins over subject bay; GI scope is only used
 * when neither subject is known. Relation ids are deduplicated because the
 * graph builder can expose the same edge from both endpoint groups.
 */
export function buildScopedTopologyCandidates(
  groups: GraphBuildGroup[],
  context: TopologyReviewScope
): ScopedTopologyCandidate[] {
  const scopeIds = new Set(context.substationIds);
  const allBays = uniqueById(groups.flatMap((group) => group.bays));
  const allSubstations = uniqueById(
    groups.flatMap((group) => [group.station, ...group.supportingSubstations])
  );
  const seenRelations = new Set<string>();
  const candidates: ScopedTopologyCandidate[] = [];

  for (const group of groups) {
    for (const relation of group.lineRelations) {
      const relevant = context.subjectLineId
        ? relation.id === context.subjectLineId
        : context.subjectBayId
          ? relation.fromBayId === context.subjectBayId ||
            relation.toBayId === context.subjectBayId
          : scopeIds.has(relation.fromSubstationId) ||
            scopeIds.has(relation.toSubstationId);
      if (!relevant || seenRelations.has(relation.id)) continue;
      seenRelations.add(relation.id);

      const bayIds = new Set([relation.fromBayId, relation.toBayId]);
      const endpointIds = new Set([
        relation.fromSubstationId,
        relation.toSubstationId,
      ]);
      candidates.push({
        group,
        relation,
        bays: allBays.filter((bay) => bayIds.has(bay.id)),
        supportingSubstations: allSubstations.filter(
          (station) =>
            endpointIds.has(station.id) && station.id !== group.station.id
        ),
      });
    }
  }
  return candidates;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return items.filter(
    (item, index) => items.findIndex((candidate) => candidate.id === item.id) === index
  );
}
