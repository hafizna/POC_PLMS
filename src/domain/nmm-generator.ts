import {
  Bay,
  Busbar,
  LineRelation,
  ProtectionFunction,
  RelayIED,
  Terminal,
  UnifiedNetwork,
  UnifiedSubstation,
  classifyProtectionFunction,
} from "./unified";
import { parseCtRatio, parseVtRatio } from "./instrument-transformers";
import { normalizeStationName, inferRemoteEndpoint, looseTokenMatch, normalizeCircuit } from "./normalization";
import lcdDistRegistry from "./generated/lcd-dist-registry.json";
import ocrRegistry from "./generated/ocr-registry.json";

export function generateCorridorNmm(): UnifiedNetwork {
  // Coverage neighborhood for studying line setting at DKS and DM. Includes
  // forward chain (DM-PIK-MKB) for DKS forward relay's Z2/Z3 reach analysis,
  // plus DKS reverse-side branches (Grogol Baru, Kebon Jeruk) for DM relay's
  // reverse-side Z2/Z3 reach analysis. Transformer/coupler/section bays are
  // out of POC scope (distance protection on line bays only).
  const targetSubstations = [
    "GI 150kV DURIKOSAMBI",
    "GIS 150kV DAAN MOGOT",
    "GIS 150kV PANTAI INDAH KAPUK",
    "GIS 150kV MUARAKARANG BARU",
    "GIS 150kV GROGOL BARU",
    "GIS 150kV KEBON JERUK",
  ];

  const caseId = "case_dks_dm_pik_mkb";

  // Combine records to use for generation
  const allLcd = lcdDistRegistry.records;
  const allOcr = ocrRegistry.records;

  // Filter for our target stations
  const lcdTarget = allLcd.filter(r => targetSubstations.includes(r.substation));
  const ocrTarget = allOcr.filter(r => targetSubstations.includes(r.substation));

  // Collect substations
  const SUBS: UnifiedSubstation[] = [];
  const BUSBARS: Busbar[] = [];
  const subIds = new Map<string, string>();

  for (const rawName of targetSubstations) {
    const norm = normalizeStationName(rawName);
    const kind = rawName.toUpperCase().includes("GIS") ? "GIS" : "GI";
    let shortCode = "UNK";
    if (norm.includes("durikosambi")) shortCode = "DKS";
    if (norm.includes("daan mogot")) shortCode = "DM";
    if (norm.includes("pantai indah kapuk")) shortCode = "PIK";
    if (norm.includes("muarakarang baru")) shortCode = "MKB";
    if (norm.includes("grogol baru")) shortCode = "GRB";
    if (norm.includes("kebon jeruk")) shortCode = "KBJ";

    const id = shortCode.toLowerCase();
    subIds.set(rawName, id);

    SUBS.push({
      id,
      name: rawName.replace(/^(GI|GIS|GISTET)\s+150kV\s+/i, ""),
      shortCode,
      kind,
      voltageKv: 150,
      normalizedName: norm,
    });

    BUSBARS.push(
      { id: `bb_${id}_a`, substationId: id, label: "Bus A", voltageKv: 150, kind: "main" },
      { id: `bb_${id}_b`, substationId: id, label: "Bus B", voltageKv: 150, kind: "main" }
    );
  }

  // Collect Bays and Relays
  const BAYS: Bay[] = [];
  const TERMINALS: Terminal[] = [];
  const RELAY_IEDS: RelayIED[] = [];
  const PROTECTION_FUNCTIONS: ProtectionFunction[] = [];

  const bayMap = new Map<string, Bay>();

  function processRecord(record: any, sourceFlag: "LCD" | "OCR") {
    if (!targetSubstations.includes(record.substation)) return;
    const subId = subIds.get(record.substation)!;

    const bayKey = `${subId}__${record.bay}`;
    let bayId = "";
    if (!bayMap.has(bayKey)) {
      const hint = inferRemoteEndpoint(record.bay);
      const targetRemoteShort = hint.endpoint.replace(/gis|gi|150kv|pht|\b(bay)\b/g, "").trim().toLowerCase();
      let rShort = "unk";
      if (targetRemoteShort.includes("daan mogot")) rShort = "dm";
      if (targetRemoteShort.includes("durikosambi")) rShort = "dks";
      if (targetRemoteShort.includes("pantai indah kapuk")) rShort = "pik";
      if (targetRemoteShort.includes("muarakarang baru")) rShort = "mkb";
      if (targetRemoteShort.includes("grogol baru")) rShort = "grb";
      if (targetRemoteShort.includes("kebon jeruk")) rShort = "kbj";

      bayId = `bay_${subId}_${rShort}_${normalizeCircuit(record.circuit) || "1"}`;

      const newBay: Bay = {
        id: bayId,
        substationId: subId,
        rawName: record.bay,
        normalizedName: normalizeStationName(record.bay),
        remoteEndpointHint: normalizeStationName(hint.endpoint),
        circuit: normalizeCircuit(record.circuit) || record.circuit.replace("#", ""),
        kind: "line",
      };
      BAYS.push(newBay);
      bayMap.set(bayKey, newBay);

      TERMINALS.push({
        id: `term_${bayId}_bus`,
        bayId: bayId,
        busbarId: `bb_${subId}_a`,
        position: "bus-side",
      });
    } else {
      bayId = bayMap.get(bayKey)!.id;
    }

    if (record.relay && record.relay.make) {
      const relayId = `relay_${bayId}_${record.relay.model.replace(/\s+/g, "_").toLowerCase()}`;
      if (!RELAY_IEDS.find(r => r.id === relayId)) {
        RELAY_IEDS.push({
          id: relayId,
          bayId: bayId,
          make: record.relay.make,
          model: record.relay.model,
          serial: record.relay.serial || "",
          ctRatio: record.ctRatio,
          vtRatio: record.vtRatio,
          ct: parseCtRatio(record.ctRatio, record.id) ?? undefined,
          vt: parseVtRatio(record.vtRatio, record.id) ?? undefined,
          functionGroup: sourceFlag === "LCD" ? "LCD+DIST" : "OCR",
          confidence: "high",
        });

        const fns = sourceFlag === "LCD" ? ["LCD", "Distance", "Teleprotection"] : ["OCR", "GFR"];
        for (const fnLabel of fns) {
          const fnCls = classifyProtectionFunction(fnLabel);
          if (fnCls) {
            const pfId = `${relayId}_${fnCls.toLowerCase()}`;
            if (!PROTECTION_FUNCTIONS.find(pf => pf.id === pfId)) {
              PROTECTION_FUNCTIONS.push({
                id: pfId,
                relayIedId: relayId,
                function: fnCls,
              });
            }
          }
        }
      }
    }
  }

  // Only take circuit 1 for the simple corridor
  for (const r of lcdTarget) if (r.circuit === "#1") processRecord(r, "LCD");
  for (const r of ocrTarget) if (r.circuit === "#1") processRecord(r, "OCR");

  const RELATIONS: LineRelation[] = [];
  const processedBays = new Set<string>();

  for (const bay of BAYS) {
    if (processedBays.has(bay.id)) continue;

    const remoteSubstationNorm = bay.remoteEndpointHint;
    const remoteSubCandidates = SUBS.filter(s => looseTokenMatch(s.normalizedName, remoteSubstationNorm));

    const matchedBay = BAYS.find(
      b =>
        b.id !== bay.id &&
        remoteSubCandidates.some(rs => rs.id === b.substationId) &&
        b.circuit === bay.circuit &&
        looseTokenMatch(SUBS.find(s => s.id === bay.substationId)!.normalizedName, b.remoteEndpointHint)
    );

    if (matchedBay) {
      const relationId = `line_${bay.substationId}_${matchedBay.substationId}_${bay.circuit}`;
      const lcdRec = lcdTarget.find(
        r => r.substation === targetSubstations.find(ts => subIds.get(ts) === bay.substationId) && r.bay === bay.rawName
      );
      const lcdRecRemote = lcdTarget.find(
        r => r.substation === targetSubstations.find(ts => subIds.get(ts) === matchedBay.substationId) && r.bay === matchedBay.rawName
      );

      // Determine which protection functions actually apply to this line.
      // UGC + pilot wire schemes (e.g. Kebon Jeruk, Kembangan) do NOT use
      // distance — registry shows distance.z1PhPh as null, and engineer note
      // confirms LCD-only operation. Skip DIST in those cases.
      const hasDistanceData =
        (lcdRec && (lcdRec.distance.z1PhPh !== null || lcdRec.distance.z2PhPh !== null)) ||
        (lcdRecRemote && (lcdRecRemote.distance.z1PhPh !== null || lcdRecRemote.distance.z2PhPh !== null));
      const protectionFns: ("DIST" | "LCD" | "OCR" | "GFR")[] = hasDistanceData
        ? ["DIST", "LCD", "OCR", "GFR"]
        : ["LCD", "OCR", "GFR"];

      RELATIONS.push({
        id: relationId,
        fromBayId: bay.id,
        toBayId: matchedBay.id,
        fromSubstationId: bay.substationId,
        toSubstationId: matchedBay.substationId,
        circuit: bay.circuit,
        voltageKv: 150,
        lineXOhm: lcdRec?.distance?.lineImpedanceOhm ?? undefined,
        physicalLengthKm: undefined,
        protectionFunctionIds: protectionFns,
        sourceIds: ["generated_from_registry"],
        confidence: "high",
        status: "approved",
      });
      processedBays.add(bay.id);
      processedBays.add(matchedBay.id);
    }
  }

  return {
    caseId,
    substations: SUBS,
    busbars: BUSBARS,
    bays: BAYS,
    terminals: TERMINALS,
    lineRelations: RELATIONS,
    relayIeds: RELAY_IEDS,
    protectionFunctions: PROTECTION_FUNCTIONS,
  };
}
