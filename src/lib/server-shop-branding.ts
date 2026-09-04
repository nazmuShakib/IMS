import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

let invoiceLogoDataUriPromise: Promise<string> | null = null;

/** Loads the bundled invoice logo for renderers that cannot resolve public URLs. */
export function bundledInvoiceLogoDataUri(): Promise<string> {
  invoiceLogoDataUriPromise ??= readFile(join(process.cwd(), 'public/branding/invoice-logo.png'))
    .then((content) => `data:image/png;base64,${content.toString('base64')}`);
  return invoiceLogoDataUriPromise;
}
