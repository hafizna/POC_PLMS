// PDF text extraction with OCR fallback.
//
// Strategy:
//   1. Try pdf.js text-layer extraction first (fast, exact, free).
//   2. If extracted text is sparse (<50 chars per page average), the PDF is
//      likely a scanned image — fall back to tesseract.js OCR per page.
//
// Both libraries are dynamically imported so the main bundle stays slim;
// pdf.js (~340 KB) and tesseract.js (~10 MB lang data from CDN) only load
// when an engineer actually triggers extraction.

export type ExtractionMethod = "text-layer" | "ocr" | "failed";

export type PageExtraction = {
  pageNumber: number;
  text: string;
  confidence?: number; // OCR confidence 0-100; undefined for text-layer
};

export type ExtractionResult = {
  method: ExtractionMethod;
  pages: PageExtraction[];
  fullText: string;
  pageCount: number;
  durationMs: number;
};

export type OcrProgress = {
  phase: "loading" | "text-layer" | "ocr-rendering" | "ocr-recognizing" | "done";
  pageNumber?: number;
  pageCount?: number;
  pageProgress?: number; // 0..1 for current page
};

const TEXT_LAYER_THRESHOLD_CHARS_PER_PAGE = 50;

export async function extractPdfText(
  file: File | Blob,
  onProgress?: (p: OcrProgress) => void,
  options: { maxPages?: number } = {}
): Promise<ExtractionResult> {
  const start = performance.now();
  onProgress?.({ phase: "loading" });

  const pdfjs = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const lastPage = options.maxPages ? Math.min(options.maxPages, pageCount) : pageCount;

  // Pass 1: pdf.js text-layer per page.
  onProgress?.({ phase: "text-layer", pageCount: lastPage });
  const textLayerPages: PageExtraction[] = [];
  let totalChars = 0;
  for (let i = 1; i <= lastPage; i++) {
    onProgress?.({ phase: "text-layer", pageNumber: i, pageCount: lastPage });
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    textLayerPages.push({ pageNumber: i, text });
    totalChars += text.length;
  }

  const avgChars = totalChars / Math.max(1, lastPage);
  if (avgChars >= TEXT_LAYER_THRESHOLD_CHARS_PER_PAGE) {
    onProgress?.({ phase: "done", pageCount: lastPage });
    return {
      method: "text-layer",
      pages: textLayerPages,
      fullText: textLayerPages.map((p) => p.text).join("\n\n"),
      pageCount,
      durationMs: performance.now() - start,
    };
  }

  // Pass 2: OCR fallback. Render each page to canvas, OCR with tesseract.
  onProgress?.({ phase: "ocr-rendering", pageCount: lastPage });
  const tesseract = await loadTesseract();
  const worker = await tesseract.createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") {
        onProgress?.({
          phase: "ocr-recognizing",
          pageProgress: m.progress,
          pageCount: lastPage,
        });
      }
    },
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "11",
    } as never);
    const ocrPages: PageExtraction[] = [];
    for (let i = 1; i <= lastPage; i++) {
      onProgress?.({ phase: "ocr-rendering", pageNumber: i, pageCount: lastPage });
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 3.0 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to acquire canvas 2D context");
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
      const ocrCanvas = prepareOcrCanvas(canvas);

      onProgress?.({ phase: "ocr-recognizing", pageNumber: i, pageCount: lastPage });
      const sparseResult = await worker.recognize(ocrCanvas);
      let tableText = "";
      let tableConfidence: number | undefined;
      if (lastPage <= 6) {
        await worker.setParameters({
          preserve_interword_spaces: "1",
          tessedit_pageseg_mode: "6",
        } as never);
        const tableResult = await worker.recognize(ocrCanvas);
        tableText = tableResult.data.text;
        tableConfidence = tableResult.data.confidence;
        await worker.setParameters({
          preserve_interword_spaces: "1",
          tessedit_pageseg_mode: "11",
        } as never);
      }
      ocrPages.push({
        pageNumber: i,
        text: combineOcrPasses(sparseResult.data.text, tableText),
        confidence:
          tableConfidence === undefined
            ? sparseResult.data.confidence
            : (sparseResult.data.confidence + tableConfidence) / 2,
      });
    }
    onProgress?.({ phase: "done", pageCount: lastPage });
    return {
      method: "ocr",
      pages: ocrPages,
      fullText: ocrPages.map((p) => p.text).join("\n\n"),
      pageCount,
      durationMs: performance.now() - start,
    };
  } finally {
    await worker.terminate();
  }
}

