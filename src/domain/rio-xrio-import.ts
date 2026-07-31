// Parses Sifang/Siemens-style ".rio" plaintext exports and vendor "XRIO" XML
// exports (MiCOM P54x, ABB full-scheme ZMFPDIS, GE D60, Siemens 7SA, GE/
// Alstom P442 fallback) into distance-zone settings shaped like PLMS's own
// DistanceZoneSetting (src/domain/unified.ts) — xReachOhm, rReachOhm,
// rfppOhmPerLoop, rfpeOhmPerLoop, timeDelayPpS, timeDelayPeS — for direct
// crosscheck against PLMS's reference calculation, no unit/shape translation
// needed at the comparison site.
//
// Started as a port of base_ai_tfa's ImpedanceLocus.tsx (parseRIO/parseXRIO)
// — that file mixes this parsing logic with R-X plane chart rendering; only
// the parsing half was adopted, since PLMS already has its own chart
// component (RXPlaneModal). The zone-geometry conversion (importedZoneToConfig,
// quad/mho vertex math for plotting) is NOT ported — this module's job stops
// at raw setting values.
//
// The ported logic also modeled a zone as separate "phGnd"/"phPh" entries
// (good enough for drawing two independent R-X traces) rather than one zone
// carrying both PP and PE reach/resistance/timer together, which is what
// DistanceZoneSetting actually needs. Rebuilt here so one zone = one
// DistanceZoneSetting-shaped record.
//
// Real corrections found by testing against 4 real files the source project
// had no equivalent fixtures for (2 .rio + 2 XRIO, provided directly by the
// user — not present in base_ai_tfa):
//  - Timer values DO exist in real exports the ported logic silently never
//    read: Siemens 7SA522 PROTECTIONDEVICE zones carry TIME1/TIMEM; SIPROTEC
//    5 TESTOBJECT zones carry TRIPTIME; MiCOM P54x XRIO carries "tZn Ph.
//    Delay"/"tZn Gnd. Delay"; ABB's real full-scheme export (see next point)
//    carries tPPZn/tPEZn. All are now captured.
//  - The user's real ABB export uses the "ZMFPDIS" full-scheme distance
//    function (explicit "Zone 1"/"Zone 2"/"Zone 3" sub-blocks, PP/PE reach
//    and resistance split as X1PPZ1/X1PEZ1/RFPPZ1/RFPEZ1, timers as
//    tPPZ1/tPEZ1) — completely different parameter names from the
//    "ZMQ...PDIS" + flat X1/R1/RFPP/RFPE shape the ported logic hardcoded
//    (that shape is kept as a fallback in case an older ZMQPDIS-style export
//    is ever seen, but every real ABB file checked so far is ZMFPDIS).
//  - SIPROTEC 5 TESTOBJECT can express a zone as `BEGIN MHOSHAPE` (ANGLE/
//    REACH/OFFSET — a direct mho circle) instead of `BEGIN SHAPE` (LINE-
//    clipped polygon) — the ported clipShapeByRioLines only handled SHAPE,
//    so every FAULTLOOP LL (phase-phase) zone in the real 7SL87 file was
//    silently dropped entirely. Both shape kinds are now handled.
//  - SIPROTEC 5 TESTOBJECT's earth compensation can appear as a single
//    combined `RERL_XEXL re,xe` field instead of separate RE/RL and XE/XL
//    lines — both forms are now read.

export type RioZoneShapeSource = "polygon" | "mho-circle" | "named-fields";

export type RioImportZone = {
  label: string;
  // Diagnostic only — records which raw shape encoding this zone's reach
  // was derived from (a LINE-clipped polygon, a direct mho circle, or named
  // X/R/timer fields) — not needed for the DistanceZoneSetting-shaped
  // values below, which are always resolved to plain numbers regardless of
  // source shape.
  shapeSource: RioZoneShapeSource;
  // Present when derivable — a zone missing a value here couldn't be
  // resolved from this file's fields (e.g. .rio plaintext formats that only
  // give geometry, not a named reach parameter) and is left undefined
  // rather than guessed.
  xReachOhm?: number;
  rReachOhm?: number;
  rfppOhmPerLoop?: number;
  rfpeOhmPerLoop?: number;
  timeDelayPpS?: number;
  timeDelayPeS?: number;
  lineAngleDeg?: number;
  // Raw polygon/circle geometry, kept only for a caller that wants to
  // recompute reach differently than this module already did — not used by
  // the DistanceZoneSetting mapping above.
  poly?: { r: number; x: number }[];
  circle?: { centerR: number; centerX: number; radius: number };
};

export type RioImportEarthComp = {
  k0: number;
  angleDeg: number;
  source: string;
};

export type RioImportResult = {
  kind: "rio" | "xrio";
  zones: RioImportZone[];
  earthComp?: RioImportEarthComp;
  ctRatio?: number;
  vtRatio?: number;
};

function reactanceFromReach(zReachOhm: number, angleDeg: number): number {
  return zReachOhm * Math.sin((angleDeg * Math.PI) / 180);
}

function polyBounds(poly: { r: number; x: number }[]) {
  const rs = poly.map((p) => p.r);
  const xs = poly.map((p) => p.x);
  return {
    maxR: Math.max(...rs),
    minR: Math.min(...rs),
    maxX: Math.max(...xs),
    minX: Math.min(...xs),
  };
}

// ---------------------------------------------------------------------------
// Plaintext ".rio" (Siemens 7SA PROTECTIONDEVICE / SIPROTEC-5 TESTOBJECT)
// ---------------------------------------------------------------------------

