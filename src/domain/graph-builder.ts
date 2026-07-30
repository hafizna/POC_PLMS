// Generic per-GI network graph builder.
//
// Replaces the hardcoded 6-substation corridor in nmm-generator.ts with a
// pipeline that scopes any ULTG from its SLD folder index, anchors topology
// on the explicit fromSubstation/toSubstation records in the legacy
// DIgSILENT line database (crosscheck-workbook-registry.json), then overlays
// setting-document records (LCD+DIST, OCR) on top of the anchored bays.
//
// Confirmation unit is the GI, not the individual record: every substation
// discovered from the SLD scope becomes exactly one GraphBuildGroup that
// bundles its resolved bays/relations/overlays/issues for a single review
// decision, instead of surfacing one Inbox item per bay/row like the
// existing per-record matcher does.
import type { Bay, LineRelation, ProtectionFunctionId, UnifiedNetwork, UnifiedSubstation } from "./unified";
import { classifyProtectionFunction } from "./unified";
import type { RegistryConfidence } from "./seed-network-registry";
import { normalizeStationName, normalizeSubstationIdentity, tokensSubsetOf } from "./normalization";
import sldSourceIndex from "./generated/sld-source-index.json";
import crosscheckRegistry from "./generated/crosscheck-workbook-registry.json";
import lcdDistRegistry from "./generated/lcd-dist-registry.json";
import ocrRegistry from "./generated/ocr-registry.json";

// ---------------------------------------------------------------------------
// Step 1: scope resolution from SLD folder index
// ---------------------------------------------------------------------------

export type ScopedStation = {
  /** Raw folder name, e.g. "GIS MUARAKARANG BARU". */
  rawName: string;
  /** Identity-preserving key (keeps GI/GIS token) — see normalizeSubstationIdentity. */
  identityKey: string;
  /** Fuzzy key for matching against free-text sources (drops GI/GIS token). */
  fuzzyKey: string;
  kind: "GI" | "GIS" | "GISTET";
};

function classifyStationKind(rawName: string): ScopedStation["kind"] {
  const upper = rawName.toUpperCase();
  if (upper.includes("GISTET")) return "GISTET";
  if (upper.includes("GIS")) return "GIS";
  return "GI";
}

/**
 * Resolves the working scope for a graph build from an SLD source folder
 * index. This is deliberately the FIRST anchor in the pipeline: it narrows
 * "which substations are we even talking about" down from digsilentLineDb's
 * full Java-Bali extent (610 substations) to the ULTG actually being worked,
 * before any topology detail is pulled in.
 */
export function resolveUltgScope(
  index: { stationFolders: string[] } = sldSourceIndex
): ScopedStation[] {
  return index.stationFolders.map((rawName) => ({
    rawName,
    identityKey: normalizeSubstationIdentity(rawName),
    fuzzyKey: normalizeStationName(rawName),
    kind: classifyStationKind(rawName),
  }));
}

// ---------------------------------------------------------------------------
// Step 2: anchor topology from the explicit DIgSILENT line database
// ---------------------------------------------------------------------------

type DigsilentLineRecord = {
  row: number;
  name: string;
  type: string;
  fromSubstation: string;
  fromTerminal: string;
  toSubstation: string;
  toTerminal: string;
  outOfService: boolean;
  lengthKm: number;
  currentRatingKa: number;
  z1Ohm: number;
  angleDeg: number;
  r1Ohm: number;
  x1Ohm: number;
  r0Ohm: number;
  x0Ohm: number;
  k0: number | null;
  phiK0Deg: number | null;
};

export type AnchorLineRelation = LineRelation & {
  digsilentName: string;
  outOfService: boolean;
};

export type AnchorResult = {
  substations: UnifiedSubstation[];
  bays: Bay[];
  lineRelations: AnchorLineRelation[];
  /**
   * Scoped stations that had NO match in digsilentLineDb at all — e.g. a GI
   * energized after the workbook's March 2021 snapshot (observed for Dadap,
   * Ulujami in ULTG Durikosambi). These need manual topology input; the
   * builder does not attempt to invent a match for them.
   */
  unresolvedStations: ScopedStation[];
};

