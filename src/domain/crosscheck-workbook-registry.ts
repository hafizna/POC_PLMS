import registry from "./generated/crosscheck-workbook-registry.json";

export type CrosscheckLineRecord = {
  row: number;
  name: string;
  type: string;
  fromSubstation: string;
  fromTerminal: string;
  toSubstation: string;
  toTerminal: string;
  outOfService: boolean;
  lengthKm: number | null;
  currentRatingKa: number | null;
  z1Ohm: number | null;
  angleDeg: number | null;
  r1Ohm: number | null;
  x1Ohm: number | null;
  r0Ohm: number | null;
  x0Ohm: number | null;
  k0: number | null;
  phiK0Deg: number | null;
};

export type CrosscheckFaultRecord = {
  row: number;
  key: string;
  bus: string;
  substation: string;
  area: string;
  voltageKv: number | null;
  r1Pu: number | null;
  x1Pu: number | null;
  r2Pu: number | null;
  x2Pu: number | null;
  r0Pu: number | null;
  x0Pu: number | null;
  fault1phKa: number | null;
  fault3phKa: number | null;
  kitFault1phKa: number | null;
  kitFault3phKa: number | null;
};

export type CrosscheckWorkbookRegistry = {
  generatedAt: string;
  sourceWorkbook: string;
  fileName: string;
  fileSizeBytes: number;
  sha256Prefix: string;
  summary: {
    sheetCount: number;
    lineRecordCount: number;
    faultRecordCount: number;
    formulaCount: number;
  };
  sheets: Array<{ name: string; ref: string; nonEmpty: number; formulas: number }>;
  digsilentLineDb: {
    sourceSheet: string;
    updateInstruction: string;
    records: CrosscheckLineRecord[];
  };
  faultLevelDb: {
    sourceSheet: string;
    title: string;
    records: CrosscheckFaultRecord[];
  };
  legacyCases: {
    distance: Record<string, unknown>;
    ocrGfr: Record<string, unknown>;
  };
  interpretation: {
    purpose: string;
    plmsMapping: string[];
  };
};

export const CROSSCHECK_WORKBOOK_REGISTRY = registry as CrosscheckWorkbookRegistry;

export function findCrosscheckLinesBySubstation(substation: string) {
  const key = substation.toUpperCase();
  return CROSSCHECK_WORKBOOK_REGISTRY.digsilentLineDb.records.filter(
    (line) =>
      line.fromSubstation.toUpperCase().includes(key) ||
      line.toSubstation.toUpperCase().includes(key)
  );
}

export function findFaultLevelsBySubstation(substation: string) {
  const key = substation.toUpperCase();
  return CROSSCHECK_WORKBOOK_REGISTRY.faultLevelDb.records.filter((record) =>
    record.substation.toUpperCase().includes(key)
  );
}