function parseTripCharCircle(block: string) {
  const arc = block.match(/\bARC\s+([-0-9.]+)\s*,\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*,\s*(CW|CCW)/i);
  if (!arc) return null;
  const radius = Number.parseFloat(arc[1]);
  const arcAngleDeg = Number.parseFloat(arc[2]);
  const sweep = Number.parseFloat(arc[3]);
  if (!Number.isFinite(radius) || radius <= 0 || Math.abs(sweep) < 359) return null;

  const startMatch = block.match(/\bSTART\s+([-0-9.]+)\s*,\s*([-0-9.]+)/i);
  if (!startMatch) return null;
  const startR = Number.parseFloat(startMatch[1]);
  const startX = Number.parseFloat(startMatch[2]);
  const angleRad = (arcAngleDeg * Math.PI) / 180;
  return {
    centerR: startR - radius * Math.cos(angleRad),
    centerX: startX - radius * Math.sin(angleRad),
    radius,
  };
}

function parseTripCharPolygon(block: string) {
  const points: { r: number; x: number }[] = [];
  const start = block.match(/\bSTART\s+([-0-9.]+)\s*,\s*([-0-9.]+)/i);
  if (start) points.push({ r: Number.parseFloat(start[1]), x: Number.parseFloat(start[2]) });
  for (const match of block.matchAll(/\bLINE\s+([-0-9.]+)\s*,\s*([-0-9.]+)/gi)) {
    points.push({ r: Number.parseFloat(match[1]), x: Number.parseFloat(match[2]) });
  }
  return points.length >= 3 ? points : null;
}

function polygonArea(poly: { r: number; x: number }[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.r * b.x - b.r * a.x;
  }
  return Math.abs(area) / 2;
}

// SIPROTEC-5 SHAPE blocks come in two flavours sharing the LINE/LINEP
// keyword:
//  (A) each LINE's (r,x) anchor IS a polygon vertex, listed in order.
//  (B) NR/NARI-style exports: (r,x,angle,side) define infinite half-plane
//      clip lines (anchors are degenerate, e.g. two points at the origin).
// Try (A) first; fall back to half-plane clipping (B) and reject any
// unbounded result so a malformed/unsupported shape is skipped instead of
// sprawling to an arbitrary extent.
function clipShapeByRioLines(shapeText: string) {
  const lines = Array.from(
    shapeText.matchAll(
      /^\s*(LINEP?)\s+([+-]?\d[\d.eE+-]*),\s*([+-]?\d[\d.eE+-]*),\s*([+-]?\d[\d.eE+-]*),\s*(LEFT|RIGHT)\b/gim
    )
  ).map((match) => {
    const isPolar = match[1].toUpperCase() === "LINEP";
    const a = Number.parseFloat(match[2]);
    const b = Number.parseFloat(match[3]);
    const r = isPolar ? a * Math.cos((b * Math.PI) / 180) : a;
    const x = isPolar ? a * Math.sin((b * Math.PI) / 180) : b;
    return { r, x, angleDeg: Number.parseFloat(match[4]), side: match[5].toUpperCase() as "LEFT" | "RIGHT" };
  });
  if (lines.length < 2) return null;

  const vertexPoly = lines.map((line) => ({ r: line.r, x: line.x }));
  const allDistinct = vertexPoly.every((point, idx) =>
    vertexPoly.every((other, otherIdx) => otherIdx === idx || Math.hypot(point.r - other.r, point.x - other.x) > 1e-6)
  );
  if (allDistinct && vertexPoly.length >= 3 && polygonArea(vertexPoly) > 1e-3) return vertexPoly;

  const anchors = lines.flatMap((line) => [Math.abs(line.r), Math.abs(line.x)]).filter(Number.isFinite);
  const extent = Math.max(100, ...anchors) * 4;
  let poly = [
    { r: -extent, x: -extent },
    { r: extent, x: -extent },
    { r: extent, x: extent },
    { r: -extent, x: extent },
  ];

  const signedDistance = (point: { r: number; x: number }, line: (typeof lines)[number]) => {
    const rad = (line.angleDeg * Math.PI) / 180;
    return Math.cos(rad) * (point.x - line.x) - Math.sin(rad) * (point.r - line.r);
  };
  const isInside = (point: { r: number; x: number }, line: (typeof lines)[number]) => {
    const value = signedDistance(point, line);
    return line.side === "LEFT" ? value >= -1e-9 : value <= 1e-9;
  };

  for (const line of lines) {
    const next: { r: number; x: number }[] = [];
    for (let idx = 0; idx < poly.length; idx += 1) {
      const current = poly[idx];
      const previous = poly[(idx + poly.length - 1) % poly.length];
      const currentInside = isInside(current, line);
      const previousInside = isInside(previous, line);
      if (currentInside !== previousInside) {
        const prevDistance = signedDistance(previous, line);
        const currentDistance = signedDistance(current, line);
        const denom = prevDistance - currentDistance;
        if (Math.abs(denom) > 1e-12) {
          const t = prevDistance / denom;
          next.push({ r: previous.r + (current.r - previous.r) * t, x: previous.x + (current.x - previous.x) * t });
        }
      }
      if (currentInside) next.push(current);
    }
    poly = next;
    if (poly.length < 3) return null;
  }

  const deduped = poly.filter((point, idx) => {
    const prev = poly[(idx + poly.length - 1) % poly.length];
    return Math.hypot(point.r - prev.r, point.x - prev.x) > 1e-6;
  });
  if (deduped.length < 3) return null;
  const touchesExtent = deduped.some(
    (point) => Math.abs(Math.abs(point.r) - extent) < extent * 1e-3 || Math.abs(Math.abs(point.x) - extent) < extent * 1e-3
  );
  if (touchesExtent) return null;
  return deduped;
}

