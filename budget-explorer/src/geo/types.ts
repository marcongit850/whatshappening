export type CountyKind =
  | "county"
  | "parish"
  | "borough"
  | "census-area"
  | "municipality"
  | "city"
  | "city-borough"
  | "district";

export interface CountyShape {
  fips: string;
  slug: string;
  name: string;
  kind: CountyKind;
  d: string;
  label?: { x: number; y: number };
  hit?: StateHit;
}

export interface CountyFile {
  viewBox: string;
  counties: CountyShape[];
}

export interface StateHit {
  cx: number;
  cy: number;
  r: number;
}

export interface StateShape {
  fips: string;
  abbr: string;
  name: string;
  slug: string;
  d: string;
  box: { x: number; y: number; w: number; h: number };
  hit?: StateHit;
}

export interface MapInset {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StateMapFile {
  viewBox: string;
  insets: MapInset[];
  states: StateShape[];
}
