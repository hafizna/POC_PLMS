import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "src", "domain", "generated", "mathcad-template-registry.json");

const SOURCES = [
  {
    id: "mathcad_abb_rel670_distance",
    templateId: "distance-line-150kv",
    vendor: "ABB",
    relayFamily: "REL670",
    functionGroup: "DIST",
    filePath: "C:\\Users\\hafizna.fadhli\\Downloads\\Template Setting\\MathCAD ABB REL670 Distance.xmcd",
  },
  {
    id: "mathcad_micom_p545_distance",
    templateId: "distance-line-150kv",
    vendor: "MiCOM",
    relayFamily: "P545",
    functionGroup: "DIST",
    filePath: "C:\\Users\\hafizna.fadhli\\Downloads\\Template Setting\\Tap Setting MiCom P545 GI Ciledug Bay Alam Sutera #1.xmcd",
  },
];

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
    fullPath: source.filePath,
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

const artifacts = SOURCES.map(summarize);
const registry = {
  generatedAt: new Date().toISOString(),
  sourceFolder: "C:\\Users\\hafizna.fadhli\\Downloads\\Template Setting",
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
