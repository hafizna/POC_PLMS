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
    const ocrPages: PageExtraction[] = [];
    for (let i = 1; i <= lastPage; i++) {
      onProgress?.({ phase: "ocr-rendering", pageNumber: i, pageCount: lastPage });
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // 2x for better OCR quality
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to acquire canvas 2D context");
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

      onProgress?.({ phase: "ocr-recognizing", pageNumber: i, pageCount: lastPage });
      const result = await worker.recognize(canvas);
      ocrPages.push({
        pageNumber: i,
        text: result.data.text.replace(/\s+/g, " ").trim(),
        confidence: result.data.confidence,
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
      `${zone}\\s*(?:(?:Ph|Gnd|Ground)[.\\s-]*)?(?:delay|time)?[\\s:=]*(\\d+(?:[.,]\\d+)?)\\s*s\\b`,
      "i"
    );
    const m = norm.match(re);
    if (m) {
      out.push({ field: `${zone} delay`, value: m[1].replace(",", "."), unit: "s" });
    }
  }

  // OCR pickup / TMS / curve
  const ocPickup =
    norm.match(
      /Ip\s*>\s*Pickup[\s:=]*(?:\d+(?:[.,]\d+)?\s*x\s*In\s*)?(\d+(?:[.,]\d+)?)\s*A\s*\((?:sekunder|secondary)\)/i
    ) ??
    norm.match(/(?:I|Ip)\s*>[\s:=]*(\d+(?:[.,]\d+)?)\s*A?\b/i);
  if (ocPickup) out.push({ field: "OC pickup (I>)", value: ocPickup[1].replace(",", "."), unit: "A" });

  const tms =
    norm.match(/Ip\s*Time\s*Dial[\s:=]*(\d+(?:[.,]\d+)?)\b/i) ??
    norm.match(/TMS[\s:=]*(\d+(?:[.,]\d+)?)\b/i);
  if (tms) out.push({ field: "OC TMS", value: tms[1].replace(",", ".") });

  const curve = norm.match(/(?:curve|characteristic)[\s:=]*(IEC\s*(?:SI|VI|EI)|ANSI\s*\w+|DT)\b/i);
  if (curve) out.push({ field: "OC curve", value: curve[1].toUpperCase().replace(/\s+/g, " ") });

  // Ground fault
  const gfPickup =
    norm.match(
      /IEp?\s*>\s*Pickup[\s:=]*(?:\d+(?:[.,]\d+)?\s*x\s*In\s*)?(\d+(?:[.,]\d+)?)\s*A\s*\((?:sekunder|secondary)\)/i
    ) ??
    norm.match(/IEp?\s*>[\s:=]*(\d+(?:[.,]\d+)?)\s*A?\b/i);
  if (gfPickup) out.push({ field: "GF pickup (Ie>)", value: gfPickup[1].replace(",", "."), unit: "A" });

  const gfTms = norm.match(
    /IEp?\s*Time\s*Dial[\s:=]*(\d+(?:[.,]\d+)?)\b/i
  );
  if (gfTms)
    out.push({ field: "GF TMS", value: gfTms[1].replace(",", ".") });

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

  return out;
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