/**
 * Explicit, engineer-confirmed aliases from digsilentLineDb's 2021 naming to
 * the current SLD site name. These exist because the 2021 workbook's naming
 * doesn't line up with current SLD folders in ways no string heuristic could
 * safely guess:
 *  - "M. KARANG LAMA" / "M. KARANG BARU" are abbreviations (MKLMA/MKBRU seen
 *    in the line-name codes) for Muarakarang Lama/Baru, but the 2021 site
 *    split doesn't match today's 3-way SLD split (GI Muarakarang, GI
 *    Muarakarang Baru, GIS Muarakarang Baru) 1:1 — confirmed against the SLD
 *    that "M. KARANG LAMA" is today's "GI MUARAKARANG", and "M. KARANG BARU"
 *    (which carries the line toward PIK) is today's "GIS MUARAKARANG BARU"
 *    now that the outgoing PIK line has migrated there. "GI Muarakarang
 *    Baru" (the third, newer site) has no 2021 anchor of its own.
 *  - "GROGOL II" (2021) = "GIS GROGOL BARU" (current SLD naming) — confirmed
 *    as the same physical site, just a naming-convention change (II -> Baru).
 * Keep this list append-only and sourced from explicit engineer
 * confirmation, not inference — silently guessing an alias here risks
 * merging two distinct physical GIs (exactly the failure mode this graph
 * builder exists to avoid).
 */
// Alias targets are identityKey form (normalizeSubstationIdentity output —
// GI/GIS token PRESERVED), compared against ScopedStation.identityKey. This
// must NOT use fuzzyKey: "GI Muarakarang Baru" and "GIS Muarakarang Baru"
// are two distinct physical sites (the migration case) that collapse to the
// identical fuzzyKey "muarakarang baru" once the GI/GIS token is dropped —
// an alias keyed on fuzzyKey would match whichever of the two scope entries
// happens to be found first, not necessarily the right one.
const DIGSILENT_TO_SLD_ALIAS: Record<string, string> = {
  "m karang lama": "gi muarakarang",
  "m karang baru": "gis muarakarang baru",
  "grogol ii": "gis grogol baru",
};

// Display-name overrides, keyed by identityKey. Separate from the alias
// table above: the alias table decides which SCOPE a digsilentLineDb name
// resolves to (a matching concern), this decides what LABEL that scope
// shows as (a clarity concern). "GI MUARAKARANG" is the literal SLD folder
// name, but showing it unqualified reads as if it's the only Muarakarang
// site — confirmed by engineer that it should read "GI Muarakarang Lama" to
// stay unambiguous alongside "GIS Muarakarang Baru" / "GI Muarakarang Baru".
const DISPLAY_NAME_OVERRIDE: Record<string, string> = {
  "gi muarakarang": "GI Muarakarang Lama",
};

// Explicit engineer-confirmed shortCode overrides, keyed by normalizeStationName
// (fuzzy key — matches the key used for substation dedup). These take
// priority over extractDigsilentShortCodes' frequency heuristic, for two
// distinct reasons:
//  - "karet" -> "KARET": the heuristic picks a token belonging to a
//    neighboring bay's code by frequency, but the actual convention reserves
//    a distinct code ("KRBRU") for the neighboring site "Karet Baru" and
//    keeps the plain name for "Karet" itself.
//  - "grogol" -> "GROGOL": ambiguous against "GROGOL II"'s code (GGLII)
//    under the heuristic; confirmed as just "GROGOL".
//  - "pantai indah kapuk" -> "PINKA", "daan mogot" -> "DNMGT": these
//    substations' own bay/setting data already exists in digsilentLineDb,
//    but the workbook never assigned them a short code at all (both are
//    newer sites — Daan Mogot cuts into the pre-existing PIK-Durikosambi
//    line) — extractDigsilentShortCodes finds no code candidate for the
//    substation, not an ambiguous one, so there's nothing to override
//    without engineer confirmation.
const SHORTCODE_OVERRIDE: Record<string, string> = {
  "karet": "KARET",
  "grogol": "GROGOL",
  "pantai indah kapuk": "PINKA",
  "daan mogot": "DNMGT",
};

