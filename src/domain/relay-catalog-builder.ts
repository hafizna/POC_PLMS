// Builds RelayIED entries (unified.ts) from the relay catalog
// (src/domain/relay-catalog.ts, 555 assets indexed from
// "Data Setting Penghantar UPT DKSBI (1).xlsx"), so a UnifiedNetwork's
// relayIeds can be populated with real relay identity instead of staying
// empty (graph-builder.ts's buildAnchorTopology/buildCaseFromGraphGroups
// currently always emit relayIeds: []).
//
// Only assets whose `digsilentMatch.status === "matched"` are used — a
// "matched" status means the catalog's own matcher already resolved this
// asset to exactly one digsilentLineDb row with high confidence (see
// relay-catalog.ts's RelayCatalogAsset.digsilentMatch). "candidate" assets
// (210 of 555) are genuinely ambiguous — the catalog itself lists multiple
// plausible rows — and are deliberately skipped here rather than guessed,
// same principle as relay-setting-builder.ts not fabricating zone data for
// unmatched relays.

import type { RelayCatalogAsset } from "./relay-catalog";
import { RELAY_CATALOG } from "./relay-catalog";
import { normalizeStationName } from "./normalization";
import type { LineRelation, RelayIED, UnifiedNetwork } from "./unified";

function lineRelationIdForRow(row: number): string {
  return `anchor_line_${row}`;
}

// Determines which end of the matched LineRelation this asset's own station
// actually is — the catalog's `stationNormalized` should equal one of the
// two substations' normalizedName exactly once digsilentLineDb's own
// site-vs-station naming noise is accounted for. Falls back to comparing
// against the RAW station name's token overlap when neither end matches
// exactly, since catalog stations aren't guaranteed to use the exact same
// wording graph-builder.ts settled on for its scope-derived display name.
function resolveBaySide(
  asset: RelayCatalogAsset,
  line: LineRelation,
  network: UnifiedNetwork
): "from" | "to" | undefined {
  const fromSub = network.substations.find((s) => s.id === line.fromSubstationId);
  const toSub = network.substations.find((s) => s.id === line.toSubstationId);
  const assetKey = normalizeStationName(asset.stationRaw);
  if (fromSub && normalizeStationName(fromSub.name) === assetKey) return "from";
  if (toSub && normalizeStationName(toSub.name) === assetKey) return "to";
  // Fallback: the asset's own normalized field, as pre-computed by the
  // catalog indexer, may already strip tokens differently than
  // normalizeStationName does — compare that too before giving up.
  if (fromSub && fromSub.normalizedName === asset.stationNormalized) return "from";
  if (toSub && toSub.normalizedName === asset.stationNormalized) return "to";
  return undefined;
}

export type RelayIedBuildIssue = {
  assetId: string;
  reason: "no-matching-line-relation" | "ambiguous-bay-side";
};

export type RelayIedBuildResult = {
  relayIeds: RelayIED[];
  issues: RelayIedBuildIssue[];
};

// Resolves each catalog asset with a confirmed digsilentLineDb match to a
// RelayIED bound to the correct bay on that LineRelation, for whichever
// LineRelations exist in `network`. Assets whose matched line isn't part of
// this network (out of scope) or whose station can't be resolved to either
// end are skipped and reported in `issues`, not fabricated.
export function buildRelayIedsFromCatalog(network: UnifiedNetwork): RelayIedBuildResult {
  const relayIeds: RelayIED[] = [];
  const issues: RelayIedBuildIssue[] = [];

  const matchedAssets = RELAY_CATALOG.assets.filter(
    (asset) => asset.digsilentMatch.status === "matched" && asset.digsilentMatch.matchedRow !== undefined
  );

  for (const asset of matchedAssets) {
    const lineId = lineRelationIdForRow(asset.digsilentMatch.matchedRow!);
    const line = network.lineRelations.find((l) => l.id === lineId);
    if (!line) {
      issues.push({ assetId: asset.assetId, reason: "no-matching-line-relation" });
      continue;
    }
    const side = resolveBaySide(asset, line, network);
    if (!side) {
      issues.push({ assetId: asset.assetId, reason: "ambiguous-bay-side" });
      continue;
    }
    const bayId = side === "from" ? line.fromBayId : line.toBayId;
    relayIeds.push({
      id: asset.assetId,
      bayId,
      make: asset.brand,
      model: asset.model,
      serial: asset.serial ?? undefined,
      functionGroup: asset.functions.join("/") || asset.roles.join("/"),
      confidence: "high",
    });
  }

  return { relayIeds, issues };
}
