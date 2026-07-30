import type { ReferenceMetric, ReferenceResult } from "./reference-setting";
import {
  LCD_DIST_REGISTRY,
  type LcdDistRecord,
} from "./lcd-dist-import";
import { OCR_REGISTRY, type OcrRecord } from "./ocr-import";
import type { VerificationReferenceDraft } from "./setting-verification";

export type DatabaseBaseline =
  NonNullable<VerificationReferenceDraft["databaseBaseline"]>;

export function buildOcrDatabaseBaseline(
  recordId: string
): DatabaseBaseline | undefined {
  const record = OCR_REGISTRY.records.find((item) => item.id === recordId);
  if (!record) return undefined;

  const useIssued = hasOcrValues(record.tap);
  const values = useIssued ? record.tap : record.actual;
  const source = useIssued ? "setting-db-issued" : "setting-db-actual";
  const [ctPrimary, ctSecondary] = parseRatio(record.ctRatio);
  const ratio =
    ctPrimary > 0 && ctSecondary > 0 ? ctPrimary / ctSecondary : null;
  const inA = positiveNumber(values.inA);

  return {
    recordId: record.id,
    label: `${record.substation} - ${record.bay} - ${
      useIssued ? "issued/TAP DB" : "installed DB"
    }`,
    source,
    sourceRef: `OCR_PHT row ${record.sourceRow}`,
    relayLabel: `${record.relay.make} ${record.relay.model}`.trim(),
    result: {
      ruleId: `setting-db.ocr-gfr.${useIssued ? "issued" : "actual"}`,
      ruleVersion: `UPT-DKSBI-row-${record.sourceRow}`,
      metrics: compactMetrics([
        metric(
          "ocr-primary",
          "OCR pickup primary",
          multiply(values.ocPickupA, ratio),
          "A",
          "OCR"
        ),
        metric(
          "ocr-secondary",
          "OCR pickup secondary",
          values.ocPickupA,
          "A",
          "OCR"
        ),
        metric(
          "ocr-pu",
          "OCR pickup",
          divide(values.ocPickupA, inA),
          "pu",
          "OCR"
        ),
        metric("ocr-delay", "OCR delay / TMS", values.ocTms, "SI", "OCR"),
        metric(
          "gfr-primary",
          "GFR pickup primary",
          multiply(values.gfPickupA, ratio),
          "A",
          "GFR"
        ),
        metric(
          "gfr-secondary",
          "GFR pickup secondary",
          values.gfPickupA,
          "A",
          "GFR"
        ),
        metric(
          "gfr-pu",
          "GFR pickup",
          divide(values.gfPickupA, inA),
          "pu",
          "GFR"
        ),
        metric("gfr-delay", "GFR delay / TMS", values.gfTms, "SI", "GFR"),
      ]),
      trace: [],
      warnings: useIssued
        ? []
        : [
            "Issued/TAP value pada database kosong atau nol; baseline memakai snapshot setting terpasang.",
          ],
      assumptions: [
        `Basis arus relay mengikuti CT ${record.ctRatio || "belum tersedia"}.`,
        `Sumber: ${useIssued ? "setting issued/TAP" : "setting terpasang"} pada OCR_PHT row ${record.sourceRow}.`,
      ],
    },
  };
}

