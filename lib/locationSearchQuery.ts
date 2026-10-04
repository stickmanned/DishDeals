// Search text only: never rewrite the reviewed address or infer coordinates/locality.
// A restaurant's branding can overconstrain geocoding when a numbered street address is available.
const numberedStreet = /^\d+[a-z]?(?:\s*[-–]\s*\d+[a-z]?)?\s+.+/iu;
const streetEnding = /(?:\b(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|court|ct|place|pl|crescent|cres|terrace|ter|trail|trl|lane|ln|highway|hwy|parkway|pkwy)|\p{L}*way)\.?$/iu;

/** Remove leading business labels only when a later comma-delimited segment is clearly a street address. */
export function addressSearchQuery(value: string): string {
  const trimmed = value.trim().replace(/\s+/gu, " ");
  const parts = trimmed.split(",").map(part => part.trim());
  const street = parts.findIndex(part => numberedStreet.test(part) && streetEnding.test(part));
  return street > 0 ? parts.slice(street).join(", ") : trimmed;
}

/** Prefer the supplied address; a name-only source stays searchable without an invented address. */
export function defaultLocationSearchQuery(restaurant: string, address: string | null): string {
  return address?.trim() ? addressSearchQuery(address) : restaurant.trim();
}
