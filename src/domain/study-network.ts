import { getFullAnchoredNetwork } from "./graph-builder";
import {
  getEffectiveNetworkGraph,
  INVENTORY_MASTER_CASE_ID,
  type NetworkGraphOverrideShape,
} from "./network-graph";
import type { UnifiedNetwork } from "./unified";

export type StudyNetworkScope = {
  id: string;
  subjectLineId?: string;
  substationIds: string[];
  scopeRevision?: number;
};

export type StudyNetworkResolution = {
  network?: UnifiedNetwork;
  ready: boolean;
  blockers: string[];
  warnings: string[];
  fingerprint: string;
};

/**
 * Runtime topology authority for engineering work. The historical generated
 * corridor is intentionally absent: confirmed source anchors form the base,
 * while Graph Builder confirmations are applied as master overrides.
 */
export function getConfirmedMasterNetwork(
  override?: NetworkGraphOverrideShape
): UnifiedNetwork {
  return (
    getEffectiveNetworkGraph(
      INVENTORY_MASTER_CASE_ID,
      override,
      getFullAnchoredNetwork()
    ) ?? getFullAnchoredNetwork()
  );
}

export function suggestedStudyScope(
  master: UnifiedNetwork,
  subjectLineId: string
): string[] {
  const subject = master.lineRelations.find((relation) => relation.id === subjectLineId);
  if (!subject) return [];
  const ids = new Set([subject.fromSubstationId, subject.toSubstationId]);
  for (const relation of master.lineRelations) {
    if (
      relation.fromSubstationId === subject.fromSubstationId ||
      relation.toSubstationId === subject.fromSubstationId ||
      relation.fromSubstationId === subject.toSubstationId ||
      relation.toSubstationId === subject.toSubstationId
    ) {
      ids.add(relation.fromSubstationId);
      ids.add(relation.toSubstationId);
    }
  }
  return [...ids].sort();
}

/** Derive a reproducible Study view by projecting the confirmed master graph. */
export function deriveStudyNetwork(
  master: UnifiedNetwork,
  study: StudyNetworkScope | null | undefined
): StudyNetworkResolution {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!study) {
    return {
      ready: false,
      blockers: ["Belum ada Study aktif. Pilih bay/line atau buat Study baru."],
      warnings,
      fingerprint: "no-active-study",
    };
  }
  if (!study.subjectLineId) {
    return {
      ready: false,
      blockers: ["Study belum memiliki subject line. Pilih bay/line yang akan dianalisis."],
      warnings,
      fingerprint: `${study.id}:no-subject`,
    };
  }
  const subject = master.lineRelations.find(
    (relation) => relation.id === study.subjectLineId
  );
  if (!subject || subject.status === "rejected" || subject.status === "superseded") {
    return {
      ready: false,
      blockers: [
        "Subject line belum tersedia sebagai confirmed LineRelation. Lengkapi atau konfirmasi topology di Graph Builder.",
      ],
      warnings,
      fingerprint: `${study.id}:${study.subjectLineId}:missing`,
    };
  }

  const scopeIds = new Set(study.substationIds);
  scopeIds.add(subject.fromSubstationId);
  scopeIds.add(subject.toSubstationId);
  const missingScopeIds = [...scopeIds].filter(
    (id) => !master.substations.some((station) => station.id === id)
  );
  if (missingScopeIds.length > 0) {
    warnings.push(
      `${missingScopeIds.length} GI pada scope revision tidak lagi ditemukan di master graph.`
    );
  }

  const lineRelations = master.lineRelations.filter(
    (relation) =>
      scopeIds.has(relation.fromSubstationId) &&
      scopeIds.has(relation.toSubstationId) &&
      relation.status !== "rejected" &&
      relation.status !== "superseded"
  );
  const relationIds = new Set(lineRelations.map((relation) => relation.id));
  if (!relationIds.has(subject.id)) {
    blockers.push("Subject line tidak lolos projection scope Study.");
  }
  const bayIds = new Set(
    lineRelations.flatMap((relation) => [relation.fromBayId, relation.toBayId])
  );
  const bays = master.bays.filter((bay) => bayIds.has(bay.id));
  const relayIeds = master.relayIeds.filter((ied) => bayIds.has(ied.bayId));
  const relayIds = new Set(relayIeds.map((ied) => ied.id));
  const protectionFunctions = master.protectionFunctions.filter((fn) =>
    relayIds.has(fn.relayIedId)
  );
  const functionIds = new Set(protectionFunctions.map((fn) => fn.id));
  const substations = master.substations.filter((station) => scopeIds.has(station.id));
  const network: UnifiedNetwork = {
    caseId: `study_${study.id}_scope_${study.scopeRevision ?? 1}`,
    substations,
    busbars: master.busbars.filter((busbar) => scopeIds.has(busbar.substationId)),
    bays,
    terminals: master.terminals.filter((terminal) => bayIds.has(terminal.bayId)),
    lineRelations,
    relayIeds,
    protectionFunctions,
    transformers: master.transformers?.filter((transformer) =>
      scopeIds.has(transformer.substationId)
    ),
    remoteBusBranches: master.remoteBusBranches?.filter((branch) =>
      relationIds.has(branch.lineRelationId)
    ),
    relaySettings: master.relaySettings?.filter((setting) =>
      relayIds.has(setting.relayIedId)
    ),
    settingRecords: master.settingRecords?.filter((record) =>
      functionIds.has(record.protectionFunctionId)
    ),
  };

  if (subject.x1Ohm === undefined && subject.lineXOhm === undefined) {
    blockers.push("Impedansi subject line belum tersedia; calculation belum dapat dijalankan.");
  }
  if (!relayIeds.some((ied) => ied.bayId === subject.fromBayId || ied.bayId === subject.toBayId)) {
    warnings.push("RelayIED subject line belum terpetakan; analisis topology tetap tersedia tetapi setting belum lengkap.");
  }

  const fingerprint = [
    study.id,
    `r${study.scopeRevision ?? 1}`,
    study.subjectLineId,
    [...scopeIds].sort().join(","),
    lineRelations.map((relation) => relation.id).sort().join(","),
  ].join("|");
  return { network, ready: blockers.length === 0, blockers, warnings, fingerprint };
}
