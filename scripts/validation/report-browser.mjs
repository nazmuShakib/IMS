import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url),
  repo = process.cwd(),
  output = mkdtempSync(join(tmpdir(), 'ims-reports-browser-'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')));
const tailwind = (await import(pathToFileURL(require.resolve('@tailwindcss/postcss')))).default;
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ??
    '/home/nazmushakib/.cache/ms-playwright-go/1.50.1/package/index.mjs'
);
const server = await createServer({
  root: repo,
  configFile: false,
  cacheDir: join(output, 'cache'),
  resolve: {
    alias: [
      { find: 'next/link', replacement: join(repo, 'scripts/validation/reports-preview/link.tsx') },
      {
        find: 'next/navigation',
        replacement: join(repo, 'scripts/validation/reports-preview/navigation.ts'),
      },
      { find: '@', replacement: join(repo, 'src') },
    ],
  },
  esbuild: { jsx: 'automatic' },
  css: { postcss: { plugins: [tailwind({ base: repo })] } },
  server: { host: '127.0.0.1', port: 4187, strictPort: true },
  plugins: [
    {
      name: 'reports-preview',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.startsWith('/api/reports/products')) {
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                products: [{ id: 'p001', name: 'বাংলা স্মার্টফোন দীর্ঘ নাম', sku: 'SKU-1' }],
              }),
            );
            return;
          }
          if (req.url?.split('?')[0] === '/reports') {
            res.setHeader('Content-Type', 'text/html');
            res.end(
              await server.transformIndexHtml(
                req.url,
                '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/validation/reports-preview/entry.tsx"></script></body></html>',
              ),
            );
            return;
          }
          next();
        });
      },
    },
  ],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const locale of ['en', 'bn']) {
    await page.goto('http://127.0.0.1:4187/reports');
    await page.evaluate((locale) => sessionStorage.setItem('locale', locale), locale);
    for (const width of [375, 768, 1440])
      for (const report of [
        'valuation',
        'sales',
        'profit',
        'purchases',
        'aging',
        'shrinkage',
        'movements',
      ]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`http://127.0.0.1:4187/reports?report=${report}`);
        await page.locator('a[href*="format=csv"]').waitFor();
        await page.locator('input[autocomplete=off]').waitFor();
        const search = page.locator('input[autocomplete=off]');
        const filterGrid = search.locator('xpath=../..');
        const fields = filterGrid.locator(':scope > label');
        if (width === 1440) {
          const boxes = await fields.evaluateAll((elements) =>
            elements.slice(0, 4).map((el) => el.getBoundingClientRect().top),
          );
          if (boxes.length !== 4 || boxes.some((top) => Math.abs(top - boxes[0]) > 1))
            throw new Error(`Product filters not aligned: ${locale} ${report}`);
        }

        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
          throw new Error(`Horizontal overflow ${report} ${locale} ${width}`);
        await page.screenshot({
          path: join(output, `${report}-${locale}-${width}.png`),
          fullPage: true,
        });
        if (await page.locator('.recharts-surface').count())
          throw new Error('Unexpected report chart');
        console.log(`PASS ${report} ${locale} ${width}px`);
      }
  }
  await page.evaluate(() => sessionStorage.setItem('locale', 'en'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4187/reports?report=sales');
  await page.locator('input[type=date]').first().fill('2026-08-01');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForURL(/page=2/);
  if ((await page.locator('input[type=date]').first().inputValue()) !== '2026-08-01')
    throw new Error('Pagination lost draft');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await page.waitForURL(/from=2026-08-01/);
  await page.locator('input[type=date]').first().fill('2026-08-02');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await page.waitForURL(/from=2026-08-02/);
  await page.goBack();
  await page.waitForURL(/from=2026-08-01/);
  await page.waitForFunction(
    () => document.querySelector('input[type=date]').value === '2026-08-01',
  );
  await page.goForward();
  await page.waitForURL(/from=2026-08-02/);
  await page.waitForFunction(
    () => document.querySelector('input[type=date]').value === '2026-08-02',
  );
  await page.getByRole('link', { name: 'Stock aging', exact: true }).click();
  await page.waitForURL(/report=aging/);
  if (new URL(page.url()).searchParams.has('from'))
    throw new Error('Unsupported filter survived tab change');
  console.log(
    'PASS visible filters, direct exports, draft preservation, Back/Forward and report transitions',
  );
  console.log(JSON.stringify({ output, pageErrors: errors }));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser?.close();
  await server.close();
}