function prepareOcrCanvas(source: HTMLCanvasElement) {
  const cropX = Math.round(source.width * 0.12);
  const cropY = Math.round(source.height * 0.06);
  const cropWidth = Math.round(source.width * 0.82);
  const cropHeight = Math.round(source.height * 0.86);
  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Failed to prepare OCR canvas");
  context.drawImage(
    source,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  const image = context.getImageData(0, 0, cropWidth, cropHeight);
  const contrast = 1.35;
  const intercept = 128 * (1 - contrast);
  for (let index = 0; index < image.data.length; index += 4) {
    const gray =
      image.data[index] * 0.299 +
      image.data[index + 1] * 0.587 +
      image.data[index + 2] * 0.114;
    const adjusted = Math.max(0, Math.min(255, gray * contrast + intercept));
    image.data[index] = adjusted;
    image.data[index + 1] = adjusted;
    image.data[index + 2] = adjusted;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function combineOcrPasses(sparseText: string, tableText: string) {
  const sparse = normalizeOcrText(sparseText);
  const table = normalizeOcrText(tableText);
  if (!table || table === sparse) return sparse;
  return `${sparse}\n\n[table-pass]\n${table}`;
}

function normalizeOcrText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, index, lines) => line || Boolean(lines[index - 1]))
    .join("\n")
    .trim();
}

// =============================================================================
// Field extraction heuristics for TAP setting documents
// =============================================================================
//
// Run on extracted text to surface common protection setting fields.
// Confidence is rough: matches via regex are reported but engineer must verify.

export type ExtractedField = {
  field: string;
  value: string;
  unit?: string;
  context?: string;
};

export type TapDocumentIdentity = {
  documentNumber?: string;
  station?: string;
  bayDirection?: string;
  relayModels: string[];
  functions: string[];
};

export function extractTapDocumentIdentity(
  text: string
): TapDocumentIdentity {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const documentMatch = text.match(
    /\bTJBB[I/]?0?1\/0?4\/20\d{2}\/\d+\b/i
  );
  const stationLine = lines.find((line) =>
    /(?:DAFTAR SETELAN|LOKASI).*\bGI(?:S)?\s*150\s*kV\s+[A-Z]/i.test(line)
  );
  const stationMatch =
    stationLine?.match(
      /\bGI(?:S)?\s*150\s*kV\s+([A-Z][A-Z0-9 ]{1,40})$/i
    ) ??
    lines
      .find((line) => /^LOKASI\b/i.test(line))
      ?.match(/\bGI(?:S)?\s+([A-Z][A-Z0-9 ]{1,40})$/i);
  const directionLine = lines.find((line) =>
    /Penghantar\s*150\s*kV\s*arah\s+/i.test(line)
  );
  const directionMatch = directionLine?.match(
    /arah\s+([A-Z][A-Z0-9 ]{1,40})$/i
  );
  const relayModels = uniqueStrings(
    Array.from(text.matchAll(/\b(?:MiCOM|MICOM)\s+P\d{3}\b/gi)).map(
      (match) => match[0].replace(/\s+/g, " ").toUpperCase()
    )
  );
  const functions = [
    /DISTANCE/i.test(text) ? "DIST" : "",
    /\bOCR\b|OVERCURRENT/i.test(text) ? "OCR" : "",
    /\bGFR\b|EARTH\s*FAULT/i.test(text) ? "GFR" : "",
  ].filter(Boolean);

  return {
    documentNumber: documentMatch
      ? documentMatch[0]
          .toUpperCase()
          .replace(/^TJBBI/, "TJBB/")
          .replace(/^TJBB\/?01/, "TJBB/01")
      : undefined,
    station: stationMatch?.[1].trim().toUpperCase(),
    bayDirection: directionMatch?.[1].trim().toUpperCase(),
    relayModels,
    functions,
  };
}

// Map an extracted field to the protection function it belongs to. Used by
// the "Promote to line" flow to bucket Z1/Z2/Z3 → DIST, I>/TMS → OCR, etc.
// Returns null for fields that aren't function-specific (CT/VT, doc number).
export function classifyExtractedField(
  fieldName: string
): "DIST" | "LCD" | "OCR" | "GFR" | "AR" | "SYNC" | null {
  const f = fieldName.toLowerCase();
  if (/(z1|z2|z3|line\s*impedance|tz\d|t[123]\s*delay)/i.test(f)) return "DIST";
  if (/(i\s*>|^oc\b|tms|curve)/i.test(f) && !/^gf|ie\s*>/i.test(f)) return "OCR";
  if (/(ie\s*>|^gf|ground.?fault)/i.test(f)) return "GFR";
  if (/(autoreclose|^ar\b|reclose)/i.test(f)) return "AR";
  if (/(sync|synchro)/i.test(f)) return "SYNC";
  if (/(line\s*diff|differential|^lcd\b)/i.test(f)) return "LCD";
  return null;
}

