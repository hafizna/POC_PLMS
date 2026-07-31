import assert from "node:assert/strict";
import {
  computeGraphZoneExtents,
  resolveRelayLineContext,
  runGraphCoordinationChecks,
  selectGoverningBranch,
  walkGraphReach,
} from "../src/lib/graph-coordination";
import type {
  Bay,
  LineRelation,
  RelayIED,
  RelaySetting,
  RemoteBusBranch,
  Transformer,
  UnifiedNetwork,
  UnifiedSubstation,
} from "../src/domain/unified";

// ---------------------------------------------------------------------------
// Fixture: A --(5 ohm)-- B, with B's remote bus (as seen from A) branching
// into a continuing line B--C (3 ohm) and a transformer at B (15 ohm HV-referred).
// Per zone-3 practice, a reach that overreaches past B must be checked
// against whichever branch is bigger — the transformer (15 ohm), not the
// continuing line (3 ohm) — since that is the branch most likely to be
// under-covered.
// ---------------------------------------------------------------------------

function substation(id: string, shortCode: string): UnifiedSubstation {
  return { id, name: shortCode, shortCode, voltageKv: 150, kind: "GI", normalizedName: shortCode.toLowerCase() };
}

function bay(id: string, substationId: string, remoteHint: string): Bay {
  return {
    id,
    substationId,
    rawName: `PHT ${remoteHint}`,
    normalizedName: `pht_${remoteHint.toLowerCase()}`,
    remoteEndpointHint: remoteHint,
    circuit: "1",
    kind: "line",
  };
}

function relation(
  id: string,
  fromBayId: string,
  toBayId: string,
  fromSubstationId: string,
  toSubstationId: string,
  x1Ohm: number
): LineRelation {
  return {
    id,
    fromBayId,
    toBayId,
    fromSubstationId,
    toSubstationId,
    circuit: "1",
    voltageKv: 150,
    x1Ohm,
    lineXOhm: x1Ohm,
    protectionFunctionIds: ["DIST"],
    sourceIds: [],
    confidence: "high",
    status: "reviewed",
  };
}

function relayIed(id: string, bayId: string): RelayIED {
  return {
    id,
    bayId,
    make: "MiCOM",
    model: "P545",
    functionGroup: "DIST",
    confidence: "high",
  };
}

function distanceZone(
  id: "Z1" | "Z2" | "Z3",
  xReachOhm: number,
  timeDelayPpS: number
) {
  return {
    id,
    xReachOhm,
    rReachOhm: xReachOhm * 0.3,
    rfppOhmPerLoop: xReachOhm * 2,
    rfpeOhmPerLoop: xReachOhm * 2.5,
    timeDelayPpS,
    timeDelayPeS: timeDelayPpS,
    operatePp: true,
    operatePe: true,
  };
}

function relaySetting(
  id: string,
  relayIedId: string,
  direction: "forward" | "reverse",
  zones: [number, number, number],
  timers: [number, number, number] = [0, 0.4, 1.0]
): RelaySetting {
  return {
    id,
    relayIedId,
    direction,
    zones: [
      distanceZone("Z1", zones[0], timers[0]),
      distanceZone("Z2", zones[1], timers[1]),
      distanceZone("Z3", zones[2], timers[2]),
    ],
    loadEncroachment: {
      enabled: true,
      rLdFwOhmPerPhase: 40,
      rLdRvOhmPerPhase: 40,
      argLdDeg: 30,
    },
    characteristicAngleDeg: 75,
    source: "manual",
    sourceRef: "test fixture",
    confidence: "high",
    status: "approved",
  };
}

const subA = substation("sub_a", "A");
const subB = substation("sub_b", "B");
const subC = substation("sub_c", "C");

const bayAtoB = bay("bay_a_b", subA.id, "B");
const bayBtoA = bay("bay_b_a", subB.id, "A");
const bayBtoC = bay("bay_b_c", subB.id, "C");
const bayCtoB = bay("bay_c_b", subC.id, "B");
const bayTrafoB = bay("bay_trafo_b", subB.id, "TRAFO");

