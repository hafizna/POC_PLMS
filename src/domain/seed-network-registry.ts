import type { LifecycleStatus } from "./unified";
import {
  NETWORK_GRAPH_NODES,
  NETWORK_GRAPH_LINES,
  NETWORK_GRAPH_RELAY_ASSETS,
} from "./network-graph";

export type RegistryConfidence = "high" | "medium" | "low" | "missing";

export type SourceKind = "SLD" | "Registry Excel" | "TAP PDF" | "Actual Setting File" | "Screening Excel";

export type RegistrySource = {
  id: string;
  kind: SourceKind;
  name: string;
  scope: string;
  status: "indexed" | "rendered" | "parsed" | "needs extraction";
  confidence: RegistryConfidence;
};

export type NetworkNode = {
  id: string;
  name: string;
  shortCode: string;
  type: "GI" | "GIS" | "GISTET";
  voltageKv: number;
  sldSourceId?: string;
};

export type NetworkLine = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  circuit: string;
  fromBay: string;
  toBay: string;
  ctRatio?: string;
  vtRatio?: string;
  relayMain?: string;
  protectionFunctions: string[];
  r1Ohm?: number;
  x1Ohm?: number;
  r0Ohm?: number;
  x0Ohm?: number;
  currentRatingKa?: number;
  lineXOhm?: number;
  physicalLengthKm?: number;
  sourceIds: string[];
  lifecycleStatus?: LifecycleStatus;
  completeness: number;
  confidence: RegistryConfidence;
  notes?: string;
};

export type RelayAsset = {
  id: string;
  nodeId: string;
  bay: string;
  circuit: string;
  make: string;
  model: string;
  serial?: string;
  functionGroup: string;
  ctRatio?: string;
  vtRatio?: string;
  tapDocument?: string;
  actualSource?: string;
  confidence: RegistryConfidence;
};

export type NetworkCase = {
  id: string;
  title: string;
  description: string;
  scope: "corridor" | "inventory";
  readiness: number;
  nodes: NetworkNode[];
  lines: NetworkLine[];
  relays: RelayAsset[];
  sourceIds: string[];
  notes: string[];
  gaps: DataGap[];
};

export type DataGap = {
  id: string;
  severity: "blocker" | "warning" | "info";
  area: "SLD" | "Topology" | "Line Data" | "Relay Setting" | "Actual Setting" | "Protection Function";
  title: string;
  detail: string;
  nextAction: string;
};

export const REGISTRY_SOURCES: RegistrySource[] = [
  {
    id: "src_sld_folder",
    kind: "SLD",
    name: "ULTG DURIKOSAMBI-20230215T100950Z-001",
    scope: "17 GI/GIS folders, 24 PDF, 18 VSD, 1 XLSX",
    status: "indexed",
    confidence: "medium",
  },
  {
    id: "src_data_setting",
    kind: "Registry Excel",
    name: "Data Setting Penghantar UPT DKSBI.xlsx",
    scope: "LCD+DIST, OCR, AR, Synchro, CBF, differential registry",
    status: "parsed",
    confidence: "high",
  },
  {
    id: "src_official_list",
    kind: "Registry Excel",
    name: "List Official Setting & Resetting UPT Durikosambi.xlsx",
    scope: "Official TAP history and release log",
    status: "parsed",
    confidence: "high",
  },
  {
    id: "src_dks_dm_pdf",
    kind: "TAP PDF",
    name: "official tap setting proteksi sutt durikosambi - daan mogot 1_rev01.pdf",
    scope: "DKS - DM line differential and distance setting",
    status: "rendered",
    confidence: "high",
  },
  {
    id: "src_pik_mkb_pdf",
    kind: "TAP PDF",
    name: "official tap setting UGC OHL GIS PIK - Muarakarang baru 1,2_LCD_DIST_AR_SYNC-P545_OCR-7SJ63_rev01.pdf",
    scope: "PIK - MKB line differential, distance, AR, sync, OCR",
    status: "rendered",
    confidence: "high",
  },
  {
    id: "src_p545_set",
    kind: "Actual Setting File",
    name: "000.set",
    scope: "MiCOM P545 S1 Agile binary setting export",
    status: "needs extraction",
    confidence: "medium",
  },
  {
    id: "src_pik_dm_screening",
    kind: "Screening Excel",
    name: "01. PIK_DAAN MOGOT_1.xlsx",
    scope: "PIK - Daan Mogot #1 TAP vs actual comparison",
    status: "parsed",
    confidence: "high",
  },
];