/**
 * A DIgSILENT substation name matches a scoped station name if:
 *  1. an explicit alias says so (DIGSILENT_TO_SLD_ALIAS), or
 *  2. the scoped name's tokens are a subset of the DIgSILENT name's tokens
 *     (after dropping the GI/GIS/GITET token from both sides) — i.e. the
 *     DIgSILENT name is allowed to be a qualified/longer form of the scope
 *     name ("DAAN MOGOT GIS" matching scope "GIS DAAN MOGOT"), but not the
 *     other way around.
 * The reverse direction (scope-is-subset-of-digsilent in both directions)
 * is deliberately NOT accepted as a fallback: "GROGOL" and "GROGOL II" are
 * two distinct physical sites in digsilentLineDb, and accepting both
 * directions would make scope "GIS GROGOL" swallow BOTH of them (since
 * "grogol" is a token subset of "grogol ii" too), silently merging two
 * sites into one anchor group. A DIgSILENT name carrying an extra
 * disambiguating token ("II", "BARU") that the scope name lacks, and that
 * isn't covered by an explicit alias, is treated as a non-match instead —
 * it surfaces as its own unscoped substation rather than being absorbed
 * into the wrong group. See buildAnchorTopology's caller notes.
 */
function stationNameMatches(scoped: ScopedStation, digsilentName: string): boolean {
  const digsilentKey = normalizeStationName(digsilentName);
  if (!digsilentKey) return false;
  const aliasTarget = DIGSILENT_TO_SLD_ALIAS[digsilentKey];
  if (aliasTarget) return aliasTarget === scoped.identityKey;
  return tokensSubsetOf(scoped.fuzzyKey, digsilentKey);
}

function buildShortCode(rawName: string): string {
  const words = rawName
    .replace(/\b(GI|GIS|GISTET|GITET)\b/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "UNK";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").toUpperCase().slice(0, 4);
}

// Tokens that separate a digsilentLineDb line-name field into its
// substation-code parts, e.g. "DKSBI-GGLII I" -> ["DKSBI", "GGLII"],
// "MKLMA-ANGKE UGC 1" -> ["MKLMA", "ANGKE"]. Circuit markers (trailing
// arabic digit, roman numeral, "UGC", "(TEMP)") are stripped because they
// aren't part of either substation's code.
function tokenizeDigsilentLineName(name: string): string[] {
  return name
    .replace(/\(TEMP\)/gi, "")
    .split(/[\s-]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !/^\d+$/.test(t))
    .filter((t) => !/^(I|II|III|IV)$/i.test(t))
    .filter((t) => t.toUpperCase() !== "UGC");
}

function significantWords(subName: string): string[] {
  return subName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !["GIS", "GITET", "GISTET"].includes(w));
}

/**
 * Extracts each substation's own abbreviation code as actually used in
 * digsilentLineDb's `name` field (e.g. "DURIKOSAMBI" -> "DKSBI", "KEBON
 * JERUK" -> "KBJRK"), instead of guessing one from the SLD/display name
 * (buildShortCode, which has no way to know "DURIKOSAMBI" abbreviates to
 * "DKSBI" rather than "DUR"). This matters because engineers cross-
 * reference PLMS against the DIgSILENT workbook directly — a shortCode that
 * doesn't match the source's own convention makes that lookup harder for no
 * reason.
 *
 * Method: for every line record touching a substation, tokenize
 * `record.name` and keep tokens that do NOT look like they belong to the
 * OTHER side of that line (checked by comparing each token's first 3 chars
 * against the other substation's own name words) — the surviving token is
 * a candidate code for THIS substation. The most frequent candidate across
 * all touching records wins. This is a frequency heuristic, not a lookup
 * table: it gets the unambiguous majority of cases right (confirmed against
 * ULTG Durikosambi scope — DKSBI, CNKRG, KBJRK, KRBRU, BDKMY, KTPNG, MKLMA,
 * MKBRU, GGLII, PIK, SNYAN, DNYSA, PTKGN all extracted correctly), but a few
 * substations never appear abbreviated in the source at all (e.g. "DAAN
 * MOGOT" is always spelled out) or have a genuinely ambiguous top candidate
 * (e.g. "KARET" clashes with the codes for its own neighboring bays "KRLMA"/
 * "KRBRU"). Those fall back to buildShortCode's generic initials — treat
 * the fallback cases as needing an explicit correction from someone who
 * knows the DIgSILENT convention, not as this heuristic being "done".
 */
