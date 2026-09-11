import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url), repo = process.cwd(), output = mkdtempSync(join(tmpdir(), 'ims-expenses-browser-'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')));
const tailwind = (await import(pathToFileURL(require.resolve('@tailwindcss/postcss')))).default;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/home/nazmushakib/.cache/ms-playwright-go/1.50.1/package/index.mjs');
const server = await createServer({ root: repo, configFile: false, cacheDir: join(output, 'cache'), resolve: { alias: [
  { find: '@/actions/expenses', replacement: join(repo, 'scripts/validation/expenses-preview/actions.ts') },
  { find: 'next/link', replacement: join(repo, 'scripts/validation/reports-preview/link.tsx') },
  { find: 'next/navigation', replacement: join(repo, 'scripts/validation/reports-preview/navigation.ts') },
  { find: '@', replacement: join(repo, 'src') },
] }, esbuild: { jsx: 'automatic' }, css: { postcss: { plugins: [tailwind({ base: repo })] } }, server: { host: '127.0.0.1', port: 4188, strictPort: true }, plugins: [{ name: 'expenses-preview', configureServer(server) {
  server.middlewares.use(async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/expenses') return next();
    res.setHeader('Content-Type', 'text/html');
    res.end(await server.transformIndexHtml(req.url, '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/validation/expenses-preview/entry.tsx"></script></body></html>'));
  });
} }] });
let browser;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const locale of ['en', 'bn']) {
    await page.goto('http://127.0.0.1:4188/expenses');
    await page.evaluate(locale => sessionStorage.setItem('locale', locale), locale);
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto('http://127.0.0.1:4188/expenses');
      await page.locator('a[href*=csv]').waitFor();
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `Overflow ${locale} ${width}`);
      if (width === 1440) {
        const tops = await page.locator('#expense-filters fieldset > div').evaluateAll(elements => elements.slice(0, 4).map(e => e.getBoundingClientRect().top));
        assert(tops.length === 4 && tops.every(top => Math.abs(top - tops[0]) < 1), 'Four filters should share the desktop row');
      }
      await page.screenshot({ path: join(output, `expenses-${locale}-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: locale === 'en' ? 'Add expense' : 'ব্যয় যোগ করুন', exact: true }).click();
      await page.locator('[role=dialog]').waitFor();
      assert(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter === 'auto'), 'Modal removes the viewport gutter');
      assert(await page.locator('[role=dialog]').evaluate(el => Math.abs(el.parentElement.getBoundingClientRect().right - innerWidth) < 1), 'Backdrop covers the viewport edge');
      assert(await page.locator('[role=dialog] [name=expenseDate]').evaluate(el => el === document.activeElement), 'Initial focus');
      await page.screenshot({ path: join(output, `dialog-${locale}-${width}.png`), fullPage: false });
      await page.keyboard.press('Escape');
      assert(await page.locator('[role=dialog]').count() === 0, 'Escape dismissal');
      console.log(`PASS expenses and dialog ${locale} ${width}px`);
    }
  }
  await page.evaluate(() => sessionStorage.setItem('locale', 'en')); await page.goto('http://127.0.0.1:4188/expenses');
  await page.locator('#expense-filters [name=query]').fill('draft');
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForURL(/page=2/);
  assert(await page.locator('#expense-filters [name=query]').inputValue() === 'draft', 'Draft preserved across pagination');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await page.waitForURL(/query=draft/);
  await page.goBack(); await page.waitForURL(/page=2/); assert(await page.locator('#expense-filters [name=query]').inputValue() === '', 'Back restores applied filters');
  await page.goForward(); await page.waitForURL(/query=draft/); assert(await page.locator('#expense-filters [name=query]').inputValue() === 'draft', 'Forward restores filters');
  await page.locator('#expense-filters').getByRole('button', { name: 'Reset', exact: true }).click(); await page.waitForURL('http://127.0.0.1:4188/expenses');
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  assert(await page.locator('[role=dialog] [name=categoryId]').evaluate(el => document.activeElement === el), 'Invalid field focus');
  await page.locator('[role=dialog] [name=categoryId]').selectOption('rent'); await page.locator('[role=dialog] [name=description]').fill('Reject'); await page.locator('[role=dialog] [name=amount]').fill('12.50');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  assert(await page.getByRole('button', { name: 'Cancel', exact: true }).isDisabled(), 'Cancel blocked during save');
  await page.keyboard.press('Escape'); assert(await page.locator('[role=dialog]').count() === 1, 'Escape blocked during save');
  await page.locator('[role=dialog] [role=alert]').waitFor(); assert(await page.locator('[role=dialog] [name=description]').inputValue() === 'Reject', 'Rejected input retained');
  await page.locator('[role=dialog] [name=description]').fill('Valid rent'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.locator('[role=dialog]').getByText('EXP-2026-99999', { exact: true }).waitFor();
  await page.locator('[role=dialog]').getByText('Close', { exact: true }).click();
  await page.locator('[role=dialog]').waitFor({ state: 'detached' });
  assert(!errors.length, errors.join('\n'));
  console.log(`PASS navigation, keyboard, rejection, pending and success. Screenshots: ${output}`);
} finally { await browser?.close(); await server.close(); }
