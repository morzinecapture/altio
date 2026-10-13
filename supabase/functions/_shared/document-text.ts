/** Safe text content for both HTML and XML documents. Never used for markup. */
export function escapeDocumentText(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
export function escapePartyFields<T extends Record<string, any>>(party: T | null): T | null {
  if (!party) return party;
  return Object.fromEntries(Object.entries(party).map(([key,value]) => [key, typeof value === 'string' ? escapeDocumentText(value) : value])) as T;
}