const lineAB: LineRelation = relation("line_ab", bayAtoB.id, bayBtoA.id, subA.id, subB.id, 5);
const lineBC: LineRelation = relation("line_bc", bayBtoC.id, bayCtoB.id, subB.id, subC.id, 3);

const trafoB: Transformer = {
  id: "trafo_b",
  substationId: subB.id,
  bayId: bayTrafoB.id,
  label: "IBT B",
  hvVoltageKv: 150,
  lvVoltageKv: 70,
  xOhm: 15,
};

// Two candidates at line_ab's remote bus (B): continuing line (3 ohm) and
// the transformer (15 ohm). Governing branch must be the transformer.
const branchesAtB: RemoteBusBranch[] = [
  {
    id: "branch_ab_to_bc",
    lineRelationId: lineAB.id,
    targetKind: "line",
    targetLineRelationId: lineBC.id,
    xOhm: 3,
  },
  {
    id: "branch_ab_to_trafo",
    lineRelationId: lineAB.id,
    targetKind: "transformer",
    targetTransformerId: trafoB.id,
    xOhm: 15,
  },
];

const relayA = relayIed("relay_a", bayAtoB.id);
const relayBforC = relayIed("relay_b_c", bayBtoC.id);

const network: UnifiedNetwork = {
  caseId: "case_test",
  substations: [subA, subB, subC],
  busbars: [],
  bays: [bayAtoB, bayBtoA, bayBtoC, bayCtoB, bayTrafoB],
  terminals: [],
  lineRelations: [lineAB, lineBC],
  relayIeds: [relayA, relayBforC],
  protectionFunctions: [],
  transformers: [trafoB],
  remoteBusBranches: branchesAtB,
  relaySettings: [],
};

// ---------------------------------------------------------------------------
// Test 1: selectGoverningBranch picks the larger-impedance candidate, not
// the first one in array order.
// ---------------------------------------------------------------------------
{
  const governing = selectGoverningBranch(branchesAtB, network);
  assert.ok(governing, "expected a governing branch to be found");
  assert.equal(governing.hop.kind, "transformer");
  assert.equal(governing.hop.xOhm, 15);
}

// Order independence: reversing the array must not change the outcome.
{
  const governing = selectGoverningBranch([...branchesAtB].reverse(), network);
  assert.equal(governing?.hop.kind, "transformer");
}

// ---------------------------------------------------------------------------
// Test 2: walkGraphReach — Z1 (4 ohm) stays inside line_ab, exhausted.
// ---------------------------------------------------------------------------
{
  const z1 = walkGraphReach(network, lineAB.id, 4);
  assert.equal(z1.exhausted, true);
  assert.equal(z1.ranOutOfData, false);
  assert.equal(z1.consumedOhm, 4);
  assert.equal(z1.path.length, 1);
  assert.equal(z1.path[0].id, lineAB.id);
}

// ---------------------------------------------------------------------------
// Test 3: walkGraphReach — Z2 (6 ohm) exhausts line_ab (5 ohm) then must
// choose the governing branch at B. Remaining 1 ohm is well inside the
// transformer's 15 ohm, so it must resolve into the transformer hop, NOT
// the continuing line (which is the smaller candidate).
// ---------------------------------------------------------------------------
{
  const z2 = walkGraphReach(network, lineAB.id, 6);
  assert.equal(z2.exhausted, true);
  assert.equal(z2.ranOutOfData, false);
  assert.equal(z2.choseBetweenBranches, true);
  assert.equal(z2.consumedOhm, 6);
  assert.equal(z2.path.length, 2);
  assert.equal(z2.path[0].id, lineAB.id);
  assert.equal(z2.path[1].kind, "transformer");
  assert.equal(z2.path[1].id, trafoB.id);
}

// ---------------------------------------------------------------------------
// Test 4: walkGraphReach — a reach so large it exceeds even the governing
// branch's own impedance (5 + 15 = 20 ohm total known) must report
// ranOutOfData, not silently clamp to a wrong endpoint.
// ---------------------------------------------------------------------------
{
  const z3 = walkGraphReach(network, lineAB.id, 25);
  assert.equal(z3.exhausted, false);
  assert.equal(z3.ranOutOfData, true);
  assert.equal(z3.consumedOhm, 20);
}

