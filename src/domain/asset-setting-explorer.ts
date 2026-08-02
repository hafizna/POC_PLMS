import type { CtSpec, VtSpec } from "./instrument-transformers";
import type { SettingCase } from "./setting-case";
import type {
  LineRelation,
  RelayIED,
  RelaySetting,
  SettingRecord,
  UnifiedNetwork,
} from "./unified";

export type ExplorerSourceRecord = {
  id: string;
  fileName: string;
  documentType: string;
  status: string;
  stagedAt: string;
};

export type ExplorerCtVtOverride = {
  ct?: CtSpec;
  vt?: VtSpec;
  sourceRef?: string;
  status?: string;
};

export type AssetExplorerQualityIssue = {
  code: string;
  label: string;
  severity: "warning" | "blocker";
};

export type AssetExplorerRelay = {
  id: string;
  bayId: string;
  make: string;
  model: string;
  serial?: string;
  functionGroup: string;
  functions: string[];
  ctRatio?: string;
  vtRatio?: string;
  ct?: CtSpec;
  vt?: VtSpec;
  setting?: RelaySetting;
  settingRecords: SettingRecord[];
  confidence: string;
};

export type AssetExplorerEndpoint = {
  side: "from" | "to";
  substationId: string;
  substationName: string;
  substationCode: string;
  bayId: string;
  bayName: string;
  relays: AssetExplorerRelay[];
};

export type AssetExplorerEvidence = {
  id: string;
  label: string;
  kind: "network" | "setting" | "case-document" | "instrument-transformer";
  status?: string;
  date?: string;
};

export type AssetExplorerCase = Pick<
  SettingCase,
  "id" | "title" | "caseType" | "stage" | "updatedAt" | "primaryReason"
>;

export type AssetExplorerLine = {
  id: string;
  label: string;
  circuit: string;
  voltageKv: number;
  relation: LineRelation;
  endpoints: [AssetExplorerEndpoint, AssetExplorerEndpoint];
  functions: string[];
  evidence: AssetExplorerEvidence[];
  openCases: AssetExplorerCase[];
  qualityIssues: AssetExplorerQualityIssue[];
  completenessPercent: number;
  settingCount: number;
  issuedSettingCount: number;
  actualSettingCount: number;
  searchText: string;
};

export type BuildAssetExplorerInput = {
  network: UnifiedNetwork;
  ctVtOverrides?: Record<string, ExplorerCtVtOverride | undefined>;
  settingCases?: readonly SettingCase[];
  sourceRecords?: readonly ExplorerSourceRecord[];
};

const TERMINAL_CASE_STAGES = new Set(["closed", "cancelled", "rejected"]);

function relayView(
  network: UnifiedNetwork,
  relay: RelayIED,
  ctVtOverrides: BuildAssetExplorerInput["ctVtOverrides"]
): AssetExplorerRelay {
  const override = ctVtOverrides?.[relay.id];
  const functions = network.protectionFunctions
    .filter((item) => item.relayIedId === relay.id)
    .map((item) => item.function);
  const settingRecords = (network.settingRecords ?? []).filter((record) =>
    network.protectionFunctions.some(
      (item) =>
        item.relayIedId === relay.id && item.id === record.protectionFunctionId
    )
  );
  return {
    id: relay.id,
    bayId: relay.bayId,
    make: relay.make,
    model: relay.model,
    serial: relay.serial,
    functionGroup: relay.functionGroup,
    functions,
    ctRatio: relay.ctRatio,
    vtRatio: relay.vtRatio,
    ct: override?.ct ?? relay.ct,
    vt: override?.vt ?? relay.vt,
    setting: (network.relaySettings ?? []).find(
      (setting) => setting.relayIedId === relay.id
    ),
    settingRecords,
    confidence: relay.confidence,
  };
}

