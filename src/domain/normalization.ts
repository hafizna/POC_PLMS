// Helpers to normalize substation, bay, circuit, and relay labels before
// matching imported rows to the unified domain model. These are the shared
// rules used by the LCD+DIST mapper, OCR/GFR mapper, comparison generator,
// and any future Excel/PDF/.set parser.

const STATION_TOKENS_TO_STRIP = /\b(?:gi|gis|gistet|gitet|tet)\b/g;
const VOLTAGE_TOKEN = /\b\d{2,3}\s*kv\b/g;
const PHT_TOKEN = /\bpht\b/g;
const BAY_TOKEN = /\bbay\b/g;
const CIRCUIT_TOKEN = /#\s*\d+/g;
const PUNCTUATION = /[^a-z0-9 ]/g;
const COLLAPSE_SPACES = /\s+/g;

export function normalizeStationName(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(STATION_TOKENS_TO_STRIP, " ")
    .replace(VOLTAGE_TOKEN, " ")
    .replace(PUNCTUATION, " ")
    .replace(COLLAPSE_SPACES, " ")
    .trim();
}

// Identity key for substations — unlike normalizeStationName, this keeps the
// GI/GIS/GITET/GISTET token. Two sites can share a base name (e.g. after a
// GI-to-GIS migration where the old GI's outgoing bay stays live because
// there's no room to move the tower) yet remain distinct physical locations.
// Collapsing that token would silently merge two real substations into one
// node. Use this wherever code decides "are these the same substation"
// (dedup checks, cross-network substation matching). Keep using
// normalizeStationName for fuzzy search/candidate matching (e.g. inferring a
// remote endpoint from free-text bay names), where token-stripping is the
// intended behavior.
export function normalizeSubstationIdentity(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(VOLTAGE_TOKEN, " ")
    .replace(PUNCTUATION, " ")
    .replace(COLLAPSE_SPACES, " ")
    .trim();
}

// Bay names typically encode the remote endpoint, e.g.
// "PHT 150kV DAAN MOGOT#1" -> remote "daan mogot", circuit "1".
export function normalizeBayName(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(PHT_TOKEN, " ")
    .replace(VOLTAGE_TOKEN, " ")
    .replace(STATION_TOKENS_TO_STRIP, " ")
    .replace(CIRCUIT_TOKEN, " ")
    .replace(BAY_TOKEN, " ")
    .replace(PUNCTUATION, " ")
    .replace(COLLAPSE_SPACES, " ")
    .trim();
}

export function normalizeCircuit(value: string | null | undefined): string {
  if (!value) return "";
  const m = String(value).match(/(\d+)/);
  return m ? m[1] : "";
}

export function normalizeRelayLabel(make?: string | null, model?: string | null): string {
  return `${make ?? ""} ${model ?? ""}`
    .toLowerCase()
    .replace(PUNCTUATION, " ")
    .replace(COLLAPSE_SPACES, " ")
    .trim();
}

export type RemoteEndpointHint = {
  endpoint: string;
  circuit: string;
};

// Given a bay descriptor like "PHT 150kV DAAN MOGOT#1", returns the inferred
// remote-endpoint station and circuit number. Used when matching a record's
// bay to the far-side substation of a candidate LineRelation.
export function inferRemoteEndpoint(bayName: string | null | undefined): RemoteEndpointHint {
  return {
    endpoint: normalizeBayName(bayName),
    circuit: normalizeCircuit(bayName),
  };
}

export function tokenize(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

// Token-set match: every token of `needle` must appear in `haystack`. This
// avoids false positives like "muarakarang lama" matching "muarakarang baru".
export function tokensSubsetOf(needle: string, haystack: string): boolean {
  const needleTokens = tokenize(needle);
  if (needleTokens.length === 0) return false;
  const haystackTokens = new Set(tokenize(haystack));
  return needleTokens.every((t) => haystackTokens.has(t));
}

// True when either side's token set is a subset of the other. Useful when
// either the imported value or the seed value may carry extra qualifiers
// (e.g. "muarakarang baru" vs "gis muarakarang baru").
export function looseTokenMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return tokensSubsetOf(a, b) || tokensSubsetOf(b, a);
}
