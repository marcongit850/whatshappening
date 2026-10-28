import { describe, expect, it } from "vitest";
import { COUNTY_MAPS, STATE_MAP } from "../src/geo/registry";
import { COUNTIES, US_STATES, countiesIn, countyByPath, countyHref } from "../src/places";

describe("census map geometry", () => {
  it("draws 50 states and the District of Columbia from path data", () => {
    expect(STATE_MAP.states).toHaveLength(51);
    expect(US_STATES).toHaveLength(51);
    expect(STATE_MAP.viewBox.startsWith("0 0 ")).toBe(true);
    expect(STATE_MAP.insets.some((inset) => inset.id === "dc")).toBe(true);
    for (const shape of STATE_MAP.states) {
      expect(shape.d.startsWith("M"), shape.slug).toBe(true);
      expect(shape.d, shape.slug).not.toMatch(/[<>"']/);
    }
    for (const abbr of ["AK", "HI", "FL", "DC", "TX", "LA", "VA", "RI", "DE"]) {
      expect(STATE_MAP.states.some((state) => state.abbr === abbr)).toBe(true);
    }
    expect(STATE_MAP.states.find((state) => state.abbr === "RI")?.hit).toBeTruthy();
    expect(STATE_MAP.states.find((state) => state.abbr === "DC")?.d.length).toBeGreaterThan(40);
  });

  it("keeps Florida county shapes and leaves other states without a county map", () => {
    expect(Object.keys(COUNTY_MAPS)).toEqual(["florida"]);
    const florida = COUNTY_MAPS.florida;
    expect(florida.counties).toHaveLength(67);
    const slugs = florida.counties.map((county) => county.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const county of florida.counties) {
      expect(county.d.startsWith("M"), county.slug).toBe(true);
      expect(county.name, county.slug).not.toMatch(/\u2014|\u2013/);
    }
    expect(countiesIn("florida")).toHaveLength(67);
    expect(COUNTIES.filter((county) => county.live)).toHaveLength(1);
    expect(countyHref(countyByPath("florida", "walton")!)).toBe("/walton");
    expect(countyByPath("florida", "okaloosa")?.live).toBe(false);
    expect(countyHref(countyByPath("florida", "okaloosa")!)).toBe("/florida/okaloosa");
    const [boxW, boxH] = florida.viewBox.replace("0 0 ", "").split(" ").map(Number);
    expect(boxW).toBeGreaterThan(boxH);
    const walton = florida.counties.find((county) => county.slug === "walton");
    const monroe = florida.counties.find((county) => county.slug === "monroe");
    expect(walton?.label?.ax).toBeTypeOf("number");
    expect(walton?.hit?.r).toBeGreaterThan(10);
    expect((monroe?.d.length || 0)).toBeGreaterThan(80);
    for (const slug of ["texas", "alaska", "hawaii", "louisiana", "virginia", "district-of-columbia"]) {
      expect(COUNTY_MAPS[slug], slug).toBeUndefined();
      expect(countiesIn(slug), slug).toEqual([]);
    }
  });
});