function endpointView(
  network: UnifiedNetwork,
  relation: LineRelation,
  side: "from" | "to",
  ctVtOverrides: BuildAssetExplorerInput["ctVtOverrides"]
): AssetExplorerEndpoint {
  const substationId =
    side === "from" ? relation.fromSubstationId : relation.toSubstationId;
  const bayId = side === "from" ? relation.fromBayId : relation.toBayId;
  const substation = network.substations.find((item) => item.id === substationId);
  const bay = network.bays.find((item) => item.id === bayId);
  return {
    side,
    substationId,
    substationName: substation?.name ?? substationId,
    substationCode: substation?.shortCode ?? substationId,
    bayId,
    bayName: bay?.rawName ?? bayId,
    relays: network.relayIeds
      .filter((item) => item.bayId === bayId)
      .map((item) => relayView(network, item, ctVtOverrides)),
  };
}

function relevantCases(
  relation: LineRelation,
  cases: readonly SettingCase[]
): SettingCase[] {
  const bayIds = new Set([relation.fromBayId, relation.toBayId]);
  return cases.filter(
    (settingCase) =>
      !TERMINAL_CASE_STAGES.has(settingCase.stage) &&
      (settingCase.protectedScope.subjectLineId === relation.id ||
        (settingCase.protectedScope.subjectBayId
          ? bayIds.has(settingCase.protectedScope.subjectBayId)
          : false))
  );
}

function uniqueEvidence(items: AssetExplorerEvidence[]): AssetExplorerEvidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function qualityIssues(
  relation: LineRelation,
  endpoints: readonly AssetExplorerEndpoint[],
  settingCount: number,
  evidenceCount: number
): AssetExplorerQualityIssue[] {
  const issues: AssetExplorerQualityIssue[] = [];
  if (relation.status === "imported") {
    issues.push({
      code: "relation-not-reviewed",
      label: "LineRelation masih berstatus imported",
      severity: "warning",
    });
  }
  if (relation.confidence === "low") {
    issues.push({
      code: "relation-low-confidence",
      label: "Confidence relasi masih rendah",
      severity: "warning",
    });
  }
  for (const endpoint of endpoints) {
    if (endpoint.relays.length === 0) {
      issues.push({
        code: `relay-missing:${endpoint.bayId}`,
        label: `Relay belum terpetakan di ${endpoint.substationCode}`,
        severity: "blocker",
      });
      continue;
    }
    if (endpoint.relays.every((relay) => !relay.ct && !relay.ctRatio)) {
      issues.push({
        code: `ct-missing:${endpoint.bayId}`,
        label: `CT belum tersedia di ${endpoint.substationCode}`,
        severity: "warning",
      });
    }
    if (endpoint.relays.every((relay) => !relay.vt && !relay.vtRatio)) {
      issues.push({
        code: `vt-missing:${endpoint.bayId}`,
        label: `VT belum tersedia di ${endpoint.substationCode}`,
        severity: "warning",
      });
    }
  }
  if (relation.r1Ohm === undefined || relation.x1Ohm === undefined) {
    issues.push({
      code: "positive-sequence-missing",
      label: "R1/X1 belum lengkap",
      severity: "blocker",
    });
  }
  if (relation.r0Ohm === undefined || relation.x0Ohm === undefined) {
    issues.push({
      code: "zero-sequence-missing",
      label: "R0/X0 belum lengkap",
      severity: "warning",
    });
  }
  if (settingCount === 0) {
    issues.push({
      code: "setting-missing",
      label: "Setting canonical belum tersedia",
      severity: "warning",
    });
  }
  if (evidenceCount === 0) {
    issues.push({
      code: "evidence-missing",
      label: "Source provenance belum tersedia",
      severity: "warning",
    });
  }
  return issues;
}

