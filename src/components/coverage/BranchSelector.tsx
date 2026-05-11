import { useProsetStore } from "../../store/useProsetStore";
import { GitBranch } from "lucide-react";

export function BranchSelector() {
  const corridors = useProsetStore((s) => s.corridors);
  const activeId = useProsetStore((s) => s.activeCorridorId);
  const setActive = useProsetStore((s) => s.setActiveCorridor);

  return (
    <div className="flex items-center gap-2">
      <GitBranch className="w-4 h-4 text-slate-500" />
      <select
        value={activeId}
        onChange={(e) => setActive(e.target.value)}
        className="bg-white text-sm px-3 py-1.5 rounded border border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {corridors.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}
