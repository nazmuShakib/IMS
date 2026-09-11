let locks = 0;
let restore: (() => void) | undefined;

/** Remove the unshaded viewport gutter while locked and compensate actual width growth. */
export function lockBodyScroll(): () => void {
  if (locks === 0) {
    const body = document.body;
    const root = document.documentElement;
    const gutter = root.style.scrollbarGutter;
    const overflow = body.style.overflow;
    const padding = body.style.paddingRight;
    const width = body.getBoundingClientRect().width;
    const existingPadding = parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.overflow = 'hidden';
    // A stable root gutter sits outside fixed modal backdrops and appears as a white strip.
    root.style.scrollbarGutter = 'auto';
    const growth = body.getBoundingClientRect().width - width;
    if (growth > 0) body.style.paddingRight = `${existingPadding + growth}px`;
    restore = () => { root.style.scrollbarGutter = gutter; body.style.overflow = overflow; body.style.paddingRight = padding; };
  }
  locks++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) { restore?.(); restore = undefined; }
  };
}
