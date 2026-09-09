let locks = 0;
let restore: (() => void) | undefined;

/** Keep the existing gutter; compensate only when the body's rendered width grows. */
export function lockBodyScroll(): () => void {
  if (locks === 0) {
    const body = document.body;
    const overflow = body.style.overflow;
    const padding = body.style.paddingRight;
    const width = body.getBoundingClientRect().width;
    const existingPadding = parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.overflow = 'hidden';
    // scrollbar-gutter: stable already reserves space, even with overflow hidden.
    const growth = body.getBoundingClientRect().width - width;
    if (growth > 0) body.style.paddingRight = `${existingPadding + growth}px`;
    restore = () => { body.style.overflow = overflow; body.style.paddingRight = padding; };
  }
  locks++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) { restore?.(); restore = undefined; }
  };
}
