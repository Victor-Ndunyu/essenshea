export function parseOwnerConfirmation(text: string): { confirmed: boolean; command: string } {
  const clean = text.trim();
  if (!clean.toLowerCase().startsWith('/confirm ')) return { confirmed: false, command: clean };
  return { confirmed: true, command: clean.slice(9).trim() };
}
