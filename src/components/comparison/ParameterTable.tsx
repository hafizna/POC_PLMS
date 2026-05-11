import { ParameterRow } from "../../domain/types";
import { classifyMismatch } from "../../lib/mismatch-classifier";
import { MismatchBadge } from "./MismatchBadge";

export function ParameterTable({
  fnName,
  rows,
}: {
  fnName: string;
  rows: ParameterRow[];
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-2 bg-slate-50">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">
          {fnName}
        </h3>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-white border-b border-slate-200 text-xs text-slate-500">
          <tr>
            <th className="text-left px-4 py-2 font-medium w-1/3">Parameter</th>
            <th className="text-left px-4 py-2 font-medium">Terpasang (as installed)</th>
            <th className="text-left px-4 py-2 font-medium">Tap (as approved)</th>
            <th className="text-left px-4 py-2 font-medium w-32">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const severity = classifyMismatch(row);
            const rowBg =
              severity === "functional"
                ? "bg-red-50/60"
                : severity === "cosmetic"
                ? "bg-amber-50/40"
                : "";
            return (
              <tr
                key={idx}
                className={`border-b border-slate-100 last:border-b-0 ${rowBg}`}
              >
                <td className="px-4 py-2 text-slate-900">{row.name}</td>
                <td className="px-4 py-2 font-mono text-slate-700 text-xs">
                  {row.terpasang}
                  {row.unit && (
                    <span className="text-slate-400 ml-1">{row.unit}</span>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-slate-700 text-xs">
                  {row.tap}
                  {row.unit && (
                    <span className="text-slate-400 ml-1">{row.unit}</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <MismatchBadge severity={severity} note={row.note} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
