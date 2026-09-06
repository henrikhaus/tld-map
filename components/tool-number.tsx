'use client';
import { useState } from 'react';
export default function ToolNumber({
  value,
  min,
  max,
  step = 1,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  function finish() {
    if (draft !== null && draft.trim() && Number.isFinite(Number(draft)))
      onChange(
        Math.max(min, Math.min(max, Math.round(Number(draft) / step) * step)),
      );
    setDraft(null);
  }
  return (
    <input
      className="tool-number"
      aria-label={label}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          finish();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraft(null);
        }
      }}
    />
  );
}
