import { describe, expect, it } from "vitest";
import { geocodeLabel } from "../src/routes/geo.js";

describe("geocodeLabel", () => {
  it("combines street and locality into a place label", () => {
    const r = geocodeLabel({ street: "Great Nag Road", locality: "Nandanvan", city: "Nagpur" });
    expect(r).toEqual({ label: "Great Nag Road, Nandanvan", road: "Great Nag Road", area: "Nandanvan" });
  });

  it("prefers locality over city when both exist", () => {
    const r = geocodeLabel({ street: "Great Nag Rd", locality: "Nandanvan", city: "Nagpur" });
    expect(r.label).toBe("Great Nag Rd, Nandanvan");
    expect(r.area).toBe("Nandanvan");
  });

  it("falls back to city or state when there is no street", () => {
    expect(geocodeLabel({ city: "Nagpur" }).label).toBe("Nagpur");
    expect(geocodeLabel({ state: "Maharashtra" }).label).toBe("Maharashtra");
  });

  it("returns nulls when the geocoder gives nothing useful", () => {
    expect(geocodeLabel({})).toEqual({ label: null, road: null, area: null });
    expect(geocodeLabel({ name: "Some POI" }).label).toBe("Some POI");
  });
});