function extractDigsilentShortCodes(records: DigsilentLineRecord[]): Map<string, string> {
  const bySubstation = new Map<string, Map<string, number>>();

  function touch(subName: string, otherName: string, lineName: string) {
    const subNorm = normalizeStationName(subName);
    if (!subNorm) return;
    const otherWords = significantWords(otherName);
    let counts = bySubstation.get(subNorm);
    if (!counts) {
      counts = new Map();
      bySubstation.set(subNorm, counts);
    }
    for (const tok of tokenizeDigsilentLineName(lineName)) {
      const tokNorm = tok.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (tokNorm.length < 3) continue;
      const looksLikeOther = otherWords.some((w) => w.slice(0, 3) === tokNorm.slice(0, 3));
      if (looksLikeOther) continue;
      counts.set(tokNorm, (counts.get(tokNorm) ?? 0) + 1);
    }
  }

  for (const record of records) {
    touch(record.fromSubstation, record.toSubstation, record.name);
    touch(record.toSubstation, record.fromSubstation, record.name);
  }

  const result = new Map<string, string>();
  for (const [subNorm, counts] of bySubstation) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [topCode, topCount] = ranked[0] ?? [];
    if (!topCode) continue;
    const [, secondCount] = ranked[1] ?? [undefined, 0];
    // Skip ambiguous top candidates (runner-up within 60% of the leader) —
    // fall back to buildShortCode rather than guess wrong.
    if (secondCount >= topCount * 0.6) continue;
    result.set(subNorm, topCode);
  }
  return result;
}

/**
 * Builds anchor topology for a scoped ULTG: for every scoped station that
 * matches a digsilentLineDb substation, pulls in its line records as
 * LineRelations with explicit impedance (no bay-name string inference
 * needed — fromSubstation/toSubstation/fromTerminal/toTerminal are already
 * structured fields in the source). Lines whose far end is NOT in scope are
 * still included (they matter for Z2/Z3 forward-chain reach), with the far
 * substation added too so the relation has both endpoints.
 */
