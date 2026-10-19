export function parseOwnerActionApproval(text: string): { action: 'confirm' | 'cancel'; token: string } | null {
  const match = text.trim().match(/^\/(confirm|cancel)\s+([A-Z0-9]{8})$/i);
  if (!match) return null;
  return { action: match[1].toLowerCase() as 'confirm' | 'cancel', token: match[2].toUpperCase() };
}

export function parseNaturalOwnerMutation(text: string): string | null {
  const clean = text.trim().replace(/\s+/g, ' ').replace(/^(?:please\s+)?(?:i (?:want|would like|need) (?:you )?to|(?:can|could|would) (?:you|we))\s+/i, '').replace(/^please\s+/i, '').replace(/[.!?]+$/, '');
  let match = clean.match(/^(?:set|change|update)\s+(?:the\s+)?category\s+(?:of|for)\s+(.+?)\s+to\s+(?:the\s+)?(.+?)(?:\s+category)?$/i);
  if (match) return '/edit ' + match[1].trim() + ' | category=' + match[2].trim();
  match = clean.match(/^(?:set|change|update)\s+(?:the\s+)?price\s+(?:of|for)\s+(.+?)\s+to\s+((?:(?:ksh|kes)\s*)?[\d,.]+|price on request)$/i);
  if (match) return '/edit ' + match[1].trim() + ' | price=' + match[2];
  match = clean.match(/^(?:move|change|transfer)\s+(?:the\s+)?(.+?)\s+from\s+.+?\s+to\s+(?:the\s+)?(.+?)(?:\s+category)?$/i);
  if (match) return '/edit ' + match[1].trim() + ' | category=' + match[2].trim();
  match = clean.match(/^move\s+(?:the\s+)?(.+?)\s+to\s+(?:the\s+)?(.+?)(?:\s+category)?$/i);
  if (match) return '/edit ' + match[1].trim() + ' | category=' + match[2].trim();
  match = clean.match(/^(?:rename|change the name of)\s+(.+?)\s+to\s+(.+)$/i);
  if (match) return '/edit ' + match[1].trim() + ' | name=' + match[2].trim();
  match = clean.match(/^(?:set|change|update)\s+(?:the\s+)?stock\s+(?:of|for)\s+(.+?)\s+(?:to|at)\s+(\d+)$/i)
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


export function parseNaturalOwnerApproval(text: string): 'confirm' | 'cancel' | null {
  const clean = text.toLowerCase().trim().replace(/[.!]+$/, '').replace(/\s+/g, ' ');
  if (/^(?:yes(?: please)?|proceed(?: please)?|please proceed|go ahead|approve(?: it| the change)?|confirm(?: it| the change)?|i (?:want|would like) to proceed)$/.test(clean)) return 'confirm';
  if (/^(?:cancel(?: it| the change)?|never mind|nevermind|do not proceed|don't proceed)$/.test(clean)) return 'cancel';
  return null;
}

export function looksLikeOwnerMutation(text: string): boolean {
  const clean = text.trim().replace(/^(?:please\s+)?(?:i (?:want|would like|need) (?:you )?to|(?:can|could|would) (?:you|we))\s+/i, '').replace(/^please\s+/i, '');
  return /^(?:move|change|update|edit|set|rename|transfer|hide|restore|remove|replace|add|delete|mark|reorganise|reorganize)\b/i.test(clean);
}

export function ownerErrorReply(error: unknown, confirming: boolean): string {
  const message = error instanceof Error ? error.message : '';
  // Preserve actionable validation, not arbitrary SQL, transport or credential errors.
  if (/^(?:Order change:|Use(?: |:)|Choose an existing category:|I could not find |That name matches |This product changed |Another product already |Stock must |Stock is too |Price must |Each (?:change|size|variant) |Product names must |Keep the description |Concern choices:|Unknown field |Availability must |Visibility must |The edit was saved but website verification failed)/.test(message)) return message;
  if (confirming) return 'I could not verify the result of that approval. Check /activity, then verify the product with /describe Product Name or the review with /reviews before repeating the edit. I will not claim it succeeded or apply it again automatically.';
  return 'I could not complete that request because the saved business data is unavailable. Please try again shortly. For an edit, resend the full product name and proposed change to get a fresh preview.';
}