// Group extracted fields by protection function. Returns map: function → fields.
// Fields that don't classify (CT/VT, TAP doc number) go to the `_meta` bucket.
export function groupFieldsByFunction(fields: ExtractedField[]): {
  byFunction: Record<string, ExtractedField[]>;
  meta: ExtractedField[];
} {
  const byFunction: Record<string, ExtractedField[]> = {};
  const meta: ExtractedField[] = [];
  for (const field of fields) {
    const fn = classifyExtractedField(field.field);
    if (fn) {
      if (!byFunction[fn]) byFunction[fn] = [];
      byFunction[fn].push(field);
    } else {
      meta.push(field);
    }
  }
  return { byFunction, meta };
}

export function extractTapFields(text: string): ExtractedField[] {
  const out: ExtractedField[] = [];
  const norm = text.replace(/\s+/g, " ");

  // Distance zone reach
  for (const zone of ["Z1", "Z2", "Z3"]) {
    const re = new RegExp(
      `${zone}\\s*(?:(?:Ph|Phase)(?:[.\\s-]*(?:Ph|Phase))?[.\\s-]*)?(?:reach)?[\\s:=]*(\\d+(?:[.,]\\d+)?)\\s*(?:ohm|Ω)?`,
      "i"
    );
    const m = norm.match(re);
    if (m) {
      out.push({ field: `${zone} reach`, value: m[1].replace(",", "."), unit: "ohm" });
    }
  }

  // Time delays
  for (const zone of ["t1", "t2", "t3", "tZ1", "tZ2", "tZ3"]) {
    const re = new RegExp(
      `${zone}\\s*(?:(?:Ph|Gnd|Ground)[.\\s-]*)?(?:dela(?:y)?|time)?[\\s:=]*(\\d+(?:[.,]\\d+)?)\\s*s\\b`,
      "i"
    );
    const m = norm.match(re);
    if (m) {
      out.push({ field: `${zone} delay`, value: m[1].replace(",", "."), unit: "s" });
    }
  }

  // OCR pickup / TMS / curve
  const nominalCurrent = numericCapture(
    norm.match(/\bIn\s*[=:]\s*(\d+(?:[.,]\d+)?)\s*A\b/i)?.[1]
  );
  const micomOc = norm.match(
    /(?:I|1)\s*>\s*1\s*Current\s*Set[\s\S]{0,80}?(\d+(?:[.,]\d+)?)\s*x\s*In[\s\S]{0,40}?(\d+(?:[.,]\d+)?)\s*A\b/i
  );
  const genericOc =
    norm.match(
      /Ip\s*>\s*Pickup[\s:=]*(?:\d+(?:[.,]\d+)?\s*x\s*In\s*)?(\d+(?:[.,]\d+)?)\s*A\s*\((?:sekunder|secondary)\)/i
    ) ??
    norm.match(/(?:I|Ip)\s*>[\s:=]*(\d+(?:[.,]\d+)?)\s*A?\b/i);
  const ocPickupA =
    numericCapture(micomOc?.[2]) ?? numericCapture(genericOc?.[1]);
  if (ocPickupA !== null) {
    out.push({
      field: "OC pickup (I>)",
      value: String(ocPickupA),
      unit: "A",
    });
  }
  const ocPu =
    nominalCurrent && ocPickupA !== null
      ? ocPickupA / nominalCurrent
      : numericCapture(micomOc?.[1]);
  if (ocPu !== null) {
    out.push({ field: "OC pickup pu", value: formatExtractedNumber(ocPu), unit: "pu" });
  }

  const ocTms =
    norm.match(
      /(?:I|1)\s*>\s*1\s*(?:TMS|Time\s*Dial)[\s:=]*(\d+(?:[.,]\d+)?|\d{3})\b/i
    ) ??
    norm.match(/Ip\s*Time\s*Dial[\s:=]*(\d+(?:[.,]\d+)?)\b/i) ??
    norm.match(/\bOC(?:R)?\s*TMS[\s:=]*(\d+(?:[.,]\d+)?)\b/i);
  if (ocTms) {
    out.push({ field: "OC TMS", value: normalizeTmsToken(ocTms[1]) });
  }

  const curve = norm.match(/(?:curve|characteristic)[\s:=]*(IEC\s*(?:SI|VI|EI)|ANSI\s*\w+|DT)\b/i);
  if (curve) {
    out.push({ field: "OC curve", value: curve[1].toUpperCase().replace(/\s+/g, " ") });
  } else if (/(?:I|1)\s*>\s*1\s*Function[\s\S]{0,40}?IEC[\s\S]{0,20}?Std[.\s]*Inv/i.test(norm)) {
    out.push({ field: "OC curve", value: "SI" });
  }

  // Ground fault
  const micomGf = norm.match(
    /IN?\s*1\s*>\s*1\s*Current[\s\S]{0,80}?(\d+(?:[.,]\d+)?)\s*x\s*In[\s\S]{0,40}?(\d+(?:[.,]\d+)?)\s*A\b/i
  );
  const gfPickup =
    norm.match(
      /IEp?\s*>\s*Pickup[\s:=]*(?:\d+(?:[.,]\d+)?\s*x\s*In\s*)?(\d+(?:[.,]\d+)?)\s*A\s*\((?:sekunder|secondary)\)/i
    ) ??
    norm.match(/IEp?\s*>[\s:=]*(\d+(?:[.,]\d+)?)\s*A?\b/i);
  const gfPickupA =
    numericCapture(micomGf?.[2]) ?? numericCapture(gfPickup?.[1]);
  if (gfPickupA !== null) {
    out.push({
      field: "GF pickup (Ie>)",
      value: String(gfPickupA),
      unit: "A",
    });
  }
  const gfPu =
    nominalCurrent && gfPickupA !== null
      ? gfPickupA / nominalCurrent
      : numericCapture(micomGf?.[1]);
  if (gfPu !== null) {
    out.push({ field: "GF pickup pu", value: formatExtractedNumber(gfPu), unit: "pu" });
  }

  const gfTms =
    norm.match(
      /IN?\s*1\s*>\s*1\s*(?:TMS|Time\s*Dial)[\s:=]*(\d+(?:[.,]\d+)?|\d{3})\b/i
    ) ??
    norm.match(/IEp?\s*Time\s*Dial[\s:=]*(\d+(?:[.,]\d+)?)\b/i) ??
    norm.match(/\bGF(?:R)?\s*TMS[\s:=]*(\d+(?:[.,]\d+)?)\b/i);
  if (gfTms) {
    out.push({ field: "GF TMS", value: normalizeTmsToken(gfTms[1]) });
  }

  // CT/VT ratio
  const ctRatio = norm.match(/CT(?:\s*ratio)?[\s:=]*(\d{2,5})\s*[\/:]\s*(\d{1,2})\b/i);
  if (ctRatio) out.push({ field: "CT ratio", value: `${ctRatio[1]}/${ctRatio[2]}`, unit: "A" });

  const vtRatio = norm.match(/(?:VT|PT)(?:\s*ratio)?[\s:=]*(\d{2,3})\s*kV\s*[\/:]\s*(\d{2,3})\s*V/i);
  if (vtRatio) out.push({ field: "VT ratio", value: `${vtRatio[1]} kV/${vtRatio[2]} V` });

  // Line impedance
  const lineZ = norm.match(/(?:line\s*impedance|Z\s*line)[\s:=]*(\d+(?:[.,]\d+)?)\s*(?:ohm|Ω)/i);
  if (lineZ) out.push({ field: "Line impedance", value: lineZ[1].replace(",", "."), unit: "ohm" });

  // Document reference (TAP doc number)
  const tapDoc = norm.match(/(TJBB|TJBT|TJBP|TJBA)\/[\w./-]+/i);
  if (tapDoc) out.push({ field: "TAP document", value: tapDoc[0] });

  return dedupeExtractedFields(out);
}

function numericCapture(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTmsToken(value: string) {
  const normalized = value.replace(",", ".");
  if (/^0\d{2,3}$/.test(normalized)) {
    return `0.${normalized.slice(1)}`;
  }
  return normalized;
}

function formatExtractedNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}

function dedupeExtractedFields(fields: ExtractedField[]) {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const key = field.field.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

// =============================================================================
// Lazy loaders. Both kept here so callers don't pull pdfjs/tesseract eagerly.
// =============================================================================

let _pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
async function loadPdfJs() {
  if (!_pdfjsPromise) {
    _pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      // Vite ?url import gives a URL the worker can fetch from same origin.
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return _pdfjsPromise;
}

let _tesseractPromise: Promise<typeof import("tesseract.js")> | null = null;
async function loadTesseract() {
  if (!_tesseractPromise) {
    _tesseractPromise = import("tesseract.js");
  }
  return _tesseractPromise;
}
