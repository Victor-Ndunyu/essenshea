export function cleanReviewText(value: unknown): string {
  return String(value || '').trim().slice(0, 2000)
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F\uFFFD\u25A1]/g, ' ')
    .replace(/!{3,}/g, '!!')
    .replace(/\?{3,}/g, '??')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])(?!\s|$)/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

