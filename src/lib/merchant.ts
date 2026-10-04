const NOISE = new Set([
  'pvt', 'ltd', 'limited', 'private', 'store', 'stores', 'mart', 'llc', 'inc', 'co',
  'the', 'pk', 'pakistan', 'branch', 'outlet', 'www', 'com',
]);

/**
 * Normalises a merchant name so that "TESCO STORES 2041", "Tesco" and
 * "tesco-stores" share a key for merchant memory and duplicate checks.
 */
export function merchantKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NOISE.has(w));
  return words.slice(0, 3).join(' ');
}
