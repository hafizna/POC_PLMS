import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const DEFAULT_ROOTS = [
  "C:\\Users\\hafizna.fadhli\\Downloads\\ULTG DURIKOSAMBI-20230215T100950Z-001",
  "C:\\Users\\hafizna.fadhli\\Downloads",
];
const OUTPUT = path.resolve("src/domain/generated/pdf-source-registry.json");
const KNOWN_STATIONS = [
  "DURIKOSAMBI",
  "DAAN MOGOT",
  "PANTAI INDAH KAPUK",
  "MUARAKARANG BARU",
  "MUARAKARANG LAMA",
  "MUARAKARANG",
  "KEMBANGAN",
  "KEMBANGAN II",
  "GROGOL BARU",
  "GROGOL",
  "KEBON JERUK",
  "CENGKARENG",
  "ANGKE",
  "DADAP",
  "TOMANG",
  "ULUJAMI",
  "NEW SENAYAN",
  "KARET LAMA",
  "ANCOL",
  "KETAPANG",
  "LONTAR",
  "TELUK NAGA",
  "PETUKANGAN",
  "LMK",
];

const roots = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_ROOTS;
const pdfPaths = unique(
  roots
    .filter((root) => fs.existsSync(root))
    .flatMap((root) => collectPdfFiles(root))
    .filter(shouldIncludePdf)
);

const records = [];
for (const filePath of pdfPaths) {
  records.push(await inspectPdf(filePath));
}

const output = {
  summary: {
    generatedAt: new Date().toISOString(),
    roots,
    fileCount: records.length,
    byDocumentType: countBy(records, (record) => record.documentType),
    byExtractionStatus: countBy(records, (record) => record.extractionStatus),
  },
  records,
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);

console.log(`Indexed ${records.length} PDF source files`);
console.log(`Output: ${OUTPUT}`);

function collectPdfFiles(root) {
  const stat = fs.statSync(root);
  if (stat.isFile()) return root.toLowerCase().endsWith(".pdf") ? [root] : [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...collectPdfFiles(fullPath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) out.push(fullPath);
  }
  return out;
}

function shouldIncludePdf(filePath) {
  const name = path.basename(filePath).toLowerCase();
  const full = filePath.toLowerCase();
  if (full.includes("ultg durikosambi")) return true;
  return (
    name.includes("tap setting") ||
    name.includes("official") ||
    name.includes("daftar setelan") ||
    name.includes("lcd") ||
    name.includes("dist") ||
    name.includes("ocr") ||
    name.includes("sutt") ||
    name.includes("ugc")
  );
}

async function inspectPdf(filePath) {
  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const stationFolder = findStationFolder(filePath);
  const localStationHint = cleanStationFolder(stationFolder);
  const documentType = classifyDocumentType(fileName, filePath);
  let pageCount = null;
  let text = "";
  let extractionStatus = "metadata_only";
  let extractionError = "";

  try {
    const parser = new PDFParse({ data: fs.readFileSync(filePath) });
    const result = await parser.getText();
    await parser.destroy();
    pageCount = result.total ?? null;
    text = cleanText(result.text ?? "");
    extractionStatus = text.length >= 100 ? "text_layer" : "scanned_needs_ocr";
  } catch (error) {
    extractionStatus = "failed";
    extractionError = error instanceof Error ? error.message : String(error);
  }

  const hints = inferHints(fileName, text);
  const endpointCandidates = inferEndpointCandidates({
    documentType,
    text,
    fileName,
    stationFolder,
    localStationHint,
  });
  return {
    id: slug(filePath),
    fileName,
    fullPath: filePath,
    stationFolder,
    localStationHint,
    documentType,
    extractionStatus,
    extractionError,
    pageCount,
    sizeBytes: stat.size,
    lastModified: stat.mtime.toISOString(),
    stationHints: hints.stationHints,
    bayHints: hints.bayHints,
    relayHints: hints.relayHints,
    functionHints: hints.functionHints,
    endpointCandidates,
    textCharCount: text.length,
    textPreview: text.slice(0, 1200),
  };
}

