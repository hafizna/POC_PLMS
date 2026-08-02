import assert from "node:assert/strict";
import { buildAssetSettingExplorer } from "../src/domain/asset-setting-explorer";
import { createSettingCaseObject } from "../src/domain/setting-case";
import { getConfirmedMasterNetwork } from "../src/domain/study-network";
import type { DistanceZoneSetting, UnifiedNetwork } from "../src/domain/unified";

const now = "2026-08-02T00:00:00.000Z";
const zone = (id: "Z1" | "Z2" | "Z3", reach: number): DistanceZoneSetting => ({
  id,
  xReachOhm: reach,
  rReachOhm: reach,
  rfppOhmPerLoop: reach,
  rfpeOhmPerLoop: reach,
  timeDelayPpS: id === "Z1" ? 0 : id === "Z2" ? 0.4 : 1.2,
  timeDelayPeS: id === "Z1" ? 0 : id === "Z2" ? 0.4 : 1.2,
  operatePp: true,
  operatePe: true,
});

const network: UnifiedNetwork = {
  caseId: "fixture",
  substations: [
    { id: "sub_a", name: "GI ALPHA", shortCode: "ALP", voltageKv: 150, kind: "GI", normalizedName: "alpha" },
    { id: "sub_b", name: "GI BETA", shortCode: "BET", voltageKv: 150, kind: "GI", normalizedName: "beta" },
  ],
  busbars: [],
  bays: [
    { id: "bay_a", substationId: "sub_a", rawName: "BAY BETA 1", normalizedName: "beta", remoteEndpointHint: "beta", circuit: "1", kind: "line" },
    { id: "bay_b", substationId: "sub_b", rawName: "BAY ALPHA 1", normalizedName: "alpha", remoteEndpointHint: "alpha", circuit: "1", kind: "line" },
  ],
  terminals: [],
  lineRelations: [
    {
      id: "line_alpha_beta_1",
      fromBayId: "bay_a",
      toBayId: "bay_b",
      fromSubstationId: "sub_a",
      toSubstationId: "sub_b",
      circuit: "1",
      voltageKv: 150,
      r1Ohm: 0.2,
      x1Ohm: 0.8,
      r0Ohm: 0.6,
      x0Ohm: 2.4,
      physicalLengthKm: 10,
      currentRatingKa: 1.2,
      protectionFunctionIds: ["DIST"],
      sourceIds: ["digsilent-line-db"],
      confidence: "high",
      status: "approved",
    },
  ],
  relayIeds: [
    { id: "ied_alpha", bayId: "bay_a", make: "Schneider", model: "P545", ctRatio: "2000/1", vtRatio: "150kV/100V", functionGroup: "LCD+DIST", confidence: "high" },
  ],
  protectionFunctions: [
    { id: "pf_alpha_dist", relayIedId: "ied_alpha", function: "DIST" },
  ],
  relaySettings: [
    {
      id: "setting_alpha",
      relayIedId: "ied_alpha",
      direction: "forward",
      zones: [zone("Z1", 1), zone("Z2", 2), zone("Z3", 3)],
      loadEncroachment: { enabled: true, rLdFwOhmPerPhase: 10, rLdRvOhmPerPhase: 10, argLdDeg: 30 },
      characteristicAngleDeg: 75,
      source: "tap-pdf",
      sourceRef: "TAP ALPHA-BETA.pdf",
      confidence: "high",
      status: "issued",
    },
  ],
  settingRecords: [
    {
      id: "record_alpha",
      protectionFunctionId: "pf_alpha_dist",
      source: "tap-pdf",
      sourceRef: "TAP ALPHA-BETA.pdf",
      values: { Z1: 1 },
      tapDocument: "TAP-001",
      tapDate: now,
      confidence: "high",
      status: "issued",
    },
  ],
};

const settingCase = {
  ...createSettingCaseObject(
    {
      caseType: "relay_replacement",
      title: "Ganti rele Alpha Beta",
      primaryReason: "relay_replacement",
      changeItems: [{ id: "relay", kind: "relay_replacement" }],
      urgency: "normal",
      owningUnit: "UPT Test",
      protectedScope: {
        networkCaseId: "fixture",
        subjectLineId: "line_alpha_beta_1",
        subjectBayId: "bay_a",
        substationIds: ["sub_a", "sub_b"],
      },
      flowProfileDraft: {
        ownerLevel: "UPT",
        notifiedUnits: ["UIT Test"],
        lifecycleIntent: "permanent",
      },
    },
    "Engineer",
    now,
    "case_alpha_beta"
  ),
  stage: "scoping" as const,
  links: {
    ...createSettingCaseObject(
      {
        caseType: "relay_replacement",
        title: "fixture",
        primaryReason: "relay_replacement",
        changeItems: [],
        urgency: "normal",
        owningUnit: "UPT Test",
        protectedScope: { networkCaseId: "fixture", substationIds: [] },
        flowProfileDraft: { ownerLevel: "UPT", notifiedUnits: [], lifecycleIntent: "permanent" },
      },
      "Engineer",
      now,
      "fixture_links"
    ).links,
    sourceIntakeIds: ["source_change"],
  },
};

const rows = buildAssetSettingExplorer({
  network,
  settingCases: [settingCase],
  sourceRecords: [
    {
      id: "source_change",
      fileName: "datasheet-relay-baru.pdf",
      documentType: "other",
      status: "staged",
      stagedAt: now,
    },
  ],
});

assert.equal(rows.length, 1);
assert.equal(rows[0]?.label, "ALP – BET");
assert.equal(rows[0]?.endpoints[0].relays[0]?.model, "P545");
assert.equal(rows[0]?.settingCount, 1);
assert.equal(rows[0]?.issuedSettingCount, 1);
assert.equal(rows[0]?.openCases[0]?.id, "case_alpha_beta");
assert.ok(rows[0]?.evidence.some((item) => item.label === "datasheet-relay-baru.pdf"));
assert.ok(rows[0]?.qualityIssues.some((item) => item.code === "relay-missing:bay_b"));
assert.ok(rows[0]?.searchText.includes("p545"));

// The first production vertical slice must resolve from the real confirmed
// master projection, not from a hand-built UI demo.
const masterRows = buildAssetSettingExplorer({ network: getConfirmedMasterNetwork() });
const angkeAncol = masterRows.find(
  (row) =>
    row.circuit === "1" &&
    row.searchText.includes("angke") &&
    row.searchText.includes("ancol")
);
assert.ok(angkeAncol, "ANGKE–ANCOL circuit 1 must exist in confirmed master");
assert.ok((angkeAncol?.endpoints.flatMap((item) => item.relays).length ?? 0) > 0);
assert.ok((angkeAncol?.settingCount ?? 0) > 0);

console.log(
  "Asset & Setting Explorer regression passed: canonical identity, endpoints, relay/settings, provenance, quality, case links, and real ANGKE–ANCOL projection."
);
