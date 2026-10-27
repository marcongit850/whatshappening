/**
 * Public door catalog. States and counties live in this one file.
 * Add a county by appending one line to COUNTIES. Walton is the only live county.
 * A county with live: false gets a coming soon page and a request form.
 * A live county also needs href, the taxes-host path of its budget pages.
 */

/** Square state map. Positions are a simplified layout, not a scale map. */
export interface UsState {
  abbr: string;
  name: string;
  slug: string;
  col: number;
  row: number;
}

export interface CountyPlace {
  stateSlug: string;
  slug: string;
  name: string;
  live: boolean;
  href?: string;
}

export const COUNTIES: CountyPlace[] = [
  { stateSlug: "florida", slug: "walton", name: "Walton County", live: true, href: "/walton" },
];

export const US_STATES: UsState[] = [
  { abbr: "AK", name: "Alaska", slug: "alaska", col: 0, row: 0 },
  { abbr: "ME", name: "Maine", slug: "maine", col: 10, row: 0 },
  { abbr: "WI", name: "Wisconsin", slug: "wisconsin", col: 5, row: 1 },
  { abbr: "VT", name: "Vermont", slug: "vermont", col: 9, row: 1 },
  { abbr: "NH", name: "New Hampshire", slug: "new-hampshire", col: 10, row: 1 },
  { abbr: "WA", name: "Washington", slug: "washington", col: 0, row: 2 },
  { abbr: "ID", name: "Idaho", slug: "idaho", col: 1, row: 2 },
  { abbr: "MT", name: "Montana", slug: "montana", col: 2, row: 2 },
  { abbr: "ND", name: "North Dakota", slug: "north-dakota", col: 3, row: 2 },
  { abbr: "MN", name: "Minnesota", slug: "minnesota", col: 4, row: 2 },
  { abbr: "IL", name: "Illinois", slug: "illinois", col: 5, row: 2 },
  { abbr: "MI", name: "Michigan", slug: "michigan", col: 6, row: 2 },
  { abbr: "NY", name: "New York", slug: "new-york", col: 8, row: 2 },
  { abbr: "MA", name: "Massachusetts", slug: "massachusetts", col: 9, row: 2 },
  { abbr: "OR", name: "Oregon", slug: "oregon", col: 0, row: 3 },
  { abbr: "NV", name: "Nevada", slug: "nevada", col: 1, row: 3 },
  { abbr: "WY", name: "Wyoming", slug: "wyoming", col: 2, row: 3 },
  { abbr: "SD", name: "South Dakota", slug: "south-dakota", col: 3, row: 3 },
  { abbr: "IA", name: "Iowa", slug: "iowa", col: 4, row: 3 },
  { abbr: "IN", name: "Indiana", slug: "indiana", col: 5, row: 3 },
  { abbr: "OH", name: "Ohio", slug: "ohio", col: 6, row: 3 },
  { abbr: "PA", name: "Pennsylvania", slug: "pennsylvania", col: 7, row: 3 },
  { abbr: "NJ", name: "New Jersey", slug: "new-jersey", col: 8, row: 3 },
  { abbr: "CT", name: "Connecticut", slug: "connecticut", col: 9, row: 3 },
  { abbr: "RI", name: "Rhode Island", slug: "rhode-island", col: 10, row: 3 },
  { abbr: "CA", name: "California", slug: "california", col: 0, row: 4 },
  { abbr: "UT", name: "Utah", slug: "utah", col: 1, row: 4 },
  { abbr: "CO", name: "Colorado", slug: "colorado", col: 2, row: 4 },
  { abbr: "NE", name: "Nebraska", slug: "nebraska", col: 3, row: 4 },
  { abbr: "MO", name: "Missouri", slug: "missouri", col: 4, row: 4 },
  { abbr: "KY", name: "Kentucky", slug: "kentucky", col: 5, row: 4 },
  { abbr: "WV", name: "West Virginia", slug: "west-virginia", col: 6, row: 4 },
  { abbr: "VA", name: "Virginia", slug: "virginia", col: 7, row: 4 },
  { abbr: "MD", name: "Maryland", slug: "maryland", col: 8, row: 4 },
  { abbr: "DE", name: "Delaware", slug: "delaware", col: 9, row: 4 },
  { abbr: "AZ", name: "Arizona", slug: "arizona", col: 1, row: 5 },
  { abbr: "NM", name: "New Mexico", slug: "new-mexico", col: 2, row: 5 },
  { abbr: "KS", name: "Kansas", slug: "kansas", col: 3, row: 5 },
  { abbr: "AR", name: "Arkansas", slug: "arkansas", col: 4, row: 5 },
  { abbr: "TN", name: "Tennessee", slug: "tennessee", col: 5, row: 5 },
  { abbr: "NC", name: "North Carolina", slug: "north-carolina", col: 6, row: 5 },
  { abbr: "SC", name: "South Carolina", slug: "south-carolina", col: 7, row: 5 },
  { abbr: "OK", name: "Oklahoma", slug: "oklahoma", col: 3, row: 6 },
  { abbr: "LA", name: "Louisiana", slug: "louisiana", col: 4, row: 6 },
  { abbr: "MS", name: "Mississippi", slug: "mississippi", col: 5, row: 6 },
  { abbr: "AL", name: "Alabama", slug: "alabama", col: 6, row: 6 },
  { abbr: "GA", name: "Georgia", slug: "georgia", col: 7, row: 6 },
  { abbr: "HI", name: "Hawaii", slug: "hawaii", col: 0, row: 7 },
  { abbr: "TX", name: "Texas", slug: "texas", col: 3, row: 7 },
  { abbr: "FL", name: "Florida", slug: "florida", col: 8, row: 7 },
];

export const LIVE_STATE_SLUG = COUNTIES.find((county) => county.live)?.stateSlug ?? "";

export function stateBySlug(slug: string): UsState | undefined {
  return US_STATES.find((state) => state.slug === slug);
}

export function isLiveState(state: UsState): boolean {
  return COUNTIES.some((county) => county.live && county.stateSlug === state.slug);
}

export function countiesIn(stateSlug: string): CountyPlace[] {
  return COUNTIES.filter((county) => county.stateSlug === stateSlug);
}

export function countyByPath(stateSlug: string, countySlug: string): CountyPlace | undefined {
  return COUNTIES.find((county) => county.stateSlug === stateSlug && county.slug === countySlug);
}

export function countyHref(county: CountyPlace): string {
  if (county.live && county.href) return county.href;
  return `/${county.stateSlug}/${county.slug}`;
}

export function liveCounties(): CountyPlace[] {
  return COUNTIES.filter((county) => county.live);
}
