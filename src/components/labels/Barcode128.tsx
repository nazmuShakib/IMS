import { encodeCode128 } from '@/lib/code128';

export function Barcode128({ value }: { value: string }) {
  let modules: string;
  try {
    modules = encodeCode128(value).modules;
  } catch {
    return (
      <div className="flex h-full items-center justify-center border border-dashed border-out text-[6px] text-out">
        Identifier cannot be encoded
      </div>
    );
  }

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
      aria-label={`Code 128 barcode for ${value}`}
      className="block h-full w-full"
      preserveAspectRatio="none"
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${modules.length} 40`}
    >
      <rect width={modules.length} height="40" fill="#fff" />
      {bars.map((bar) => (
        <rect key={`${bar.x}-${bar.width}`} x={bar.x} width={bar.width} height="40" fill="#000" />
      ))}
    </svg>
  );
}