export function buildAssetSettingExplorer(
  input: BuildAssetExplorerInput
): AssetExplorerLine[] {
  const cases = input.settingCases ?? [];
  const sourceRecords = input.sourceRecords ?? [];
  return input.network.lineRelations
    .filter((relation) => relation.status !== "rejected")
    .map((relation) => {
      const endpoints: [AssetExplorerEndpoint, AssetExplorerEndpoint] = [
        endpointView(input.network, relation, "from", input.ctVtOverrides),
        endpointView(input.network, relation, "to", input.ctVtOverrides),
      ];
      const allRelays = endpoints.flatMap((endpoint) => endpoint.relays);
      const relaySettings = allRelays
        .map((relay) => relay.setting)
        .filter((setting): setting is RelaySetting => Boolean(setting));
      const settingRecords = allRelays.flatMap((relay) => relay.settingRecords);
      const linkedCases = relevantCases(relation, cases);
      const caseSourceIds = new Set(
        linkedCases.flatMap((settingCase) => settingCase.links.sourceIntakeIds)
      );
      const evidence = uniqueEvidence([
        ...relation.sourceIds.map((sourceId) => ({
          id: sourceId,
          label: sourceId,
          kind: "network" as const,
          status: relation.status,
        })),
        ...relaySettings.map((setting) => ({
          id: setting.sourceRef,
          label: setting.sourceRef,
          kind: "setting" as const,
          status: setting.status,
        })),
        ...settingRecords.map((record) => ({
          id: record.sourceRef,
          label: record.sourceRef,
          kind: "setting" as const,
          status: record.status,
          date: record.tapDate ?? record.actualDate,
        })),
        ...allRelays.flatMap((relay) => {
          const override = input.ctVtOverrides?.[relay.id];
          return override?.sourceRef
            ? [
                {
                  id: override.sourceRef,
                  label: override.sourceRef,
                  kind: "instrument-transformer" as const,
                  status: override.status,
                },
              ]
            : [];
        }),
        ...sourceRecords
          .filter((source) => caseSourceIds.has(source.id))
          .map((source) => ({
            id: source.id,
            label: source.fileName,
            kind: "case-document" as const,
            status: source.status,
            date: source.stagedAt,
          })),
      ]);
      const issues = qualityIssues(
        relation,
        endpoints,
        relaySettings.length + settingRecords.length,
        evidence.length
      );
      const maxPenalty = 100;
      const penalty = issues.reduce(
        (sum, issue) => sum + (issue.severity === "blocker" ? 25 : 10),
        0
      );
      const label = `${endpoints[0].substationCode} – ${endpoints[1].substationCode}`;
      const functions = Array.from(
        new Set([
          ...relation.protectionFunctionIds,
          ...allRelays.flatMap((relay) => relay.functions),
        ])
      ).sort();
      const settingCount = allRelays.filter(
        (relay) => relay.setting || relay.settingRecords.length > 0
      ).length;
      const issuedSettingCount = allRelays.filter(
        (relay) =>
          relay.setting?.status === "issued" ||
          relay.settingRecords.some((record) => record.status === "issued")
      ).length;
      const actualSettingCount = allRelays.filter(
        (relay) =>
          relay.setting?.source === "actual-set" ||
          relay.settingRecords.some((record) => record.source === "actual-set")
      ).length;
      return {
        id: relation.id,
        label,
        circuit: relation.circuit,
        voltageKv: relation.voltageKv,
        relation,
        endpoints,
        functions,
        evidence,
        openCases: linkedCases.map((settingCase) => ({
          id: settingCase.id,
          title: settingCase.title,
          caseType: settingCase.caseType,
          stage: settingCase.stage,
          updatedAt: settingCase.updatedAt,
          primaryReason: settingCase.primaryReason,
        })),
        qualityIssues: issues,
        completenessPercent: Math.max(0, maxPenalty - penalty),
        settingCount,
        issuedSettingCount,
        actualSettingCount,
        searchText: [
          relation.id,
          label,
          relation.circuit,
          ...endpoints.flatMap((endpoint) => [
            endpoint.substationName,
            endpoint.substationCode,
            endpoint.bayName,
            ...endpoint.relays.flatMap((relay) => [
              relay.make,
              relay.model,
              relay.functionGroup,
            ]),
          ]),
          ...functions,
          ...evidence.map((item) => item.label),
        ]
          .join(" ")
          .toLowerCase(),
      } satisfies AssetExplorerLine;
    })
    .sort((a, b) =>
      `${a.label}:${a.circuit}`.localeCompare(`${b.label}:${b.circuit}`)
    );
}
