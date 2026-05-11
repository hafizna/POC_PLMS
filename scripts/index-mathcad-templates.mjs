import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "src", "domain", "generated", "mathcad-template-registry.json");
const REPO_SOURCE_FOLDER = path.join(ROOT, "data", "template-setting");
const LEGACY_SOURCE_FOLDER = "C:\\Users\\hafizna.fadhli\\Downloads\\Template Setting";
const SOURCE_FOLDER = fs.existsSync(REPO_SOURCE_FOLDER) ? REPO_SOURCE_FOLDER : LEGACY_SOURCE_FOLDER;

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

function inferVendor(fileName) {
  const name = fileName.toLowerCase();
  if (/abb|rel670|red670/.test(name)) return "ABB";
  if (/micom|p54|p44|p14|alstom|schneider/.test(name)) return "MiCOM";
  if (/7sl|siemens/.test(name)) return "Siemens";
  if (/ge|d60|l90/.test(name)) return "GE";
  if (/pcs|nr/.test(name)) return "NR";
  if (/grz|toshiba/.test(name)) return "Toshiba";
  return "Unknown";
}

function inferRelayFamily(fileName) {
  const match = fileName.match(/(REL670|RED670|7SL87|P545|P543|P442|P443|P141|D60|L90|PCS931|GRZ100)/i);
  return match ? match[1].toUpperCase() : "Unknown";
}

function inferFunctionGroup(fileName) {
  const name = fileName.toLowerCase();
  const functions = [];
  if (/lcd|diff|differential|7sl/.test(name)) functions.push("LCD");
  if (/dist|distance|p44|p54|rel670|red670|d60|l90|pcs931|grz/.test(name)) functions.push("DIST");
  if (/ocr|gfr|overcurrent|ground/.test(name)) functions.push("OCR/GFR");
  return functions.length > 0 ? Array.from(new Set(functions)).join("+") : "UNKNOWN";
}

function inferTemplateId(functionGroup) {
  if (functionGroup.includes("LCD")) return "line-differential-lcd-150kv";
  if (functionGroup.includes("DIST")) return "distance-line-150kv";
  if (functionGroup.includes("OCR")) return "ocr-gfr-backup-150kv";
  return "distance-line-150kv";
}

function discoverSources() {
  return fs
    .readdirSync(SOURCE_FOLDER, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".xmcd"))
    .map((entry) => {
      const functionGroup = inferFunctionGroup(entry.name);
      return {
        id: `mathcad_${slug(path.basename(entry.name, ".xmcd"))}`,
        templateId: inferTemplateId(functionGroup),
        vendor: inferVendor(entry.name),
        relayFamily: inferRelayFamily(entry.name),
        functionGroup,
        filePath: path.join(SOURCE_FOLDER, entry.name),
      };
    })
    .sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\u03c0|\u00cf\u20ac/g, "pi")
    .replace(/\u03b8|\u00ce\u00b8/g, "theta")
    .replace(/\u03a9|\u00ce\u00a9/g, "ohm")
    .replace(/\u00b5|\u00ce\u00bc/g, "u")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  return match ? decodeXml(match[1] ?? "") : "";
}

function extractTextLines(xml) {
  const lines = [];
  const textBlocks = xml.match(/<text\b[\s\S]*?<\/text>/g) ?? [];
  for (const block of textBlocks) {
    const prepared = block
      .replace(/<sp count="(\d+)"\s*\/>/g, " ")
      .replace(/<tab\s*\/>/g, " ")
      .replace(/<\/p>/g, "\n");
    const plain = decodeXml(prepared.replace(/<[^>]+>/g, " "));
    for (const line of plain.split(/\n| {2,}/)) {
      const clean = decodeXml(line);
      if (clean.length >= 3 && !lines.includes(clean)) lines.push(clean);
    }
  }
  return lines.slice(0, 80);
}