// Corridor topology data is derived from the network graph single source of truth
// in src/domain/network-graph.ts. To change a node, bay, line, or IED for the
// corridor case, edit the seeds there.
export const NETWORK_NODES: NetworkNode[] = NETWORK_GRAPH_NODES;

export const NETWORK_LINES: NetworkLine[] = NETWORK_GRAPH_LINES;

export const RELAY_ASSETS: RelayAsset[] = NETWORK_GRAPH_RELAY_ASSETS;

export const ULTG_INVENTORY_NODES: NetworkNode[] = [
  // shortCode values below are cross-checked against the real DIgSILENT line
  // database (crosscheck-workbook-registry.json's digsilentLineDb — the same
  // source graph-builder.ts anchors against), not hand-guessed abbreviations.
  // ANGKE/DKSBI/KBJRK corrected 2026-07-31 after user flagged "ANG" (a
  // buildShortCode() 3-letter fallback, wrong — DIgSILENT spells this
  // station's name out in full as "ANGKE", it isn't abbreviated there at
  // all) surfacing in CalculationView; the same check found "DKS"/"KBJ" were
  // close-but-not-exact vs the codes DIgSILENT lines actually reference
  // (10-11 occurrences each, no close runner-up — not ambiguous).
  { id: "angke", name: "Angke", shortCode: "ANGKE", type: "GI", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "dadap", name: "Dadap", shortCode: "DDP", type: "GI", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "durikosambi", name: "Durikosambi", shortCode: "DKSBI", type: "GI", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "muarakarang", name: "Muarakarang", shortCode: "MKR", type: "GI", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "muarakarang_baru_gi", name: "Muarakarang Baru", shortCode: "MKB", type: "GI", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "daan_mogot", name: "Daan Mogot", shortCode: "DM", type: "GIS", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "grogol", name: "Grogol", shortCode: "GRG", type: "GIS", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "grogol_baru", name: "Grogol Baru", shortCode: "GRB", type: "GIS", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "kebon_jeruk", name: "Kebon Jeruk", shortCode: "KBJRK", type: "GIS", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "kembangan", name: "Kembangan", shortCode: "KMB", type: "GIS", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "muarakarang_baru_gis", name: "Muarakarang Baru", shortCode: "MKB-GIS", type: "GIS", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "new_senayan", name: "New Senayan", shortCode: "NSY", type: "GIS", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "pantai_indah_kapuk", name: "Pantai Indah Kapuk", shortCode: "PIK", type: "GIS", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "tomang", name: "Tomang", shortCode: "TMG", type: "GIS", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "ulujami", name: "Ulujami", shortCode: "ULJ", type: "GIS", voltageKv: 150, sldSourceId: "src_sld_folder" },
  { id: "gistet_durikosambi", name: "Durikosambi", shortCode: "GDKS", type: "GISTET", voltageKv: 500, sldSourceId: "src_sld_folder" },
  { id: "gistet_kembangan", name: "Kembangan", shortCode: "GKMB", type: "GISTET", voltageKv: 500, sldSourceId: "src_sld_folder" },
];

