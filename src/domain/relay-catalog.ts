import catalogJson from "./generated/relay-catalog.json";

export type DigsilentMatchStatus =
  | "matched"
  | "candidate"
  | "unmatched"
  | "not-applicable";

export type RelayCatalogAsset = {
  assetId: string;
  ultg: string;
  stationRaw: string;
  stationNormalized: string;
  bayRaw: string;
  bayNormalized: string;
  circuit: string | null;
  bayKind:
    | "line"
    | "bus-coupler"
    | "busbar"
    | "breaker-system"
    | "transformer"
    | "capacitor"
    | "other";
  brand: string;
  brandRaw: string;
  model: string;
  modelRaw: string;
  serial: string | null;
  technology: string | null;
  operationYear: number | null;
  roles: string[];
  functions: string[];
  sourceRefs: Array<{ sheet: string; row: number }>;
  digsilentMatch: {
    status: DigsilentMatchStatus;
    confidence: number;
    matchedRow?: number;
    matchedName?: string;
    candidates: Array<{
      row: number;
      name: string;
      score: number;
      reasons: string[];
    }>;
    reason: string;
  };
};

export type RelayModelCatalogEntry = {
  brand: string;
  model: string;
  assetCount: number;
  stationCount: number;
  bayKinds: string[];
  functions: string[];
  technologies: string[];
  operationYears: number[];
};

export type RelayManualReference = {
  id: string;
  modelPattern: RegExp;
  title: string;
  documentReference: string;
  vendor: string;
  url: string;
  matchLevel: "exact-family" | "device-family" | "product-guide";
  note: string;
};

type RelayCatalog = {
  schema: "plms.relay-catalog.v1";
  summary: {
    sourceWorkbook: string;
    sourceLastModified: string;
    sourceSheets: string[];
    occurrenceCount: number;
    assetCount: number;
    modelCount: number;
    ultgCount: number;
    stationCount: number;
    withSerialCount: number;
    digsilentMatchedCount: number;
    digsilentCandidateCount: number;
  };
  modelCatalog: RelayModelCatalogEntry[];
  assets: RelayCatalogAsset[];
};

export const RELAY_CATALOG = catalogJson as RelayCatalog;

export const RELAY_MANUAL_LIBRARY: RelayManualReference[] = [
  {
    id: "manual-micom-p54x",
    modelPattern: /^MiCOM P54[3456]$/i,
    title: "MiCOM Agile P543/P545 Technical Manual",
    documentReference: "P54x1Z-TM-EN-2.3",
    vendor: "GE Vernova Grid Solutions",
    url: "https://www.gevernova.com/grid-solutions/sites/default/files/2026-02/P54x1Z-TM-EN-2.3-GEV.pdf",
    matchLevel: "device-family",
    note:
      "P543/P545 family manual. Firmware/model code pada nameplate tetap harus diverifikasi.",
  },
  {
    id: "manual-micom-p14x",
    modelPattern: /^MiCOM P14[1-5D]$/i,
    title: "MiCOM P14x Manual",
    documentReference: "26003356",
    vendor: "Schneider Electric",
    url: "https://www.se.com/us/en/download/document/26003356/",
    matchLevel: "device-family",
    note:
      "Family manual P141–P145. Cocokkan software version sebelum mapping setting.",
  },
  {
    id: "manual-siprotec-87",
    modelPattern: /^7(?:SA|SD|SL|VK)87$/i,
    title: "SIPROTEC 5 7SA/7SD/7SL/7VK87 Manual",
    documentReference: "C53000-G5040-C011-L",
    vendor: "Siemens",
    url: "https://cache.industry.siemens.com/dl/files/440/109742440/att_1136011/v1/SIP5_7SA-SD-SL-VK-87_V09.50_Manual_C011-L_en.pdf?download=true",
    matchLevel: "exact-family",
    note:
      "Manual V9.50; device firmware di aset harus dipakai untuk memilih edition final.",
  },
  {
    id: "manual-siprotec-7sj82",
    modelPattern: /^7SJ8[25]$/i,
    title: "SIPROTEC 5 7SJ82/7SJ85 Manual",
    documentReference: "C53000-G5040-C017-H",
    vendor: "Siemens",
    url: "https://cache.industry.siemens.com/dl/files/384/109742384/att_1113120/v1/SIP5_7SJ82-85_V09.30_Manual_C017-H_en.pdf?download=true",
    matchLevel: "exact-family",
    note:
      "Manual V9.30. Konfigurasi function points tetap bergantung pada order code.",
  },
  {
    id: "manual-nr-pcs931",
    modelPattern: /^PCS-931S?$/i,
    title: "PCS-931 Line Differential Relay Product Guide",
    documentReference: "PCS-931 product documentation",
    vendor: "NR Electric",
    url: "https://www.nrec.com/en/web/upload/2019/05/08/15572769074495czyjk.pdf",
    matchLevel: "product-guide",
    note:
      "Product documentation awal; instruction/setting manual revision masih perlu dikumpulkan.",
  },
  {
    id: "manual-micom-p821",
    modelPattern: /^MiCOM P821$/i,
    title: "MiCOM P821 Breaker Failure Protection Manual",
    documentReference: "P821/EN T/J31",
    vendor: "Schneider Electric",
    url: "https://www.se.com/in/en/download/document/P821_EN_T_J31/",
    matchLevel: "exact-family",
    note: "Manual global file untuk software version 10.E.",
  },
  {
    id: "manual-micom-p841",
    modelPattern: /^MiCOM P841$/i,
    title: "MiCOM P841 official resource center",
    documentReference: "P841 resources",
    vendor: "GE Vernova Grid Solutions",
    url: "https://www.gevernova.com/grid-solutions/resources?prod=p841&type=3",
    matchLevel: "product-guide",
    note:
      "Resource center resmi; edition technical manual harus dipilih dari software version aset.",
  },
];

export function manualForRelayModel(model: string) {
  return RELAY_MANUAL_LIBRARY.find((manual) => manual.modelPattern.test(model));
}

export function parserReadinessForModel(model: string) {
  if (/^MiCOM P(?:443|545)$/i.test(model)) {
    return {
      status: "validated" as const,
      label: "Courier parser validated",
      detail: "Diuji dengan file .set aktual pada model ini.",
    };
  }
  if (/^MiCOM P(?:442|543|544|546)$/i.test(model)) {
    return {
      status: "candidate" as const,
      label: "Courier family candidate",
      detail: "Struktur family serupa; memerlukan sampel .set model ini.",
    };
  }
  return {
    status: "not-started" as const,
    label: "Adapter belum tersedia",
    detail: "Inventaris aset tersedia, tetapi format export belum diprofilkan.",
  };
}

export function assetsForModel(brand: string, model: string) {
  return RELAY_CATALOG.assets.filter(
    (asset) => asset.brand === brand && asset.model === model
  );
}
