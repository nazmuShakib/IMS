export function LoadingScreen({
  label = 'Loading…',
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`flex items-center justify-center p-5 print:hidden ${
        compact
          ? 'min-h-44'
          : 'min-h-[calc(100dvh-6rem)] lg:min-h-[calc(100dvh-7rem)]'
      }`}
    >
      <div className="flex min-w-48 flex-col items-center px-8 py-7">
        <span
          aria-hidden="true"
          className="h-7 w-7 animate-spin rounded-full border-2 border-rule border-t-signal"
        />
        <p className="mt-3 text-[13px] font-medium">{label}</p>
        <p className="mt-1 text-[11px] text-graphite">Please wait</p>
      </div>
    </div>
  );
}