export const NETWORK_CASES: NetworkCase[] = [
  {
    id: "case_dks_dm_pik_mkb",
    title: "DKS - DM - PIK - MKB",
    description:
      "Mini corridor model dari attachment saat ini untuk distance/LCD setting penghantar 150 kV.",
    scope: "corridor",
    readiness: 82,
    nodes: NETWORK_NODES,
    lines: NETWORK_LINES,
    relays: RELAY_ASSETS,
    sourceIds: [
      "src_sld_folder",
      "src_data_setting",
      "src_dks_dm_pdf",
      "src_pik_mkb_pdf",
      "src_pik_dm_screening",
      "src_p545_set",
    ],
    notes: [
      "Sudah cukup untuk impedance-based corridor analysis.",
      "Physical line length belum lengkap untuk semua segment.",
      "MKB reverse-side TAP PDF belum tersedia, tetapi registry Excel punya setting reverse-side.",
    ],
    gaps: [
      {
        id: "gap_physical_length_dm_pik",
        severity: "warning",
        area: "Line Data",
        title: "Physical length DM - PIK belum terkonfirmasi",
        detail:
          "Registry memberi line impedance, tetapi panjang fisik belum tervalidasi dari SLD/PST.",
        nextAction:
          "Ambil panjang line dari SLD, PST, atau dokumen TAP DM-PIK jika tersedia.",
      },
      {
        id: "gap_mkb_reverse_pdf",
        severity: "warning",
        area: "Relay Setting",
        title: "PDF TAP sisi MKB - PIK belum tersedia",
        detail:
          "Reverse-side MKB setting tersedia di registry Excel, tetapi source PDF official belum dilampirkan.",
        nextAction:
          "Lampirkan PDF official Muarakarang Baru bay PIK 1,2 atau tandai registry Excel sebagai source sementara.",
      },
      {
        id: "gap_p545_set_parser",
        severity: "info",
        area: "Actual Setting",
        title: "Parser MiCOM P545 .set belum dibuat",
        detail:
          "000.set terbaca sebagai binary export MiCOM S1 Agile, bukan file teks tabel biasa.",
        nextAction:
          "Buat extractor vendor-specific untuk mengambil parameter prioritas seperti CT/VT, distance, teleprotection, AR, dan sync.",
      },
      {
        id: "gap_non_distance_functions",
        severity: "info",
        area: "Protection Function",
        title: "AR, Sync, OCR, dan differential belum menjadi engine analisis",
        detail:
          "Data fungsinya mulai ada di PDF/Excel, tetapi app baru menganalisis distance coverage.",
        nextAction:
          "Pilih satu fungsi berikutnya untuk dinormalisasi, disarankan OCR/GFR karena ada screening dan registry.",
      },
    ],
  },
  {
    id: "case_ultg_dks_inventory",
    title: "ULTG Durikosambi Inventory",
    description:
      "Inventory awal dari folder SLD ULTG Durikosambi. Node sudah terindeks, topology antar GI belum diekstrak.",
    scope: "inventory",
    readiness: 36,
    nodes: ULTG_INVENTORY_NODES,
    lines: [],
    relays: [],
    sourceIds: ["src_sld_folder", "src_data_setting", "src_official_list"],
    notes: [
      "17 folder GI/GIS/GISTET sudah terindeks dari struktur SLD.",
      "Belum ada edge network hasil parsing SLD/VSD.",
      "Cocok sebagai awal library level ULTG sebelum ekstraksi topology dilakukan.",
    ],
    gaps: [
      {
        id: "gap_sld_parse",
        severity: "blocker",
        area: "SLD",
        title: "SLD belum diekstrak menjadi node-edge",
        detail:
          "Folder SLD sudah terindeks, tetapi isi PDF/VSD belum diparse menjadi bay, busbar, line, dan terminal.",
        nextAction:
          "Pilih 1-2 GI prioritas untuk ekstraksi manual/visual terlebih dahulu sebelum membuat parser massal.",
      },
      {
        id: "gap_topology_edges",
        severity: "blocker",
        area: "Topology",
        title: "Relasi antar GI belum tersedia untuk inventory penuh",
        detail:
          "Inventory baru berisi node GI/GIS, belum tahu line mana menghubungkan node mana.",
        nextAction:
          "Gunakan sheet LCD+DIST dan nama bay PHT sebagai kandidat edge awal, lalu validasi dengan SLD.",
      },
      {
        id: "gap_relay_assets_inventory",
        severity: "warning",
        area: "Relay Setting",
        title: "Relay asset belum dinormalisasi untuk seluruh ULTG",
        detail:
          "Excel memiliki banyak sheet fungsi proteksi, tetapi belum diubah ke struktur RelayAsset lintas GI.",
        nextAction:
          "Mulai dari sheet LCD+DIST dan OCR karena keduanya paling relevan untuk penghantar 150 kV.",
      },
      {
        id: "gap_source_confidence",
        severity: "info",
        area: "Line Data",
        title: "Confidence per data field belum granular",
        detail:
          "Saat ini confidence masih level source/case, belum level field seperti CT, PT, panjang, impedance, dan serial relay.",
        nextAction:
          "Tambahkan data-quality flag per field setelah format normalized registry stabil.",
      },
    ],
  },
];
