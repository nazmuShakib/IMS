/** Calendar year used by shop-facing document numbers. */
export function dhakaYear(value: Date): number {
  return Number(new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
  }).format(value));
}
