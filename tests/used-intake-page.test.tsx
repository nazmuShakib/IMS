import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ cart: vi.fn(), products: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/session', () => ({ requirePageCapability: async () => ({ id: 'owner' }), getSession: async () => ({ locale: 'en' }) }));
vi.mock('@/repositories', () => ({ db: { carts: { findById: mocks.cart }, products: { findAll: mocks.products } } }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
vi.mock('@/components/stock/UsedDeviceIntakeForm', () => ({ UsedDeviceIntakeForm: ({ mode }: { mode: string }) => <div data-intake={mode} /> }));
import UsedDeviceIntakePage from '@/app/(dashboard)/stock/used-intake/page';
beforeEach(() => { mocks.cart.mockReset().mockResolvedValue(null); mocks.products.mockReset().mockResolvedValue([]); mocks.redirect.mockReset().mockImplementation(() => { throw new Error('redirect'); }); });
describe('legacy trade-in URLs', () => {
  it.each(['', 'missing', 'malformed'])('never falls back to purchase for cart=%s', async cart => {
    const html = renderToStaticMarkup(await UsedDeviceIntakePage({ searchParams: Promise.resolve({ cart }) }));
    expect(html).toContain('This checkout is no longer available'); expect(html).not.toContain('data-intake');
    expect(mocks.products).not.toHaveBeenCalled();
  });
  it('rejects another actor’s cart', async () => {
    mocks.cart.mockResolvedValue({ id: 'cart', actorId: 'other' });
    const html = renderToStaticMarkup(await UsedDeviceIntakePage({ searchParams: Promise.resolve({ cart: 'cart' }) }));
    expect(html).not.toContain('data-intake'); expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it('opens the checkout panel for a valid owned cart', async () => {
    mocks.cart.mockResolvedValue({ id: 'cart', actorId: 'owner' });
    await expect(UsedDeviceIntakePage({ searchParams: Promise.resolve({ cart: 'cart' }) })).rejects.toThrow('redirect');
    expect(mocks.redirect).toHaveBeenCalledWith('/checkout?tradeIn=1');
  });
  it('keeps an unlinked visit as standalone purchase', async () => {
    const html = renderToStaticMarkup(await UsedDeviceIntakePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('data-intake="purchase"');
  });
});
