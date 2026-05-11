import pdfSourceRegistry from "./generated/pdf-source-registry.json";
import { normalizeStationName } from "./normalization";
import type { NetworkNode } from "./seed-network-registry";

export type PdfSourceRegistry = typeof pdfSourceRegistry;
export type PdfSourceRecord = PdfSourceRegistry["records"][number];
export type PdfEndpointCandidate =
  PdfSourceRegistry["records"][number]["endpointCandidates"][number] & {
    sourceDocumentId: string;
    sourceFileName: string;
    documentType: string;
  };

export const PDF_SOURCE_REGISTRY = pdfSourceRegistry;

export function filterPdfSourcesForNodes(nodes: NetworkNode[]): PdfSourceRecord[] {
  const stationKeys = nodes.map((node) => normalizeStationName(node.name)).filter(Boolean);
  if (stationKeys.length === 0) return PDF_SOURCE_REGISTRY.records;
  return PDF_SOURCE_REGISTRY.records.filter((record) => {
    const hints = record.stationHints.map((hint) => normalizeStationName(hint));
    const localStation = normalizeStationName(record.localStationHint);
    const folderKey = normalizeStationName(`${record.stationFolder} ${record.fileName}`);
    const endpointKeys = record.endpointCandidates.flatMap((candidate) => [
      normalizeStationName(candidate.localStation),
      normalizeStationName(candidate.remoteStation),
    ]);
    return stationKeys.some(
      (station) =>
        folderKey.includes(station) ||
        localStation.includes(station) ||
        station.includes(localStation) ||
        hints.some((hint) => hint.includes(station) || station.includes(hint)) ||
        endpointKeys.some((key) => key.includes(station) || station.includes(key))
    );
  });
}

export function getEndpointCandidatesForNodes(nodes: NetworkNode[]): PdfEndpointCandidate[] {
  const stationKeys = nodes.map((node) => normalizeStationName(node.name)).filter(Boolean);
  return PDF_SOURCE_REGISTRY.records
    .filter((record) => record.documentType === "sld")
    .flatMap((record) =>
      record.endpointCandidates.map((candidate) => ({
        ...candidate,
        sourceDocumentId: record.id,
        sourceFileName: record.fileName,
        documentType: record.documentType,
      }))
    )
    .filter((candidate) => {
      if (stationKeys.length === 0) return true;
      const local = normalizeStationName(candidate.localStation);
      const remote = normalizeStationName(candidate.remoteStation);
      return stationKeys.some(
        (station) =>
          local.includes(station) ||
          station.includes(local) ||
          remote.includes(station) ||
          station.includes(remote)
      );
    });
}
