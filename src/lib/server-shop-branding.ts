import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { INVOICE_LOGO_SRC } from './shop-branding';

export async function printableShop(pdf = false) {
  const customLogo = process.env.SHOP_LOGO_DATA_URI?.trim();
  return {
    name: process.env.SHOP_NAME?.trim() || 'Irfan Gadget & Mobile',
    logoDataUri: customLogo || (pdf ? await bundledInvoiceLogoDataUri() : INVOICE_LOGO_SRC),
    address: customLogo ? process.env.SHOP_ADDRESS?.trim() || null : null,
    phone: customLogo ? process.env.SHOP_PHONE?.trim() || null : null,
    policy: process.env.INVOICE_POLICY?.trim() || null,
  };
}

let invoiceLogoDataUriPromise: Promise<string> | null = null;

/** Loads the bundled invoice logo for renderers that cannot resolve public URLs. */
export function bundledInvoiceLogoDataUri(): Promise<string> {
  invoiceLogoDataUriPromise ??= readFile(join(process.cwd(), 'public/branding/invoice-logo.png'))
    .then((content) => `data:image/png;base64,${content.toString('base64')}`);
  return invoiceLogoDataUriPromise;
}
