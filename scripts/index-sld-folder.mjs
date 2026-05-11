import fs from "node:fs";
import path from "node:path";

const DEFAULT_INPUT =
  "C:\\Users\\hafizna.fadhli\\Downloads\\ULTG DURIKOSAMBI-20230215T100950Z-001";
const OUTPUT = path.resolve("src/domain/generated/sld-source-index.json");

const inputRoot = process.argv[2] || DEFAULT_INPUT;

if (!fs.existsSync(inputRoot)) {
  console.error(`Input folder not found: ${inputRoot}`);
  process.exit(1);
}

const files = collectFiles(inputRoot)
  .map((filePath) => toRecord(inputRoot, filePath))
  .sort((a, b) =>
    `${a.stationFolder} ${a.fileName}`.localeCompare(
      `${b.stationFolder} ${b.fileName}`
    )
  );

const byExtension = countBy(files, (record) => record.extension || "(none)");
const byKind = countBy(files, (record) => record.kind);
const stationFolders = Array.from(
  new Set(files.map((record) => record.stationFolder).filter(Boolean))
).sort();

const output = {
  summary: {
    generatedAt: new Date().toISOString(),
    inputRoot,
    fileCount: files.length,
    stationCount: stationFolders.length,
    byExtension,
    byKind,
  },
  stationFolders,
  files,
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);

console.log(`Indexed ${files.length} SLD/source files from ${stationFolders.length} station folders`);
console.log(`Output: ${OUTPUT}`);

function collectFiles(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      out.push(fullPath);
    }
  }
  return out;
}

function toRecord(root, filePath) {
  const relativePath = path.relative(root, filePath);
  const parts = relativePath.split(path.sep);
  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  return {
    id: slug(`${parts[1] || "root"} ${fileName}`),
    relativePath,
    ultgFolder: parts[0] || "",
    stationFolder: parts[1] || "",
    fileName,
    extension: path.extname(fileName).toLowerCase(),
    kind: classifyKind(fileName),
    sizeBytes: stat.size,
    lastModified: stat.mtime.toISOString(),
  };
}

function classifyKind(fileName) {
  const upper = fileName.toUpperCase();
  if (upper.includes("SINGLE LINE")) return "single_line";
  if (upper.includes("VALIDASI CT")) return "validation_ct";
  if (upper.includes("VALIDASI PMS")) return "validation_pms";
  if (upper.includes("VALIDASI PMT")) return "validation_pmt";
  if (upper.includes("KOREKSI SLD")) return "sld_correction";
  return "supporting_document";
}

function countBy(items, selector) {
  return items.reduce((acc, item) => {
    const key = selector(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
