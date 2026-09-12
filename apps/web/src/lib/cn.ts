/** Junta classes ignorando `false`, `null` e `undefined`. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
