export function parseOwnerActionApproval(text: string): { action: 'confirm' | 'cancel'; token: string } | null {
  const match = text.trim().match(/^\/(confirm|cancel)\s+([A-Z0-9]{8})$/i);
  if (!match) return null;
  return { action: match[1].toLowerCase() as 'confirm' | 'cancel', token: match[2].toUpperCase() };
}

export function parseNaturalOwnerMutation(text: string): string | null {
  const clean = text.trim().replace(/\s+/g, ' ');
  let match = clean.match(/^(?:set|change|update)\s+(?:the\s+)?stock\s+(?:of|for)\s+(.+?)\s+(?:to|at)\s+(\d+)$/i)
    || clean.match(/^(?:set|change|update)\s+(.+?)['’]?s?\s+stock\s+(?:to|at)\s+(\d+)$/i);
  if (match) return `/stock ${match[1].trim()} | ${match[2]}`;

  match = clean.match(/^mark\s+(.+?)\s+as\s+available\s+by\s+order$/i);
  if (match) return `/order ${match[1].trim()}`;
  match = clean.match(/^mark\s+(.+?)\s+as\s+available\s+now$/i);
  if (match) return `/availablenow ${match[1].trim()}`;
  match = clean.match(/^(?:hide|remove)\s+(?:product\s+)?(.+?)\s+(?:from\s+(?:the\s+)?(?:shop|site|catalogue|catalog))$/i);
  if (match) return `/hide ${match[1].trim()}`;
  match = clean.match(/^restore\s+(?:product\s+)?(.+?)(?:\s+to\s+(?:the\s+)?(?:shop|site|catalogue|catalog))?$/i)
    || clean.match(/^show\s+product\s+(.+?)\s+(?:on|in)\s+(?:the\s+)?(?:shop|site|catalogue|catalog)$/i);
  if (match) return `/show ${match[1].trim()}`;
  match = clean.match(/^(?:set|change|update|replace)\s+(?:the\s+)?description\s+(?:of|for)\s+(.+?)\s+to\s+(.+)$/i);
  if (match) return `/setdesc ${match[1].trim()} | ${match[2].trim()}`;
  return null;
}

export function ownerLowStockThreshold(value = process.env.OWNER_LOW_STOCK_THRESHOLD): number {
  const parsed = Number.parseInt(value || '3', 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 3;
}
