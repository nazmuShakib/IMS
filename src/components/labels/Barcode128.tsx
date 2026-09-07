'use client';
import { labelBarcodeFit } from '@/lib/label-print';
import { useI18n } from '@/components/i18n/I18nProvider';

export function Barcode128({ value }: { value: string }) {
  const { t } = useI18n();
  const fit = labelBarcodeFit(value);
  if (fit.error) return <div className="flex h-full items-center justify-center border border-dashed border-out text-[6px] text-out">{t(fit.error)}</div>;
  const { modules } = fit.encoding!;
  const moduleDots = fit.moduleDots!;
  const physicalWidthMm = fit.widthMm!;

  const bars: Array<{ x: number; width: number }> = [];
  let start = -1;
  for (let index = 0; index <= modules.length; index += 1) {
    if (modules[index] === '1' && start === -1) start = index;
    if (modules[index] !== '1' && start !== -1) {
      bars.push({ x: start, width: index - start });
      start = -1;
    }
  }

  return (
    <svg
      aria-label={t('labels.barcodeFor', { value })}
      className="mx-auto block h-full max-w-full"
      data-module-dots={moduleDots}
      preserveAspectRatio="none"
      role="img"
      shapeRendering="crispEdges"
      style={{ width: `${physicalWidthMm.toFixed(3)}mm` }}
      viewBox={`0 0 ${modules.length} 40`}
    >
      <rect width={modules.length} height="40" fill="#fff" />
      {bars.map((bar) => (
        <rect key={`${bar.x}-${bar.width}`} x={bar.x} width={bar.width} height="40" fill="#000" />
      ))}
    </svg>
  );
}
