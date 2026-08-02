type Props = {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  unit?: string;
  min?: number;
  max?: number;
  label?: string;
  edited?: boolean;
};

export function NumberInput({
  value,
  onChange,
  step = 0.001,
  unit,
  min,
  max,
  label,
  edited,
}: Props) {
  return (
    <label className="flex flex-col gap-1">
      {label && (
        <span className="text-[11px] text-slate-600 flex items-center gap-1">
          {label}
          {edited && (
            <span
              title="Edited from approved value"
              className="w-1.5 h-1.5 bg-brand-accent rounded-full"
            />
          )}
        </span>
      )}
      <div className="flex items-center bg-white border border-slate-300 rounded focus-within:border-brand-accent focus-within:ring-1 focus-within:ring-brand-accent/30">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          className="w-full px-2 py-1 text-sm font-mono outline-none rounded-l"
        />
        {unit && (
          <span className="px-2 text-[10px] text-slate-500 border-l border-slate-200">
            {unit}
          </span>
        )}
      </div>
    </label>
  );
}
