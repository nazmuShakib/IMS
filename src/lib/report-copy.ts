import type { Locale } from './i18n/config';
const copy = {
  stockValue: ['Stock value', 'মজুতের মূল্য'],
  onHand: ['Units on hand', 'মজুত ইউনিট'],
  received: ['Units received', 'প্রাপ্ত ইউনিট'],
  overallMargin: ['Overall margin', 'সামগ্রিক লাভের হার'],
  shrinkageValue: ['Total shrinkage value', 'মোট ক্ষতির মূল্য'],
  valuationBasis: [
    'Current stock: quantity items at average cost; serialized items at individual cost.',
    'বর্তমান মজুত: পরিমাণভিত্তিক পণ্য গড় খরচে এবং সিরিয়ালভিত্তিক পণ্য নিজস্ব খরচে।',
  ],
  select: ['Report', 'প্রতিবেদন'],
  export: ['Export', 'এক্সপোর্ট'],
  more: ['More filters', 'আরও ফিল্টার'],
  chart: ['Chart', 'চার্ট'],
  hide: ['Hide chart', 'চার্ট লুকান'],
  show: ['Show chart', 'চার্ট দেখান'],
  data: ['View chart data', 'চার্টের তথ্য দেখুন'],
  top: ['Showing {count} of {total}', '{total}টির মধ্যে {count}টি দেখানো হচ্ছে'],
  emptyChart: [
    'No nonzero values to chart for these filters.',
    'এই ফিল্টারে চার্টে দেখানোর মতো অশূন্য মান নেই।',
  ],
  range: ['Chart range', 'চার্টের পরিসর'],
  productSearch: ['Search products', 'পণ্য খুঁজুন'],
  searchProduct: ['Search by product name or SKU', 'পণ্যের নাম বা SKU দিয়ে খুঁজুন'],
  lookupError: ['Product search failed. Try again.', 'পণ্য খোঁজা যায়নি। আবার চেষ্টা করুন।'],
  invalid: [
    'Enter valid dates with the end on or after the start.',
    'সঠিক তারিখ দিন; শেষ তারিখ শুরুর আগে হতে পারবে না।',
  ],
  retry: ['Try again', 'আবার চেষ্টা করুন'],
  error: ['Unable to load this report.', 'প্রতিবেদন লোড করা যায়নি।'],
  back: ['Back to reports', 'প্রতিবেদনে ফিরুন'],
  days: ['days', 'দিন'],
  added: ['Units added', 'যোগ হওয়া ইউনিট'],
  removed: ['Units removed', 'সরানো ইউনিট'],
  net: ['Net change', 'নিট পরিবর্তন'],
  agedValue: ['Value aged 91+ days', '৯১+ দিনের মজুত মূল্য'],
  actual: [
    'Dates use actual sale time · Asia/Dhaka',
    'তারিখ প্রকৃত বিক্রয়ের সময় অনুযায়ী · এশিয়া/ঢাকা',
  ],
  recorded: ['Dates use recorded time · Asia/Dhaka', 'তারিখ রেকর্ডের সময় অনুযায়ী · এশিয়া/ঢাকা'],
  current: [
    'Current stock · Bulk ages are estimated using FIFO; values use current average cost.',
    'বর্তমান মজুত · পরিমাণভিত্তিক পণ্যের বয়স FIFO অনুযায়ী আনুমানিক; মূল্য বর্তমান গড় খরচ অনুযায়ী।',
  ],
  receipts: [
    'Receipts at cost, adjusted by corrections. This is not cash paid or supplier-return settlements.',
    'সংশোধন সমন্বয় করে খরচমূল্যে প্রাপ্ত মজুত। এটি নগদ পরিশোধ বা সরবরাহকারী ফেরত নিষ্পত্তি নয়।',
  ],
  allData: ['All recorded data', 'সব রেকর্ডকৃত তথ্য'],
  filters: ['Applied filters', 'প্রয়োগ করা ফিল্টার'],
  totals: ['Summary', 'সারসংক্ষেপ'],
  page: ['Page', 'পৃষ্ঠা'],
  clear: ['Clear product', 'পণ্য মুছুন'],
  start: ['Start period', 'শুরুর সময়কাল'],
  end: ['End period', 'শেষ সময়কাল'],
} as const;
export type ReportTextKey = keyof typeof copy;
export function reportText(
  locale: Locale,
  key: ReportTextKey,
  values: Record<string, string | number> = {},
) {
  let value: string = copy[key][locale === 'bn' ? 1 : 0];
  for (const [k, v] of Object.entries(values)) value = value.replaceAll(`{${k}}`, String(v));
  return value;
}
const enums: Record<string, readonly [string, string]> = {
  INTERNAL_USE: ['Internal use', 'অভ্যন্তরীণ ব্যবহার'],
  SHOP_USE: ['Shop use', 'দোকানের ব্যবহার'],
  GIFT: ['Gift', 'উপহার'],
  STOCK_COUNT: ['Stock count', 'মজুত গণনা'],
  IN: ['Stock in', 'মজুত যোগ'],
  OUT: ['Stock out', 'মজুত বিয়োগ'],
  ADJUST: ['Adjustment', 'সমন্বয়'],
  PURCHASE: ['Purchase', 'ক্রয়'],
  SALE: ['Sale', 'বিক্রয়'],
  CUSTOMER_RETURN: ['Customer return', 'ক্রেতার ফেরত'],
  RETURN_TO_SUPPLIER: ['Return to supplier', 'সরবরাহকারীকে ফেরত'],
  DAMAGE: ['Damage', 'ক্ষতি'],
  LOSS: ['Loss', 'হারানো'],
  INITIAL_STOCK: ['Initial stock', 'প্রারম্ভিক মজুত'],
  CORRECTION: ['Correction', 'সংশোধন'],
  TRADE_IN: ['Trade-in', 'বিনিময়'],
  WARRANTY_REPLACEMENT: ['Warranty replacement', 'ওয়ারেন্টি প্রতিস্থাপন'],
  WARRANTY_RETURN: ['Warranty return', 'ওয়ারেন্টি ফেরত'],
  __report_unbranded: ['Unbranded', 'ব্র্যান্ডবিহীন'],
  __report_unknown: ['Unknown', 'অজানা'],
  __report_unknownSupplier: ['Unknown supplier', 'অজানা সরবরাহকারী'],
  __report_noSupplier: ['No supplier', 'সরবরাহকারী নেই'],
  __report_unknownUser: ['Unknown user', 'অজানা ব্যবহারকারী'],
  __report_system: ['System', 'সিস্টেম'],
};
export function reportEnum(locale: Locale, value: string) {
  return enums[value]?.[locale === 'bn' ? 1 : 0] ?? value.replaceAll('_', ' ');
}