export function buildAnchorTopology(
  scope: ScopedStation[],
  lineDb: { records: DigsilentLineRecord[] } = crosscheckRegistry.digsilentLineDb
): AnchorResult {
  const substations = new Map<string, UnifiedSubstation>();
  const bays: Bay[] = [];
  const lineRelations: AnchorLineRelation[] = [];
  const matchedScoped = new Set<string>();
  const digsilentShortCodes = extractDigsilentShortCodes(lineDb.records);

  function ensureSubstation(digsilentName: string, scoped?: ScopedStation): UnifiedSubstation {
    const key = normalizeStationName(digsilentName);
    const existing = substations.get(key);
    if (existing) return existing;
    // An explicit alias (DIGSILENT_TO_SLD_ALIAS) always wins for the display
    // name — e.g. "M. KARANG LAMA" should show as "GI Muarakarang", not the
    // 2021 workbook's abbreviation. Otherwise: a scope name's tokens can be a
    // subset of more than one digsilentLineDb name (e.g. scope "GIS GROGOL"
    // is a token-subset of both "GROGOL" and "GROGOL II" — two distinct
    // physical GIs). Using the scope's raw name verbatim for both would give
    // two different substation IDs the same display name. Prefer the
    // DIgSILENT name when it carries qualifying tokens the scope name
    // doesn't have (the II/BARU that disambiguates the site); otherwise fall
    // back to the scope's own casing.
    const isAliased = Boolean(DIGSILENT_TO_SLD_ALIAS[key]);
    const digsilentTokens = digsilentName.toLowerCase().split(/\s+/).filter(Boolean);
    const scopeTokens = new Set((scoped?.fuzzyKey ?? "").split(/\s+/).filter(Boolean));
    const hasExtraQualifier = digsilentTokens.some((t) => !scopeTokens.has(t));
    const baseRawName = isAliased || !hasExtraQualifier ? (scoped?.rawName ?? digsilentName) : digsilentName;
    const rawName = DISPLAY_NAME_OVERRIDE[normalizeSubstationIdentity(baseRawName)] ?? baseRawName;
    const id = `sub_${key.replace(/\s+/g, "_")}`;
    const sub: UnifiedSubstation = {
      id,
      name: rawName,
      shortCode: SHORTCODE_OVERRIDE[key] ?? digsilentShortCodes.get(key) ?? buildShortCode(rawName),
      voltageKv: 150,
      kind: scoped?.kind ?? "GI",
      normalizedName: normalizeStationName(rawName),
    };
    substations.set(key, sub);
    return sub;
  }

  function ensureBay(sub: UnifiedSubstation, remoteSub: UnifiedSubstation, terminal: string, circuit: string): Bay {
    const bayId = `bay_${sub.id}_${remoteSub.id}_${circuit}`;
    const existing = bays.find((b) => b.id === bayId);
    if (existing) return existing;
    const bay: Bay = {
      id: bayId,
      substationId: sub.id,
      rawName: `PHT 150kV ${remoteSub.name.toUpperCase()}#${circuit} (terminal ${terminal})`,
      normalizedName: normalizeStationName(remoteSub.name),
      remoteEndpointHint: normalizeStationName(remoteSub.name),
      circuit,
      kind: "line",
    };
    bays.push(bay);
    return bay;
  }

  // Circuit numbers can't be reliably parsed from record.name: the trailing
  // token is sometimes an arabic numeral ("ANGKE-ANCOL -1"), sometimes a
  // roman numeral that is itself part of the remote site's abbreviated name
  // ("DKSBI-GGLII I" / "DKSBI-GGLII II" — "GGLII" = Grogol II), so a suffix
  // regex would misparse the site name as a circuit digit. Instead, circuit
  // is assigned by order of appearance per unordered substation pair: the
  // first line record seen between two substations is circuit 1, the next
  // is circuit 2, etc. This matches how parallel circuits are actually laid
  // out in the source (consecutive rows for the same physical pair).
  const pairCircuitCounters = new Map<string, number>();
  function nextCircuitForPair(a: string, b: string): string {
    const key = [a, b].sort().join("__");
    const next = (pairCircuitCounters.get(key) ?? 0) + 1;
    pairCircuitCounters.set(key, next);
    return String(next);
  }

  for (const record of lineDb.records) {
    const fromScoped = scope.find((s) => stationNameMatches(s, record.fromSubstation));
    const toScoped = scope.find((s) => stationNameMatches(s, record.toSubstation));
    if (!fromScoped && !toScoped) continue; // neither end in scope — skip entirely

    if (fromScoped) matchedScoped.add(fromScoped.rawName);
    if (toScoped) matchedScoped.add(toScoped.rawName);

    const fromSub = ensureSubstation(record.fromSubstation, fromScoped);
    const toSub = ensureSubstation(record.toSubstation, toScoped);

    const circuit = nextCircuitForPair(fromSub.id, toSub.id);

    const fromBay = ensureBay(fromSub, toSub, record.fromTerminal, circuit);
    const toBay = ensureBay(toSub, fromSub, record.toTerminal, circuit);

    lineRelations.push({
      id: `anchor_line_${record.row}`,
      fromBayId: fromBay.id,
      toBayId: toBay.id,
      fromSubstationId: fromSub.id,
      toSubstationId: toSub.id,
      circuit,
      voltageKv: fromSub.voltageKv,
      r1Ohm: record.r1Ohm,
      x1Ohm: record.x1Ohm,
      r0Ohm: record.r0Ohm,
      x0Ohm: record.x0Ohm,
      currentRatingKa: record.currentRatingKa,
      lineXOhm: record.x1Ohm,
      physicalLengthKm: record.lengthKm,
      protectionFunctionIds: [],
      sourceIds: ["digsilent-line-db"],
      confidence: "high",
      status: "imported",
      digsilentName: record.name,
      outOfService: record.outOfService,
    });
  }

  const unresolvedStations = scope.filter((s) => !matchedScoped.has(s.rawName));

  return {
    substations: [...substations.values()],
    bays,
    lineRelations,
    unresolvedStations,
  };
}

// ---------------------------------------------------------------------------
// Step 3: overlay setting-document records (LCD+DIST, OCR) onto anchor bays
// ---------------------------------------------------------------------------

