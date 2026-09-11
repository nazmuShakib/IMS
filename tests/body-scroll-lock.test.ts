// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
afterEach(() => { vi.restoreAllMocks(); document.body.removeAttribute('style'); });
it('does not double-compensate a stable scrollbar gutter', () => {
  document.body.style.paddingRight = '8px';
  vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ width: 996 } as DOMRect);
  const unlock = lockBodyScroll();
  expect(document.body.style.overflow).toBe('hidden');
  expect(document.body.style.paddingRight).toBe('8px');
  unlock(); expect(document.body.style.overflow).toBe(''); expect(document.body.style.paddingRight).toBe('8px');
});
it('compensates actual width growth when no stable gutter is available', () => {
  document.body.style.overflow = 'auto'; document.body.style.paddingRight = '6px';
  vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValueOnce({ width: 996 } as DOMRect).mockReturnValue({ width: 1000 } as DOMRect);
  const unlock = lockBodyScroll(); expect(document.body.style.paddingRight).toBe('10px');
  unlock(); expect(document.body.style.overflow).toBe('auto'); expect(document.body.style.paddingRight).toBe('6px');
});
it('keeps scrolling locked until all overlapping overlays close, in either order', () => {
  const first = lockBodyScroll(); const second = lockBodyScroll();
  first(); first(); expect(document.body.style.overflow).toBe('hidden');
  second(); expect(document.body.style.overflow).toBe('');
  const third = lockBodyScroll(); const fourth = lockBodyScroll();
  fourth(); expect(document.body.style.overflow).toBe('hidden'); third(); expect(document.body.style.overflow).toBe('');
});
it('removes the unshaded viewport gutter for nested dialogs and restores it after the final close', () => {
  document.documentElement.style.scrollbarGutter = 'stable';
  const first = lockBodyScroll(); const second = lockBodyScroll();
  expect(document.documentElement.style.scrollbarGutter).toBe('auto');
  first(); expect(document.documentElement.style.scrollbarGutter).toBe('auto');
  second(); expect(document.documentElement.style.scrollbarGutter).toBe('stable');
  document.documentElement.style.scrollbarGutter = '';
});
