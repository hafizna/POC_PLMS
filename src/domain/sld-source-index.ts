import sldSourceIndex from "./generated/sld-source-index.json";

export type SldSourceIndex = typeof sldSourceIndex;
export type SldSourceFile = SldSourceIndex["files"][number];

export const SLD_SOURCE_INDEX = sldSourceIndex;

export function findSldFilesByStation(pattern: RegExp): SldSourceFile[] {
  return SLD_SOURCE_INDEX.files.filter((record) =>
    pattern.test(record.stationFolder)
  );
}