export type OverlayRecord = {
  sourceKind: "lcd-dist-import" | "ocr-import";
  sourceId: string;
  substationRaw: string;
  bayRaw: string;
  circuit: string;
  matchedBayId?: string;
  matchStatus: "matched" | "unmatched";
  relayMake?: string;
  relayModel?: string;
  ctRatio?: string;
  vtRatio?: string;
  protectionFunctionHint?: ProtectionFunctionId | null;
};

function overlayCircuit(raw: string): string {
  const m = raw.match(/(\d+)/);
  return m ? m[1] : "1";
}

/**
 * Overlays free-text setting-document rows (LCD+DIST / OCR registries) onto
 * bays that already exist in the anchor topology. This is deliberately an
 * OVERLAY step, not a topology-inference step: it never creates a new
 * LineRelation or invents a remote endpoint from the bay string — it only
 * attaches relay/CT/VT detail to a bay the anchor has already established.
 * Rows whose (substation, remote-bay, circuit) don't match any anchor bay
 * are kept with matchStatus "unmatched" so they surface in the per-GI review
 * instead of being silently dropped.
 */
export function overlaySettingDocs(anchor: AnchorResult): OverlayRecord[] {
  const results: OverlayRecord[] = [];

  function attemptMatch(
    substationRaw: string,
    bayRaw: string,
    circuitRaw: string
  ): Bay | undefined {
    const subKey = normalizeStationName(substationRaw);
    const circuit = overlayCircuit(circuitRaw);
    const sub = anchor.substations.find((s) => tokensSubsetOf(s.normalizedName, subKey) || tokensSubsetOf(subKey, s.normalizedName));
    if (!sub) return undefined;
    const bayRemoteKey = normalizeStationName(bayRaw);
    return anchor.bays.find(
      (b) =>
        b.substationId === sub.id &&
        b.circuit === circuit &&
        (tokensSubsetOf(b.remoteEndpointHint, bayRemoteKey) || tokensSubsetOf(bayRemoteKey, b.remoteEndpointHint))
    );
  }

  for (const record of lcdDistRegistry.records) {
    const bay = attemptMatch(record.substation, record.bay, record.circuit);
    results.push({
      sourceKind: "lcd-dist-import",
      sourceId: record.id,
      substationRaw: record.substation,
      bayRaw: record.bay,
      circuit: overlayCircuit(record.circuit),
      matchedBayId: bay?.id,
      matchStatus: bay ? "matched" : "unmatched",
      relayMake: record.relay?.make,
      relayModel: record.relay?.model,
      ctRatio: record.ctRatio,
      vtRatio: record.vtRatio,
      protectionFunctionHint: classifyProtectionFunction(record.relay?.functionGroup),
    });
  }

  for (const record of ocrRegistry.records as Array<{
    id: string;
    substation: string;
    bay: string;
    circuit: string;
    relay?: { make?: string; model?: string };
    ctRatio?: string;
    vtRatio?: string;
  }>) {
    const bay = attemptMatch(record.substation, record.bay, record.circuit);
    results.push({
      sourceKind: "ocr-import",
      sourceId: record.id,
      substationRaw: record.substation,
      bayRaw: record.bay,
      circuit: overlayCircuit(record.circuit),
      matchedBayId: bay?.id,
      matchStatus: bay ? "matched" : "unmatched",
      relayMake: record.relay?.make,
      relayModel: record.relay?.model,
      ctRatio: record.ctRatio,
      vtRatio: record.vtRatio,
      protectionFunctionHint: classifyProtectionFunction("OCR"),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Step 4: group everything into one confirmation unit per GI
// ---------------------------------------------------------------------------

export type GraphBuildGroup = {
  station: UnifiedSubstation;
  bays: Bay[];
  lineRelations: AnchorLineRelation[];
  overlays: OverlayRecord[];
  /** True when this station had no digsilentLineDb match at all. */
  needsManualTopology: boolean;
  confidence: RegistryConfidence;
};

export type GraphBuildResult = {
  groups: GraphBuildGroup[];
  unresolvedStations: ScopedStation[];
};

/**
 * Runs the full pipeline (scope -> anchor -> overlay) and groups the result
 * per substation, so a reviewer confirms one GI — all its bays, relations,
 * and overlay matches at once — instead of approving each bay/relay row
 * individually like the existing per-record Inbox flow.
 */
export function buildGraphForUltg(
  index?: { stationFolders: string[] },
  lineDb?: { records: DigsilentLineRecord[] }
): GraphBuildResult {
  const scope = resolveUltgScope(index);
  const anchor = buildAnchorTopology(scope, lineDb);
  const overlays = overlaySettingDocs(anchor);
  const unresolvedNames = new Set(anchor.unresolvedStations.map((s) => s.rawName));

  const groups: GraphBuildGroup[] = anchor.substations.map((station) => {
    const bays = anchor.bays.filter((b) => b.substationId === station.id);
    const bayIds = new Set(bays.map((b) => b.id));
    const lineRelations = anchor.lineRelations.filter(
      (r) => r.fromSubstationId === station.id || r.toSubstationId === station.id
    );
    const stationOverlays = overlays.filter(
      (o) => (o.matchedBayId && bayIds.has(o.matchedBayId)) || normalizeStationName(o.substationRaw) === station.normalizedName
    );
    const needsManualTopology = unresolvedNames.has(station.name);

    return {
      station,
      bays,
      lineRelations,
      overlays: stationOverlays,
      needsManualTopology,
      confidence: needsManualTopology ? "low" : "high",
    };
  });

  // Scoped stations that never even became a substation (no anchor match at
  // all, from either side of a line record) still need a group so they show
  // up for manual review rather than disappearing from the result.
  for (const unresolved of anchor.unresolvedStations) {
    if (groups.some((g) => g.station.name === unresolved.rawName)) continue;
    const displayName = DISPLAY_NAME_OVERRIDE[unresolved.identityKey] ?? unresolved.rawName;
    groups.push({
      station: {
        id: `sub_unresolved_${unresolved.identityKey.replace(/\s+/g, "_")}`,
        name: displayName,
        shortCode: buildShortCode(displayName),
        voltageKv: 150,
        kind: unresolved.kind,
        normalizedName: unresolved.fuzzyKey,
      },
      bays: [],
      lineRelations: [],
      overlays: overlays.filter((o) => normalizeStationName(o.substationRaw) === unresolved.fuzzyKey),
      needsManualTopology: true,
      confidence: "low",
    });
  }

  return { groups, unresolvedStations: anchor.unresolvedStations };
}

/**
 * Merges a chosen subset of confirmed GraphBuildGroups into a single
 * UnifiedNetwork "case" — e.g. for seeding a demo Study whose subject line
 * and neighbors should reflect real anchor data (digsilentLineDb, correct
 * shortCodes) instead of a hand-maintained corridor generator. Only line
 * relations whose BOTH endpoints are among the selected stations are kept,
 * so the resulting case doesn't dangle references to substations that
 * weren't included (e.g. picking DKSBI+DNMGT+PINKA excludes the
 * DKSBI-CENGKARENG relation even though DKSBI itself is included).
 */
export function buildCaseFromGraphGroups(caseId: string, groups: GraphBuildGroup[]): UnifiedNetwork {
  const substationIds = new Set(groups.map((g) => g.station.id));
  const lineRelations = groups
    .flatMap((g) => g.lineRelations)
    .filter((r, index, all) => all.findIndex((other) => other.id === r.id) === index)
    .filter((r) => substationIds.has(r.fromSubstationId) && substationIds.has(r.toSubstationId));

  // Only keep bays that are actually an endpoint of a kept relation — a
  // group's raw bay list includes every bay of that GI, including ones
  // pointing at substations excluded from this subset (e.g. DKSBI's bay
  // toward Cengkareng, which isn't in scope here). Keeping those bays
  // dangling with no owning relation would be confusing in a demo seed.
  const keptBayIds = new Set(lineRelations.flatMap((r) => [r.fromBayId, r.toBayId]));
  const bays = groups.flatMap((g) => g.bays).filter((b) => keptBayIds.has(b.id));

  return {
    caseId,
    substations: groups.map((g) => g.station),
    busbars: [],
    bays,
    terminals: [],
    lineRelations,
    relayIeds: [],
    protectionFunctions: [],
  };
}