// ---------------------------------------------------------------------------
// Test 5: a line with no RemoteBusBranch data at all must report
// ranOutOfData for any reach past its own length, not assume a dead end.
// ---------------------------------------------------------------------------
{
  const noBranchNetwork: UnifiedNetwork = { ...network, remoteBusBranches: [] };
  const reach = walkGraphReach(noBranchNetwork, lineBC.id, 10);
  assert.equal(reach.exhausted, false);
  assert.equal(reach.ranOutOfData, true);
  assert.equal(reach.consumedOhm, 3);
}

// ---------------------------------------------------------------------------
// Test 6: resolveRelayLineContext / computeGraphZoneExtents end-to-end via a
// RelaySetting, mirroring the legacy relayKmOnCorridor/directionAlongCorridor
// from<->to resolution.
// ---------------------------------------------------------------------------
{
  const settingA = relaySetting("setting_a", relayA.id, "forward", [4, 6, 25]);
  const ctx = resolveRelayLineContext(network, settingA);
  assert.ok(ctx);
  assert.equal(ctx?.line.id, lineAB.id);
  assert.equal(ctx?.looksTowardToEnd, true);

  const result = computeGraphZoneExtents(network, settingA);
  assert.ok(result);
  assert.equal(result?.extents[0].endpoint.consumedOhm, 4);
  assert.equal(result?.extents[1].endpoint.path[1]?.kind, "transformer");
  assert.equal(result?.extents[2].endpoint.ranOutOfData, true);
}

// ---------------------------------------------------------------------------
// Test 7: runGraphCoordinationChecks — own-line checks (Z1/Z2 percent,
// timer sanity) fire correctly, and cross-relay backup-gap/time-race checks
// resolve through the governing branch (the continuing line to C, since the
// downstream relay of interest sits on line_bc, not the transformer).
// ---------------------------------------------------------------------------
{
  // Z1 at 90% of line X (4.5/5) should trip Z1_OVERREACH.
  const settingAOverreach = relaySetting("setting_a_over", relayA.id, "forward", [4.5, 6, 25]);
  const networkOverreach: UnifiedNetwork = {
    ...network,
    relaySettings: [settingAOverreach],
  };
  const diags = runGraphCoordinationChecks(networkOverreach);
  assert.ok(diags.some((d) => d.code === "Z1_OVERREACH"));
}

{
  // Force the governing branch to the continuing line (make it bigger than
  // the transformer) so a downstream relay on line_bc participates in the
  // backup-gap check.
  const branchesFavoringLine: RemoteBusBranch[] = [
    { id: "b1", lineRelationId: lineAB.id, targetKind: "line", targetLineRelationId: lineBC.id, xOhm: 20 },
    { id: "b2", lineRelationId: lineAB.id, targetKind: "transformer", targetTransformerId: trafoB.id, xOhm: 15 },
  ];
  const upstreamSetting = relaySetting("setting_a_backup", relayA.id, "forward", [4, 5.5, 25]);
  // Downstream Z1 reaches 3.5 ohm on line_bc; upstream Z2 only reaches
  // 0.5 ohm past the remote bus (5.5 - 5) -> gap.
  const downstreamSetting = relaySetting("setting_b_c", relayBforC.id, "forward", [3.5, 6, 10]);
  const gapNetwork: UnifiedNetwork = {
    ...network,
    remoteBusBranches: branchesFavoringLine,
    relaySettings: [upstreamSetting, downstreamSetting],
  };
  const diags = runGraphCoordinationChecks(gapNetwork);
  const gap = diags.find((d) => d.code === "BACKUP_GAP");
  assert.ok(gap, "expected a BACKUP_GAP diagnostic");
  assert.deepEqual(gap?.affectedRelayIedIds, [relayA.id, relayBforC.id]);
}

console.log(
  "Graph-coordination regression passed: governing-branch selection, multi-hop reach walking, ran-out-of-data reporting, and own-line/backup-gap diagnostics all match expected zone-3 behavior."
);
