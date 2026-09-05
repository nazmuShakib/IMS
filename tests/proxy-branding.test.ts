import { describe, expect, it } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config } from '@/proxy';

describe('public branding routes', () => {
  it.each(['/branding/topbar-logo.png', '/branding/invoice-logo.png'])('allows %s without the session guard', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  });

  it.each(['/emi', '/invoices', '/branding-private', '/api/invoices/example/pdf'])('keeps %s behind the session guard', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
  });
});