function readRioNumber(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const match = text.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*(?:=|:)?\\s*([-+]?\\d+(?:\\.\\d+)?)`, "i"));
    if (!match) continue;
    const value = Number.parseFloat(match[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function parseRioRatios(text: string): Pick<RioImportResult, "ctRatio" | "vtRatio"> {
  const vtPrimary = readRioNumber(text, ["VPRIM-LL", "VPRIM", "VPRIMARY", "VT PRIMARY", "MAIN VT PRIMARY"]);
  const vtSecondary = readRioNumber(text, ["VNOM", "VSEC", "VSECONDARY", "VT SECONDARY", "MAIN VT SEC'Y"]);
  const ctPrimary = readRioNumber(text, ["IPRIM", "IPRIMARY", "CT PRIMARY", "CTPRIMARY", "PHASE CT PRIMARY"]);
  const ctSecondary = readRioNumber(text, ["INOM", "ISEC", "ISECONDARY", "CT SECONDARY", "CTSECONDARY", "PHASE CT SEC'Y"]);
  const vtRatio = vtPrimary != null && vtSecondary != null && vtSecondary > 0 ? vtPrimary / vtSecondary : null;
  const ctRatio = ctPrimary != null && ctSecondary != null && ctSecondary > 0 ? ctPrimary / ctSecondary : null;
  return { ...(ctRatio != null ? { ctRatio } : {}), ...(vtRatio != null ? { vtRatio } : {}) };
}

function parseRioEarthComp(text: string): RioImportEarthComp | undefined {
  // Separate-line form (Siemens 7SA522 PROTECTIONDEVICE): "RE/RL a,b" and
  // "XE/XL c,d" on their own lines.
  const reRl = text.match(/\bRE\/RL\s+([-0-9.]+)\s*,\s*([-0-9.]+)/i);
  const xeXl = text.match(/\bXE\/XL\s+([-0-9.]+)\s*,\s*([-0-9.]+)/i);
  if (reRl && xeXl) {
    const re = Number.parseFloat(reRl[1]);
    const xe = Number.parseFloat(xeXl[1]);
    if (Number.isFinite(re) && Number.isFinite(xe)) {
      return {
        k0: Math.hypot(re, xe),
        angleDeg: (Math.atan2(xe, re) * 180) / Math.PI,
        source: `RIO RE/RL=${re.toFixed(3)}, XE/XL=${xe.toFixed(3)}`,
      };
    }
  }
  // Combined form (SIPROTEC 5 TESTOBJECT): "RERL_XEXL re,xe" in one field.
  const combined = text.match(/\bRERL_XEXL\s+([-0-9.]+)\s*,\s*([-0-9.]+)/i);
  if (combined) {
    const re = Number.parseFloat(combined[1]);
    const xe = Number.parseFloat(combined[2]);
    if (Number.isFinite(re) && Number.isFinite(xe)) {
      return {
        k0: Math.hypot(re, xe),
        angleDeg: (Math.atan2(xe, re) * 180) / Math.PI,
        source: `RIO RERL_XEXL=${re.toFixed(3)},${xe.toFixed(3)}`,
      };
    }
  }
  return undefined;
}

// SIPROTEC 5 TESTOBJECT zones carry a single TRIPTIME (unlike the Siemens
// 7SA522 PROTECTIONDEVICE form's separate TIME1/TIMEM pair) — same physical
// meaning (zone operate delay), different keyword.
function readZoneTimeDelay(block: string): number | undefined {
  const time1 = block.match(/^\s*TIME1\s+([-0-9.]+)/m);
  if (time1) {
    const value = Number.parseFloat(time1[1]);
    if (Number.isFinite(value)) return value;
  }
  const tripTime = block.match(/^\s*TRIPTIME\s+([-0-9.]+)/m);
  if (tripTime) {
    const value = Number.parseFloat(tripTime[1]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

// SIPROTEC 5 TESTOBJECT's direct mho-circle shape: "BEGIN MHOSHAPE / ANGLE
// deg / REACH ohm / OFFSET ohm / END MHOSHAPE" — an alternative to the
// LINE-clipped BEGIN SHAPE polygon. Confirmed real usage: a SIPROTEC 5 7SL87
// export uses this for every FAULTLOOP LL (phase-phase) zone, never SHAPE.
function parseMhoShape(shapeText: string): { centerR: number; centerX: number; radius: number } | null {
  const angleMatch = shapeText.match(/^\s*ANGLE\s+([-0-9.]+)/m);
  const reachMatch = shapeText.match(/^\s*REACH\s+([-0-9.]+)/m);
  if (!angleMatch || !reachMatch) return null;
  const angleDeg = Number.parseFloat(angleMatch[1]);
  const reach = Number.parseFloat(reachMatch[1]);
  if (!Number.isFinite(angleDeg) || !Number.isFinite(reach) || reach <= 0) return null;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    centerR: (reach / 2) * Math.cos(angleRad),
    centerX: (reach / 2) * Math.sin(angleRad),
    radius: reach / 2,
  };
}

// A parsed LN (ground) and LL (phase) zone sharing the same label are two
// halves of ONE DistanceZoneSetting-shaped record — this merges them the
// way ABB/MiCOM export a single named zone with both loop types together.
function mergeLoopZones(
  label: string,
  gnd: { poly?: { r: number; x: number }[]; circle?: RioImportZone["circle"]; timeDelayS?: number } | undefined,
  ph: { poly?: { r: number; x: number }[]; circle?: RioImportZone["circle"]; timeDelayS?: number } | undefined
): RioImportZone {
  const zone: RioImportZone = { label, shapeSource: "polygon" };
  if (gnd?.circle) {
    zone.shapeSource = "mho-circle";
    zone.circle = gnd.circle;
    zone.xReachOhm = gnd.circle.centerX + gnd.circle.radius;
    zone.rfpeOhmPerLoop = gnd.circle.radius;
  } else if (gnd?.poly) {
    zone.poly = gnd.poly;
    const bounds = polyBounds(gnd.poly);
    zone.xReachOhm = bounds.maxX;
    zone.rfpeOhmPerLoop = Math.abs(bounds.minR) || bounds.maxR;
  }
  zone.timeDelayPeS = gnd?.timeDelayS;

  if (ph?.circle) {
    zone.shapeSource = "mho-circle";
    if (!zone.circle) zone.circle = ph.circle;
    if (zone.xReachOhm == null) zone.xReachOhm = ph.circle.centerX + ph.circle.radius;
    zone.rfppOhmPerLoop = ph.circle.radius;
  } else if (ph?.poly) {
    if (!zone.poly) zone.poly = ph.poly;
    const bounds = polyBounds(ph.poly);
    if (zone.xReachOhm == null) zone.xReachOhm = bounds.maxX;
    zone.rfppOhmPerLoop = Math.abs(bounds.minR) || bounds.maxR;
  }
  zone.timeDelayPpS = ph?.timeDelayS;

  return zone;
}

// Sifang/SIPROTEC-5-format .rio: BEGIN TESTOBJECT / BEGIN DISTANCE / BEGIN
// ZONE blocks with INDEX/FAULTLOOP + either BEGIN SHAPE (LINE-clipped
// polygon) or BEGIN MHOSHAPE (direct mho circle).
function parseSifangRio(text: string): RioImportResult | null {
  if (!/BEGIN\s+TESTOBJECT/i.test(text)) return null;
  const distMatch = text.match(/BEGIN\s+DISTANCE([\s\S]*?)END\s+DISTANCE/i);
  if (!distMatch) return null;
  const distText = distMatch[1];

  type LoopEntry = { poly?: { r: number; x: number }[]; circle?: RioImportZone["circle"]; timeDelayS?: number };
  const gndByIndex = new Map<number, LoopEntry>();
  const phByIndex = new Map<number, LoopEntry>();

  const zonePattern = /BEGIN\s+ZONE([\s\S]*?)END\s+ZONE/gi;
  let zoneMatch: RegExpExecArray | null;
  while ((zoneMatch = zonePattern.exec(distText)) !== null) {
    const block = zoneMatch[1];
    const indexMatch = block.match(/^\s*INDEX\s+(\d+)/m);
    const loopMatch = block.match(/^\s*FAULTLOOP\s+(\w+)/m);
    if (!indexMatch || !loopMatch) continue;

    const index = Number.parseInt(indexMatch[1], 10);
    const faultloop = loopMatch[1].toUpperCase();
    const timeDelayS = readZoneTimeDelay(block);

    let poly: { r: number; x: number }[] | undefined;
    let circle: RioImportZone["circle"] | undefined;
    const shapeMatch = block.match(/BEGIN\s+SHAPE([\s\S]*?)END\s+SHAPE/i);
    if (shapeMatch) {
      const clipped = clipShapeByRioLines(shapeMatch[1]);
      if (clipped && clipped.length >= 3) poly = clipped;
    }
    if (!poly) {
      const mhoMatch = block.match(/BEGIN\s+MHOSHAPE([\s\S]*?)END\s+MHOSHAPE/i);
      if (mhoMatch) circle = parseMhoShape(mhoMatch[1]) ?? undefined;
    }
    if (!poly && !circle) continue;

    if (faultloop === "LN") gndByIndex.set(index, { poly, circle, timeDelayS });
    else if (faultloop === "LL") phByIndex.set(index, { poly, circle, timeDelayS });
  }
  if (gndByIndex.size === 0 && phByIndex.size === 0) return null;

  // Two indexing conventions have been confirmed in real exports:
  //  - same INDEX shared between the LN and LL block for one physical zone
  //    (e.g. INDEX 1 appears once as FAULTLOOP LN, once as FAULTLOOP LL).
  //  - INDEX offset by the ground-zone count: indices 1..N are the ground
  //    (LN) zones, N+1..2N are the SAME physical zones' phase (LL)
  //    declarations (confirmed real: SIPROTEC 5 7SL87 — INDEX 1/2/3 are
  //    LN, INDEX 4/5/6 are LL for the identical Z1/Z2/Z3, matching TRIPTIME
  //    pairwise: 1↔4, 2↔5, 3↔6).
  const gndIndices = [...gndByIndex.keys()].sort((a, b) => a - b);
  const phIndices = [...phByIndex.keys()].sort((a, b) => a - b);
  const sharesAnyIndex = gndIndices.some((idx) => phByIndex.has(idx));
  const offset = sharesAnyIndex ? 0 : gndIndices.length;

  const allZoneIndices = new Set<number>(gndIndices);
  for (const phIdx of phIndices) allZoneIndices.add(sharesAnyIndex ? phIdx : phIdx - offset);
  const orderedZoneIndices = [...allZoneIndices].sort((a, b) => a - b).slice(0, 3);

  const zones = orderedZoneIndices.map((zoneIdx) =>
    mergeLoopZones(`Z${zoneIdx}`, gndByIndex.get(zoneIdx), phByIndex.get(sharesAnyIndex ? zoneIdx : zoneIdx + offset))
  );

  const kmMatch = text.match(/\bKM\s+([-0-9.]+)\s*,\s*([-0-9.]+)/i);
  let earthComp: RioImportEarthComp | undefined;
  if (kmMatch) {
    const k0 = Number.parseFloat(kmMatch[1]);
    const angleDeg = Number.parseFloat(kmMatch[2]);
    if (Number.isFinite(k0) && Number.isFinite(angleDeg) && k0 > 0) {
      earthComp = { k0, angleDeg, source: `RIO KM=${k0.toFixed(4)}, ∠=${angleDeg.toFixed(1)}°` };
    }
  }
  if (!earthComp) earthComp = parseRioEarthComp(text);

  return {
    kind: "rio",
    zones,
    ...(earthComp ? { earthComp } : {}),
    ...parseRioRatios(text),
  };
}

// Siemens/MiCOM-style .rio: BEGIN PROTECTIONDEVICE / BEGIN ZONE(-OVERREACH)
// with TRIPCHAR (phase) / TRIPCHAR-EARTH (ground) circle-or-polygon blocks.
export function parseRio(text: string): RioImportResult | null {
  if (!/BEGIN\s+PROTECTIONDEVICE/i.test(text)) return parseSifangRio(text);

  const zones: RioImportZone[] = [];
  const zonePattern = /BEGIN\s+(ZONE(?:-OVERREACH)?)\b([\s\S]*?)END\s+\1/gi;
  let zoneMatch: RegExpExecArray | null = zonePattern.exec(text);
  while (zoneMatch) {
    const block = zoneMatch[0];
    const labelMatch = block.match(/\bNAME\s+(.+?)(?=\s+(?:TIME1|TIMEM|BEGIN|ACTIVE|INDEX|FAULTLOOP)\b|$)/i);
    const label = labelMatch?.[1]?.trim() || `Z${zones.length + 1}`;
    const timeDelayS = readZoneTimeDelay(block);
    const tripPhase = block.match(/BEGIN\s+TRIPCHAR([\s\S]*?)END\s+TRIPCHAR/i);
    const tripEarth = block.match(/BEGIN\s+TRIPCHAR-EARTH([\s\S]*?)END\s+TRIPCHAR-EARTH/i);

    let ph: { poly?: { r: number; x: number }[]; circle?: RioImportZone["circle"]; timeDelayS?: number } | undefined;
    let gnd: { poly?: { r: number; x: number }[]; circle?: RioImportZone["circle"]; timeDelayS?: number } | undefined;
    if (tripPhase) {
      const circle = parseTripCharCircle(tripPhase[1]) ?? undefined;
      const poly = parseTripCharPolygon(tripPhase[1]) ?? undefined;
      if (circle || poly) ph = { circle, poly, timeDelayS };
    }
    if (tripEarth) {
      const circle = parseTripCharCircle(tripEarth[1]) ?? undefined;
      const poly = parseTripCharPolygon(tripEarth[1]) ?? undefined;
      if (circle || poly) gnd = { circle, poly, timeDelayS };
    }
    if (ph || gnd) zones.push(mergeLoopZones(label, gnd, ph));
    zoneMatch = zonePattern.exec(text);
  }

  return {
    kind: "rio",
    zones: zones.slice(0, 3),
    earthComp: parseRioEarthComp(text),
    ...parseRioRatios(text),
  };
}

// ---------------------------------------------------------------------------
// Vendor "XRIO" XML export (MiCOM P54x, ABB full-scheme ZMFPDIS, GE D60,
// Siemens 7SA, GE/Alstom P442 fallback)
// ---------------------------------------------------------------------------

export function parseXrio(text: string): RioImportResult | null {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "application/xml");
  if (xml.querySelector("parsererror")) return null;

  const params = Array.from(xml.querySelectorAll("Parameter"));
  const blocks = Array.from(xml.querySelectorAll("Block"));

  // MiCOM/Alstom relays (P54x, P44x) store up to 4 setting groups; each
  // group has its own "GROUP <N> ..." block with its own reach values.
  // "Active Settings" says which group is live — without scoping to it,
  // getFirst() always grabs GROUP 1 even when the relay runs a different
  // group, silently reading the wrong reach.
  function blockName(node: Element): string {
    for (const child of Array.from(node.children)) {
      if (child.tagName === "Name") return child.textContent?.trim() ?? "";
    }
    return "";
  }
  function detectActiveGroup(): number {
    for (const node of params) {
      if (node.querySelector("Name")?.textContent?.trim() !== "Active Settings") continue;
      const value = node.querySelector("Value")?.textContent?.trim() ?? "";
      const direct = value.match(/Group\s*([1-4])/i);
      if (direct) return Number.parseInt(direct[1], 10);
      const enumId = value.match(/_(\d)$/);
      if (enumId) return Number.parseInt(enumId[1], 10) + 1;
    }
    return 1;
  }
  const activeGroup = detectActiveGroup();
  const activeGroupParams = new Set<Element>();
  for (const block of blocks) {
    if (!new RegExp(`^GROUP\\s*${activeGroup}\\b`, "i").test(blockName(block))) continue;
    for (const p of Array.from(block.querySelectorAll("Parameter"))) activeGroupParams.add(p);
  }

  function getFirst(name: string): string | null {
    const inGroup = params.find(
      (node) => activeGroupParams.has(node) && node.querySelector("Name")?.textContent?.trim() === name
    );
    if (inGroup) return inGroup.querySelector("Value")?.textContent?.trim() ?? null;
    const p = params.find((node) => node.querySelector("Name")?.textContent?.trim() === name);
    return p?.querySelector("Value")?.textContent?.trim() ?? null;
  }
  function getFirstOf(names: string[]): string | null {
    for (const name of names) {
      const value = getFirst(name);
      if (value !== null) return value;
    }
    return null;
  }
  function getFirstNumber(names: string[]): number | null {
    const raw = getFirstOf(names);
    if (raw === null) return null;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : null;
  }
  function valueIsEnabled(value: string | null) {
    if (value === null) return true;
    return !/(?:_0|\b0\b|OFF|DISABLED|INACTIVE|12656)$/i.test(value);
  }
  function statusIsEnabled(name: string) {
    return valueIsEnabled(getFirst(name));
  }
  function directText(node: Element, tagName: string): string | null {
    for (const child of Array.from(node.children)) {
      if (child.tagName === tagName) return child.textContent?.trim() ?? null;
    }
    return null;
  }
  function directName(node: Element): string {
    return directText(node, "Name") ?? "";
  }
  function directChildBlocks(node: Element): Element[] {
    return Array.from(node.children).filter((child) => child.tagName === "Block");
  }
  function directParamValue(block: Element, names: string[]): string | null {
    for (const child of Array.from(block.children)) {
      if (child.tagName !== "Parameter") continue;
      if (names.includes(directName(child))) return directText(child, "Value");
    }
    return null;
  }
  function directParamNumber(block: Element, names: string[]): number | null {
    const raw = directParamValue(block, names);
    if (raw === null) return null;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : null;
  }
  function directParamValueMatching(block: Element, pattern: RegExp): string | null {
    for (const child of Array.from(block.children)) {
      if (child.tagName !== "Parameter") continue;
      if (pattern.test(directName(child))) return directText(child, "Value");
    }
    return null;
  }
  function directParamNumberMatching(block: Element, pattern: RegExp): number | null {
    const raw = directParamValueMatching(block, pattern);
    if (raw === null) return null;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : null;
  }
  function firstDirectChildBlock(block: Element, name: string): Element | null {
    return directChildBlocks(block).find((child) => directName(child) === name) ?? null;
  }

  const lineAngleDeg = getFirstNumber(["Line Angle"]) ?? 75;
  const angDeg = Number.isFinite(lineAngleDeg) ? lineAngleDeg : 75;

  // MiCOM P54x: flat "Zn Ph. Reach"/"Zn Gnd. Reach" + "Rn Ph. Resistive"/"Rn
  // Gnd Resistive" + "tZn Ph. Delay"/"tZn Gnd. Delay" parameters (no nested
  // per-zone Block — everything lives at the top Parameter list, scoped by
  // active setting group). Confirmed real usage includes timers, which the
  // ported reference logic never read.
  const p54xZoneIds = ["1", "2", "3", "P", "4", "Q"] as const;
  type P54xZoneId = (typeof p54xZoneIds)[number];
  function buildP54xZone(id: P54xZoneId): RioImportZone | null {
    const phEnabled = statusIsEnabled("Phase Chars.") && statusIsEnabled(`Zone ${id} Ph Status`);
    const gndEnabled = statusIsEnabled("Ground Chars.") && statusIsEnabled(`Zone ${id} Gnd Stat.`);
    if (!phEnabled && !gndEnabled) return null;

    const phReach = phEnabled ? getFirstNumber([`Z${id} Ph. Reach`, `Z${id} Ph Reach`]) : null;
    const gndReach = gndEnabled ? getFirstNumber([`Z${id} Gnd. Reach`, `Z${id} Gnd Reach`]) : null;
    const phAngle = getFirstNumber([`Z${id} Ph. Angle`, `Z${id} Ph Angle`]) ?? angDeg;
    const gndAngle = getFirstNumber([`Z${id} Gnd. Angle`, `Z${id} Gnd Angle`]) ?? angDeg;
    const rfpp = phEnabled
      ? getFirstNumber(["Z" + id + " Ph. Resistive" /* fallthrough labels below */].concat([
          `R${id} Ph. Resistive`,
          `R${id} Ph Resistive`,
          `R${id} Ph. Res. Fwd.`,
          `R${id} Ph. Res. Fwd`,
          `R${id} Ph Res Fwd`,
        ]))
      : null;
    const rfpe = gndEnabled
      ? getFirstNumber([
          `R${id} Gnd Resistive`,
          `R${id} Gnd. Resistive`,
          `R${id} Gnd. Res. Fwd.`,
          `R${id} Gnd. Res. Fwd`,
          `R${id} Gnd Res Fwd`,
        ])
      : null;
    const tPp = getFirstNumber([`tZ${id} Ph. Delay`, `tZ${id} Ph Delay`]);
    const tPe = getFirstNumber([`tZ${id} Gnd. Delay`, `tZ${id} Gnd Delay`]);

    if ((phReach == null || phReach <= 0) && (gndReach == null || gndReach <= 0)) return null;
    const xReachOhm =
      phReach != null && phReach > 0
        ? reactanceFromReach(phReach, phAngle)
        : gndReach != null && gndReach > 0
          ? reactanceFromReach(gndReach, gndAngle)
          : undefined;

    return {
      label: `Z${id}`,
      shapeSource: "named-fields",
      xReachOhm,
      rfppOhmPerLoop: rfpp != null && rfpp > 0 ? rfpp : undefined,
      rfpeOhmPerLoop: rfpe != null && rfpe > 0 ? rfpe : undefined,
      timeDelayPpS: tPp ?? undefined,
      timeDelayPeS: tPe ?? undefined,
      lineAngleDeg: phAngle,
    };
  }
  function buildP54xZones(): RioImportZone[] {
    return p54xZoneIds.flatMap((id) => {
      const zone = buildP54xZone(id);
      return zone ? [zone] : [];
    });
  }

  // ABB full-scheme distance (ZMFPDIS) — confirmed real export shape: outer
  // Block named "ZMFPDIS: N" containing "Zone 1"/"Zone 2"/"Zone 3" child
  // Blocks, each with its own "Setting Group1" holding
  // OpModePPZn/OpModePEZn/X1[PP|PE]Zn/R1[PP|PE]Zn/RFPPZn/RFPEZn/tPPZn/tPEZn
  // (zone 1 splits PP/PE reach; zones 2/3 share one X1Zn/R1Zn reach for
  // both loops but keep separate resistance and timers). This is a
  // completely different shape from the flat "ZMQ...PDIS: N" + top-level
  // X1/R1/RFPP/RFPE the reference project hardcoded — that older shape is
  // kept below as buildAbbQuadZones in case it's ever seen, but every real
  // ABB file checked so far is ZMFPDIS.
  function buildAbbFullSchemeZones(): RioImportZone[] {
    const deviceBlock = blocks.find((block) => /^ZMFPDIS:\s*\d+$/i.test(directName(block)));
    if (!deviceBlock) return [];
    const zoneBlocks = directChildBlocks(deviceBlock).filter((block) => /^Zone\s*[1-5]$/i.test(directName(block)));
    return zoneBlocks.flatMap((zoneBlock): RioImportZone[] => {
      const match = directName(zoneBlock).match(/^Zone\s*([1-5])$/i);
      if (!match) return [];
      const id = match[1];
      const setting = firstDirectChildBlock(zoneBlock, "Setting Group1") ?? zoneBlock;
      const ppEnabled = valueIsEnabled(directParamValue(setting, [`OpModePPZ${id}`]));
      const peEnabled = valueIsEnabled(directParamValue(setting, [`OpModePEZ${id}`]));
      if (!ppEnabled && !peEnabled) return [];

      // Zone 1 exports separate PP/PE reach; zones 2/3 share one reach.
      const xPp = directParamNumber(setting, [`X1PPZ${id}`, `X1Z${id}`]);
      const xPe = directParamNumber(setting, [`X1PEZ${id}`, `X1Z${id}`]);
      const rfpp = directParamNumber(setting, [`RFPPZ${id}`]);
      const rfpe = directParamNumber(setting, [`RFPEZ${id}`]);
      const tPp = directParamNumber(setting, [`tPPZ${id}`]);
      const tPe = directParamNumber(setting, [`tPEZ${id}`]);
      const xReachOhm = xPp ?? xPe;
      if (xReachOhm == null || xReachOhm <= 0) return [];

      return [
        {
          label: `Z${id}`,
          shapeSource: "named-fields",
          xReachOhm,
          rfppOhmPerLoop: ppEnabled && rfpp != null && rfpp > 0 ? rfpp : undefined,
          rfpeOhmPerLoop: peEnabled && rfpe != null && rfpe > 0 ? rfpe : undefined,
          timeDelayPpS: ppEnabled ? tPp ?? undefined : undefined,
          timeDelayPeS: peEnabled ? tPe ?? undefined : undefined,
          lineAngleDeg: angDeg,
        },
      ];
    });
  }

  // Older ABB quadrilateral naming ("ZMQ...PDIS: N" + flat X1/R1/RFPP/RFPE)
  // — kept as a fallback for exports that might still use it; no real
  // sample confirmed this shape, unlike ZMFPDIS above.
  function buildAbbQuadZones(): RioImportZone[] {
    return blocks.flatMap((block): RioImportZone[] => {
      const match = directName(block).match(/^ZMQ\w*PDIS:\s*([1-5])$/i);
      if (!match) return [];
      const setting = firstDirectChildBlock(block, "Setting Group1") ?? block;
      if (!valueIsEnabled(directParamValue(setting, ["Operation"]))) return [];
      const ppEnabled = valueIsEnabled(directParamValue(setting, ["OperationPP"]));
      const peEnabled = valueIsEnabled(directParamValue(setting, ["OperationPE"]));
      const x = directParamNumber(setting, ["X1"]);
      const rfpp = directParamNumber(setting, ["RFPP"]);
      const rfpe = directParamNumber(setting, ["RFPE"]);
      if (x == null || x <= 0) return [];
      return [
        {
          label: `Z${match[1]}`,
          shapeSource: "named-fields",
          xReachOhm: x,
          rfppOhmPerLoop: ppEnabled && rfpp != null && rfpp > 0 ? rfpp : undefined,
          rfpeOhmPerLoop: peEnabled && rfpe != null && rfpe > 0 ? rfpe : undefined,
          lineAngleDeg: angDeg,
        },
      ];
    });
  }

  function buildGeD60Zones(): RioImportZone[] {
    const byId = new Map<string, RioImportZone>();
    for (const block of blocks) {
      const phaseMatch = directName(block).match(/^Phase Distance Z([1-5])$/i);
      const groundMatch = directName(block).match(/^Ground Distance Z([1-5])$/i);
      const match = phaseMatch ?? groundMatch;
      if (!match) continue;
      if (!valueIsEnabled(directParamValue(block, ["Function ()"]))) continue;
      const reach = directParamNumber(block, ["Reach (Ohms)"]);
      if (reach == null || reach <= 0) continue;

      const id = match[1];
      const angle = directParamNumberMatching(block, /^RCA\b/i) ?? angDeg;
      const right = directParamNumberMatching(block, /^Quad Right Blinder/i) ?? reach;
      const existing = byId.get(id) ?? { label: `Z${id}`, shapeSource: "named-fields" as const, lineAngleDeg: angle };
      const xReachOhm = reactanceFromReach(reach, angle);
      if (phaseMatch) {
        existing.rfppOhmPerLoop = right;
        if (existing.xReachOhm == null) existing.xReachOhm = xReachOhm;
      } else {
        existing.rfpeOhmPerLoop = right;
        if (existing.xReachOhm == null) existing.xReachOhm = xReachOhm;
      }
      byId.set(id, existing);
    }
    return Array.from(byId.values());
  }

  function buildSiemens7saZones(): RioImportZone[] {
    return blocks.flatMap((block): RioImportZone[] => {
      const match = directName(block).match(/^Zone Z([1-5])$/i);
      if (!match) return [];
      const id = match[1];
      if (!valueIsEnabled(directParamValueMatching(block, new RegExp(`^Op\\. mode Z${id}$`, "i")))) return [];
      const x = directParamNumberMatching(block, new RegExp(`^X\\(Z${id}\\)`, "i"));
      const rPh = directParamNumberMatching(block, new RegExp(`^R\\(Z${id}\\)`, "i"));
      const rGnd = directParamNumberMatching(block, new RegExp(`^RE\\(Z${id}\\)`, "i"));
      if (x == null || x <= 0) return [];
      return [
        {
          label: `Z${id}`,
          shapeSource: "named-fields",
          xReachOhm: x,
          rfppOhmPerLoop: rPh != null && rPh > 0 ? rPh : undefined,
          rfpeOhmPerLoop: rGnd != null && rGnd > 0 ? rGnd : undefined,
          lineAngleDeg: angDeg,
        },
      ];
    });
  }

  // GE/Alstom P442 xrio naming: Z1/Z2/Z3 = X reach (along line angle, Ohm
  // secondary); R1G/R2G/R3G-R4G = earth fault resistance coverage;
  // R1Ph/R2Ph/R3Ph-R4Ph = phase fault resistance coverage.
  function buildP442Zones(): RioImportZone[] {
    const defs = [
      { label: "Z1", xKey: "Z1", peKey: "R1G", ppKey: "R1Ph" },
      { label: "Z2", xKey: "Z2", peKey: "R2G", ppKey: "R2Ph" },
      { label: "Z3", xKey: "Z3", peKey: "R3G-R4G", ppKey: "R3Ph-R4Ph" },
    ];
    return defs.flatMap(({ label, xKey, peKey, ppKey }): RioImportZone[] => {
      const xStr = getFirst(xKey);
      if (!xStr) return [];
      const x = Number.parseFloat(xStr);
      if (!Number.isFinite(x) || x <= 0) return [];
      const rpe = getFirstNumber([peKey]);
      const rpp = getFirstNumber([ppKey]);
      return [
        {
          label,
          shapeSource: "named-fields",
          xReachOhm: x,
          rfpeOhmPerLoop: rpe != null && rpe > 0 ? rpe : undefined,
          rfppOhmPerLoop: rpp != null && rpp > 0 ? rpp : undefined,
          lineAngleDeg: angDeg,
        },
      ];
    });
  }

  let earthComp: RioImportEarthComp | undefined;
  const k0MagStr = getFirstOf(["kZ1 Res Comp", "kZN Res Comp", "kZN1 Res. Comp."]);
  const k0AngStr = getFirstOf(["kZ1 Angle", "kZN Res Angle", "kZN1 Res. Angle"]);
  if (k0MagStr && k0AngStr) {
    const k0 = Number.parseFloat(k0MagStr);
    const angleDeg = Number.parseFloat(k0AngStr);
    if (Number.isFinite(k0) && Number.isFinite(angleDeg)) {
      earthComp = { k0, angleDeg, source: `xrio kZ1=${k0.toFixed(4)}, ∠=${angleDeg.toFixed(1)}°` };
    }
  }
  if (!earthComp) {
    const re = getFirstNumber(["RE/RL(Z1)", "RE/RL(> Z1)"]);
    const xe = getFirstNumber(["XE/XL(Z1)", "XE/XL(> Z1)"]);
    if (re != null && xe != null) {
      earthComp = {
        k0: Math.hypot(re, xe),
        angleDeg: (Math.atan2(xe, re) * 180) / Math.PI,
        source: `xrio RE/RL=${re.toFixed(3)}, XE/XL=${xe.toFixed(3)}`,
      };
    }
  }
  if (!earthComp) {
    const geGroundZ1 = blocks.find((block) => directName(block) === "Ground Distance Z1");
    const z0z1Mag = geGroundZ1 ? directParamNumber(geGroundZ1, ["Z0/Z1 Mag ()"]) : null;
    const z0z1Ang = geGroundZ1 ? directParamNumberMatching(geGroundZ1, /^Z0\/Z1 Ang/i) : null;
    if (z0z1Mag != null && z0z1Ang != null) {
      const angleRad = (z0z1Ang * Math.PI) / 180;
      const real = (z0z1Mag * Math.cos(angleRad) - 1) / 3;
      const imag = (z0z1Mag * Math.sin(angleRad)) / 3;
      earthComp = {
        k0: Math.hypot(real, imag),
        angleDeg: (Math.atan2(imag, real) * 180) / Math.PI,
        source: `xrio Z0/Z1=${z0z1Mag.toFixed(3)}, angle=${z0z1Ang.toFixed(1)} deg`,
      };
    }
  }

  const vtPrimary = getFirstNumber(["Main VT Primary", "VT Primary", "Unom PRIMARY", "VTprim7", "VTprim1"]);
  const vtSecondary = getFirstNumber(["Main VT Sec'y", "Main VT Secondary", "VT Secondary", "Unom SECONDARY", "VTsec7", "VTsec1"]);
  const ctPrimary = getFirstNumber(["Phase CT Primary", "Phase CT Primary (A)", "CT Primary", "CT PRIMARY", "CTprim1"]);
  const ctSecondary = getFirstNumber([
    "Phase CT Sec'y",
    "Phase CT Secondary",
    "Phase CT Secondary (A)",
    "CT Secondary",
    "CT SECONDARY",
    "CTsec1",
  ]);
  let vtRatio = vtPrimary != null && vtSecondary != null && vtSecondary > 0 ? vtPrimary / vtSecondary : null;
  const ctRatio = ctPrimary != null && ctSecondary != null && ctSecondary > 0 ? ctPrimary / ctSecondary : null;
  if (vtRatio == null) vtRatio = getFirstNumber(["Phase VT Ratio ()"]);

  const p54x = buildP54xZones();
  const abbFullScheme = buildAbbFullSchemeZones();
  const abbQuad = buildAbbQuadZones();
  const geD60 = buildGeD60Zones();
  const siemens7sa = buildSiemens7saZones();
  const zones = p54x.length
    ? p54x
    : abbFullScheme.length
      ? abbFullScheme
      : abbQuad.length
        ? abbQuad
        : geD60.length
          ? geD60
          : siemens7sa.length
            ? siemens7sa
            : buildP442Zones();
  if (zones.length === 0) return null;

  return {
    kind: "xrio",
    zones,
    ...(earthComp ? { earthComp } : {}),
    ...(ctRatio !== null && vtRatio !== null ? { ctRatio, vtRatio } : {}),
  };
}

// Tries XRIO (XML) first since it's unambiguous to detect (well-formed XML
// or not), then falls back to plaintext .rio (Siemens/MiCOM PROTECTIONDEVICE
// or Sifang/SIPROTEC-5 TESTOBJECT framing).
export function parseRioOrXrio(text: string): RioImportResult | null {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<")) {
    const xrio = parseXrio(text);
    if (xrio) return xrio;
  }
  return parseRio(text);
}
