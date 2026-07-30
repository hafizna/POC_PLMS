import assert from "node:assert/strict";
import {
  RELAY_CATALOG,
  assetsForModel,
  manualForRelayModel,
  parserReadinessForModel,
} from "../src/domain/relay-catalog";

assert.ok(RELAY_CATALOG.summary.assetCount >= 500);
assert.ok(RELAY_CATALOG.summary.modelCount >= 60);
assert.ok(RELAY_CATALOG.summary.ultgCount >= 5);
assert.ok(RELAY_CATALOG.summary.digsilentMatchedCount > 0);
assert.ok(RELAY_CATALOG.summary.digsilentCandidateCount > 0);

const p545 = RELAY_CATALOG.modelCatalog.find(
  (entry) => entry.model === "MiCOM P545"
);
assert.ok(p545);
assert.ok(p545.assetCount >= 40);
assert.ok(p545.functions.includes("line-current-differential"));
assert.ok(p545.functions.includes("distance"));

const p545Assets = assetsForModel(p545.brand, p545.model);
assert.equal(p545Assets.length, p545.assetCount);
assert.ok(p545Assets.some((asset) => asset.serial));

const corridorMatch = RELAY_CATALOG.assets.find(
  (asset) =>
    asset.stationNormalized === "daan mogot" &&
    asset.bayNormalized === "durikosambi 1" &&
    asset.digsilentMatch.status === "matched"
);
assert.equal(
  corridorMatch?.digsilentMatch.matchedName,
  "DAAN MOGOT - DURIKOSAMBI 1"
);

assert.equal(
  manualForRelayModel("MiCOM P545")?.documentReference,
  "P54x1Z-TM-EN-2.3"
);
assert.equal(parserReadinessForModel("MiCOM P545").status, "validated");
assert.equal(parserReadinessForModel("MiCOM P546").status, "candidate");
assert.equal(parserReadinessForModel("7SL87").status, "not-started");

console.log(
  `Relay catalog tests passed (${RELAY_CATALOG.summary.assetCount} assets, ${RELAY_CATALOG.summary.modelCount} models, ${RELAY_CATALOG.summary.digsilentMatchedCount} DIgSILENT matches).`
);
