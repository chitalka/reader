function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function inlineFootnoteText(referenceText: string, noteText: string): string {
  const reference = referenceText.trim().replace(/^[\s[(]+|[\s)\]]+$/gu, '');
  const text = noteText.trim();
  if (!reference) return text;

  const repeatedReference = new RegExp(`^${escapeRegExp(reference)}(?:[.\\s]+|$)`, 'u');
  const body = text.replace(repeatedReference, '').trim();
  return body ? `${reference}. ${body}` : `${reference}.`;
}