function classifyDocumentType(fileName, filePath) {
  const haystack = `${fileName} ${filePath}`.toLowerCase();
  if (haystack.includes("single line")) return "sld";
  if (haystack.includes("validasi ct")) return "validation_ct";
  if (haystack.includes("validasi pms")) return "validation_pms";
  if (haystack.includes("validasi pmt")) return "validation_pmt";
  if (
    haystack.includes("tap setting") ||
    haystack.includes("official") ||
    haystack.includes("daftar setelan") ||
    haystack.includes("lcd") ||
    haystack.includes("dist") ||
    haystack.includes("ocr")
  ) {
    return "tap_setting";
  }
  return "supporting_pdf";
}

function inferHints(fileName, text) {
  const haystack = `${fileName} ${text}`.toUpperCase();
  return {
    stationHints: unique(matchKnown(haystack, KNOWN_STATIONS)),
    bayHints: unique(extractMatches(haystack, /PHT\s*150\s*KV\s+[A-Z0-9\s]+#?\d*/g).slice(0, 20)),
    relayHints: unique(matchKnown(haystack, [
      "P545",
      "P543",
      "P443",
      "P142",
      "P122",
      "RED670",
      "REF615",
      "7SJ63",
      "7SJ82",
      "7SL87",
      "PCS9611",
      "PCS931",
    ])),
    functionHints: unique(matchKnown(haystack, [
      "LCD",
      "DIST",
      "DISTANCE",
      "OCR",
      "GFR",
      "AR",
      "SYNC",
      "SYNCHRO",
      "CBF",
      "DEF",
    ])),
  };
}

function inferEndpointCandidates({
  documentType,
  text,
  fileName,
  stationFolder,
  localStationHint,
}) {
  if (documentType !== "sld" || !text || !localStationHint) return [];
  const haystack = text.toUpperCase();
  const localNormalized = normalizeName(localStationHint);
  return unique(matchKnown(haystack, KNOWN_STATIONS))
    .filter((station) => normalizeName(station) !== localNormalized)
    .map((remoteStation) => {
      const snippet = snippetAround(haystack, remoteStation);
      return {
        id: slug(`${stationFolder}_${remoteStation}_${fileName}`),
        localStation: localStationHint,
        remoteStation,
        source: "sld_text_layer",
        confidence: inferEndpointConfidence(localStationHint, remoteStation, snippet),
        evidence: snippet,
      };
    });
}

function inferEndpointConfidence(localStation, remoteStation, snippet) {
  const normalizedRemote = normalizeName(remoteStation);
  const normalizedLocal = normalizeName(localStation);
  if (normalizedRemote === "durikosambi" && normalizedLocal !== "durikosambi") {
    return "low";
  }
  if (/\b(SUTT|SKTT|UGC|OHL|LINE|PHT|ACSR|TACSR|GTACSR|XLPE)\b/i.test(snippet)) {
    return "high";
  }
  return "medium";
}

function snippetAround(haystack, needle) {
  const idx = haystack.indexOf(needle);
  if (idx < 0) return "";
  return haystack
    .slice(Math.max(0, idx - 80), idx + needle.length + 120)
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value) {
  return value
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchKnown(haystack, values) {
  return values.filter((value) => haystack.includes(value));
}

function extractMatches(haystack, regex) {
  return Array.from(haystack.matchAll(regex)).map((match) => match[0].replace(/\s+/g, " ").trim());
}

function countBy(items, selector) {
  return items.reduce((acc, item) => {
    const key = selector(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function unique(items) {
  if (items.length === 0 || typeof items[0] !== "object") {
    return Array.from(new Set(items));
  }
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/^[a-z]:/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findStationFolder(filePath) {
  const parts = filePath.split(/[\\/]+/);
  return parts.find((part) => /^(GI|GIS|GISTET)\s+/i.test(part)) ?? "";
}

function cleanStationFolder(value) {
  return value.replace(/^(GI|GIS|GISTET)\s+/i, "").trim();
}

function normalizeName(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b(?:gi|gis|gistet|gitet|150kv|500kv)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