export function buildDistanceDatabaseBaseline(
  recordId: string
): DatabaseBaseline | undefined {
  const record = LCD_DIST_REGISTRY.records.find(
    (item) => item.id === recordId
  );
  if (!record) return undefined;

  const actual = distanceActual(record);
  const useIssued = hasDistanceValues(record.distance);
  const values = useIssued ? record.distance : actual;
  const source = useIssued ? "setting-db-issued" : "setting-db-actual";

  return {
    recordId: record.id,
    label: `${record.substation} - ${record.bay} - ${
      useIssued ? "issued/TAP DB" : "installed DB"
    }`,
    source,
    sourceRef: `DIST row ${record.sourceRow}`,
    relayLabel: `${record.relay.make} ${record.relay.model}`.trim(),
    result: {
      ruleId: `setting-db.distance.${useIssued ? "issued" : "actual"}`,
      ruleVersion: `UPT-DKSBI-row-${record.sourceRow}`,
      metrics: compactMetrics([
        metric(
          "Z1-z-secondary",
          "Z1 impedance",
          values.z1PhPh,
          "ohm secondary",
          "Z1"
        ),
        metric("Z1-delay", "Z1 delay", values.t1S, "s", "Z1"),
        metric(
          "Z2-z-secondary",
          "Z2 impedance",
          values.z2PhPh,
          "ohm secondary",
          "Z2"
        ),
        metric("Z2-delay", "Z2 delay", values.t2S, "s", "Z2"),
        metric(
          "Z3-z-secondary",
          "Z3 impedance",
          values.z3PhPh,
          "ohm secondary",
          "Z3"
        ),
        metric("Z3-delay", "Z3 delay", values.t3S, "s", "Z3"),
      ]),
      trace: [],
      warnings: useIssued
        ? []
        : [
            "Setting issued/TAP pada database belum lengkap; baseline memakai snapshot setting terpasang.",
          ],
      assumptions: [
        `Impedansi menggunakan basis secondary/relay dari DIST row ${record.sourceRow}.`,
        record.tap.document
          ? `Dokumen database: ${record.tap.document}.`
          : "Referensi dokumen database belum tersedia.",
      ],
    },
  };
}

export function findOcrRecordForObject(
  substation: string,
  bayName: string
): OcrRecord | undefined {
  const station = normalizeObjectName(substation);
  const bay = normalizeObjectName(bayName);
  return OCR_REGISTRY.records.find(
    (record) =>
      normalizeObjectName(record.substation) === station &&
      normalizeObjectName(record.bay) === bay
  );
}

export function findDistanceRecordForObject(
  substation: string,
  bayName: string
): LcdDistRecord | undefined {
  const station = normalizeObjectName(substation);
  const bay = normalizeObjectName(bayName);
  return LCD_DIST_REGISTRY.records.find(
    (record) =>
      normalizeObjectName(record.substation) === station &&
      normalizeObjectName(record.bay) === bay
  );
}

export function normalizeObjectName(value: string) {
  return value
    .toUpperCase()
    .replace(/\b(?:GI|GIS|GISTET|PHT)\b/g, " ")
    .replace(/\b\d+\s*KV\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distanceActual(record: LcdDistRecord) {
  return "actual" in record && record.actual
    ? record.actual
    : record.tap;
}

function hasOcrValues(values: OcrRecord["tap"]) {
  return (
    positiveNumber(values.ocPickupA) !== null ||
    positiveNumber(values.gfPickupA) !== null
  );
}

function hasDistanceValues(values: {
  z1PhPh: number | null;
  z2PhPh: number | null;
  z3PhPh: number | null;
}) {
  return [values.z1PhPh, values.z2PhPh, values.z3PhPh].some(
    (value) => positiveNumber(value) !== null
  );
}

function compactMetrics(metrics: ReferenceMetric[]) {
  return metrics.filter((item) => item.value !== null);
}

function metric(
  key: string,
  label: string,
  value: number | null,
  unit: string,
  group: string
): ReferenceMetric {
  return { key, label, value, unit, group, precision: 6 };
}

function positiveNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function multiply(
  value: number | null | undefined,
  factor: number | null
) {
  return typeof value === "number" && factor !== null
    ? value * factor
    : null;
}

function divide(
  value: number | null | undefined,
  denominator: number | null
) {
  return typeof value === "number" &&
    denominator !== null &&
    denominator > 0
    ? value / denominator
    : null;
}

function parseRatio(value: string): [number, number] {
  const match = value.match(/(\d+(?:\.\d+)?)\s*[/:-]\s*(\d+(?:\.\d+)?)/);
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}
