/** Rounded percent, or an em dash when the roll-up has nothing to average. */
export function ProgressMeter({ percent, testId }: { percent: number | null; testId: string }) {
  const label = percent == null ? '—' : `${percent}%`;
  const width = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div
      className="flex items-center gap-2"
      data-testid={testId}
      data-progress={percent == null ? '' : String(percent)}
    >
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full ${percent === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-[11px] font-bold tabular-nums text-slate-600 w-9 text-right">{label}</span>
    </div>
  );
}