/** Rounded percent, or an em dash when the roll-up has nothing to average. */
export function ProgressMeter({
  percent,
  testId,
  size = 'sm',
}: {
  percent: number | null;
  testId: string;
  size?: 'sm' | 'lg';
}) {
  const label = percent == null ? '—' : `${percent}%`;
  const width = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const large = size === 'lg';
  return (
    <div
      className={`flex items-center ${large ? 'gap-3' : 'gap-2'}`}
      data-testid={testId}
      data-progress={percent == null ? '' : String(percent)}
    >
      <div className={`flex-1 rounded-full bg-slate-100 overflow-hidden ${large ? 'h-3' : 'h-1.5'}`}>
        <div
          className={`h-full ${percent === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className={`font-bold tabular-nums text-slate-600 text-right ${large ? 'text-sm w-12' : 'text-[11px] w-9'}`}>{label}</span>
    </div>
  );
}