import assert from "node:assert/strict";
import { buildRelaySettingsForNetwork } from "../src/domain/relay-setting-builder";
import { buildUnifiedNetwork } from "../src/domain/unified";
import { NETWORK_CASES } from "../src/domain/seed-network-registry";

// NOTE ON FIXTURE CHOICE: this deliberately does NOT use the ULTG Durikosambi
// graph-builder pipeline (NETWORK_GRAPH_DKS_PIK / relayAssetsFromGraph) as a
// "real data" source, even though that would be more representative. As of
// this writing, src/domain/graph-builder.ts always emits `relayIeds: []`
// (line ~652) — the graph builder does not yet populate relay identity from
// any source, so RELAY_ASSETS / NETWORK_GRAPH_RELAY_ASSETS / every
// NetworkCase built from that pipeline currently has zero RelayIEDs. That is
// a separate, pre-existing gap in graph-builder.ts, not something this
// builder can route around — there is nothing to match against yet.
//
// Instead, this test uses NETWORK_CASES[0] (`case_dks_dm_pik_mkb`), whose
// `relays: RELAY_ASSETS` also resolves to that same empty array today — see
// above — so we build the RelayIED side of the fixture by hand (a minimal,
// explicit "this Bay has this relay" wiring) while still running the real
// LCD/DIST registry and matcher through it. That keeps the test honest about
// what's real (the registry + matching + zone data) vs what has to be
// stubbed (relay identity, until graph-builder.ts gains that).

const networkCase = NETWORK_CASES.find((c) => c.id === "case_dks_dm_pik_mkb");
assert.ok(networkCase, "expected the case_dks_dm_pik_mkb demo case to exist");

const network = buildUnifiedNetwork(networkCase!);
assert.equal(
  network.relayIeds.length,
  0,
  "if this ever becomes non-zero, graph-builder.ts started populating relayIeds — " +
    "remove the manual relayIeds stub below and use the real data instead"
);

// Manually attach RelayIEDs at both ends of the first line, mirroring how
// seed-corridor.ts derives forward/reverse relay pairs per LineRelation —
// this is the missing piece graph-builder.ts doesn't produce yet.
const firstLine = network.lineRelations[0];
assert.ok(firstLine, "expected at least one LineRelation in the fixture case");
const stubbedNetwork = {
  ...network,
  relayIeds: [
    {
      id: "relay_stub_from",
      bayId: firstLine.fromBayId,
      make: "Stub",
      model: "Relay",
      functionGroup: "DIST",
      confidence: "high" as const,
    },
    {
      id: "relay_stub_to",
      bayId: firstLine.toBayId,
      make: "Stub",
      model: "Relay",
      functionGroup: "DIST",
      confidence: "high" as const,
    },
  ],
};

const relaySettings = buildRelaySettingsForNetwork(
  stubbedNetwork,
  networkCase!.nodes,
  networkCase!.lines
);

// At least some relays in this well-known demo case should have real LCD/DIST
// distance data — if this is ever 0, either the registry/matching broke or
// the demo case stopped being representative, both worth failing loudly on.
assert.ok(
  relaySettings.length > 0,
  "expected at least one RelaySetting to be built from real LCD/DIST data"
);

// Every RelaySetting must reference a RelayIED that actually exists in this
// network (no dangling relayIedId).
const relayIds = new Set(stubbedNetwork.relayIeds.map((r) => r.id));
for (const setting of relaySettings) {
  assert.ok(
    relayIds.has(setting.relayIedId),
    `RelaySetting ${setting.id} references unknown relayIedId ${setting.relayIedId}`
  );
}

// No fabricated entries: every RelaySetting must trace back to a real
// lcd-dist-import source, and Z1 must be a genuine positive number (not a
// synthetic placeholder like the legacy 10/20/30 ohm defaults).
for (const setting of relaySettings) {
  assert.equal(setting.source, "lcd-dist-import");
  assert.ok(setting.zones[0].xReachOhm > 0, `Z1 reach must be a real positive value for ${setting.id}`);
}

// Relays with no matching LCD/DIST record must be skipped entirely, not
// given a fallback entry — assert the count is strictly less than or equal
// to the number of relays that resolve to a line at all (i.e. we never
// produce more settings than there are candidate relays).
const relaysOnALine = stubbedNetwork.relayIeds.filter((relay) =>
  stubbedNetwork.lineRelations.some(
    (l) => l.fromBayId === relay.bayId || l.toBayId === relay.bayId
  )
).length;
assert.ok(relaySettings.length <= relaysOnALine);

console.log(
  `Relay-setting-builder regression passed: ${relaySettings.length}/${relaysOnALine} relays on a line got real RelaySetting data from lcd-dist-import; no fabricated entries, no dangling relayIedId references.`
);