function extractVariableCandidates(xml) {
  const candidates = [];
  const seen = new Set();
  const regex = /<ml:id\b[^>]*?(?:subscript="([^"]+)")?[^>]*>([^<]+)<\/ml:id>[\s\S]{0,600}?<ml:real\b[^>]*>([-+]?\d+(?:\.\d+)?(?:E[-+]?\d+)?)<\/ml:real>/gi;
  let match;
  while ((match = regex.exec(xml)) && candidates.length < 80) {
    const subscript = match[1] ? decodeXml(match[1]) : "";
    const name = decodeXml(match[2]);
    const value = Number(match[3]);
    if (!name || !Number.isFinite(value)) continue;
    const label = subscript ? `${name}_${subscript}` : name;
    const key = `${label}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const after = xml.slice(match.index, match.index + 900);
    const unit =
      after.includes(">km<") ? "km" :
      after.includes(">\u03a9<") || after.includes(">\u00ce\u00a9<") ? "ohm" :
      after.includes(">A<") ? "A" :
      after.includes(">V<") ? "V" :
      undefined;
    candidates.push({ name: label, value, ...(unit ? { unit } : {}) });
  }
  return candidates;
}

function inferKeywords(textLines, variableCandidates) {
  const corpus = `${textLines.join(" ")} ${variableCandidates.map((v) => v.name).join(" ")}`.toLowerCase();
  const keywords = [];
  const rules = [
    ["distance", /jarak|distance|dist|z1|z2|z3/],
    ["line-impedance", /impedansi|impedance|r11|x11|ohm/i],
    ["ct-vt", /ct|vt|pt|ratio|trafo arus|trafo tegangan/],
    ["short-circuit", /hubung singkat|short circuit|iccc|fault|mva/],
    ["coverage", /zone|zona|jangkauan|reach/],
  ];
  for (const [key, regex] of rules) {
    if (regex.test(corpus)) keywords.push(key);
  }
  return keywords;
}

function summarize(source) {
  const xml = fs.readFileSync(source.filePath, "utf8");
  const textLines = extractTextLines(xml);
  const variableCandidates = extractVariableCandidates(xml);
  const hash = crypto.createHash("sha256").update(xml).digest("hex").slice(0, 16);
  return {
    id: source.id,
    templateId: source.templateId,
    vendor: source.vendor,
    relayFamily: source.relayFamily,
    functionGroup: source.functionGroup,
    fileName: path.basename(source.filePath),
    fullPath: path.relative(ROOT, source.filePath) || source.filePath,
    fileSizeBytes: fs.statSync(source.filePath).size,
    sha256Prefix: hash,
    generator: firstMatch(xml, /<generator>([\s\S]*?)<\/generator>/),
    author: firstMatch(xml, /<author>([\s\S]*?)<\/author>/),
    revisedBy: firstMatch(xml, /<revisedBy>([\s\S]*?)<\/revisedBy>/),
    revision: firstMatch(xml, /<revision>([\s\S]*?)<\/revision>/),
    documentId: firstMatch(xml, /<documentID>([\s\S]*?)<\/documentID>/),
    textPreview: textLines.slice(0, 18),
    variableCandidates: variableCandidates.slice(0, 40),
    keywords: inferKeywords(textLines, variableCandidates),
    extractionStatus: "indexed_xml_preview",
    note:
      "XMCD is indexed as benchmark artifact. PLMS does not execute Mathcad equations yet; use this as formula/reference source for template parity review.",
  };
}

const artifacts = discoverSources().map(summarize);
const registry = {
  generatedAt: new Date().toISOString(),
  sourceFolder: path.relative(ROOT, SOURCE_FOLDER) || SOURCE_FOLDER,
  summary: {
    totalArtifacts: artifacts.length,
    byVendor: artifacts.reduce((acc, item) => {
      acc[item.vendor] = (acc[item.vendor] ?? 0) + 1;
      return acc;
    }, {}),
    byTemplateId: artifacts.reduce((acc, item) => {
      acc[item.templateId] = (acc[item.templateId] ?? 0) + 1;
      return acc;
    }, {}),
  },
  artifacts,
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Indexed ${artifacts.length} Mathcad XMCD artifact(s) -> ${path.relative(ROOT, OUTPUT)}`);
