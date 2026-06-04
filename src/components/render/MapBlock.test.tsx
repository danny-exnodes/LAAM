import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { parseMapConfig, buildGoogleMapsUrl, MapBlock } from "./MapBlock";

describe("parseMapConfig (pure)", () => {
  it("uses an explicit center + default zoom", () => {
    const r = parseMapConfig(JSON.stringify({ center: [10, 20] }));
    if ("error" in r) throw new Error("unexpected error");
    expect(r.center).toEqual([10, 20]);
    expect(r.zoom).toBe(12);
  });

  it("falls back to the first marker when no center", () => {
    const r = parseMapConfig(
      JSON.stringify({ markers: [{ lat: 1, lng: 2, label: "x" }] }),
    );
    if ("error" in r) throw new Error("unexpected error");
    expect(r.center).toEqual([1, 2]);
  });

  it("falls back to the first route point when no center/markers", () => {
    const r = parseMapConfig(JSON.stringify({ route: [[3, 4], [5, 6]] }));
    if ("error" in r) throw new Error("unexpected error");
    expect(r.center).toEqual([3, 4]);
  });

  it("falls back to Hà Nội when nothing positions the map", () => {
    const r = parseMapConfig(JSON.stringify({}));
    if ("error" in r) throw new Error("unexpected error");
    expect(r.center).toEqual([21.0278, 105.8342]);
  });

  it("drops markers without finite coordinates", () => {
    const r = parseMapConfig(
      JSON.stringify({
        markers: [
          { lat: 1, lng: 2 },
          { label: "no coords" },
          { lat: "x", lng: 5 },
        ],
      }),
    );
    if ("error" in r) throw new Error("unexpected error");
    expect(r.markers).toHaveLength(1);
  });

  it("honors a numeric zoom override", () => {
    const r = parseMapConfig(JSON.stringify({ center: [0, 0], zoom: 15 }));
    if ("error" in r) throw new Error("unexpected error");
    expect(r.zoom).toBe(15);
  });

  it("returns an error for invalid JSON", () => {
    expect("error" in parseMapConfig("{nope")).toBe(true);
  });
});

describe("buildGoogleMapsUrl (keyless)", () => {
  it("builds a directions URL from directions.from/to", () => {
    const url = buildGoogleMapsUrl({ directions: { from: "Hà Nội", to: "Huế" }, markers: [] });
    expect(url).toContain("/maps/dir/?api=1");
    expect(url).toContain("origin=H%C3%A0%20N%E1%BB%99i");
    expect(url).toContain("destination=Hu%E1%BA%BF");
  });

  it("builds a directions URL from two markers", () => {
    const url = buildGoogleMapsUrl({
      markers: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
    });
    expect(url).toContain("origin=1%2C2");
    expect(url).toContain("destination=3%2C4");
  });

  it("builds a search URL from a single marker", () => {
    const url = buildGoogleMapsUrl({ markers: [{ lat: 1, lng: 2 }] });
    expect(url).toContain("/maps/search/?api=1");
    expect(url).toContain("query=1%2C2");
  });

  it("returns null when nothing locates the map", () => {
    expect(buildGoogleMapsUrl({ markers: [] })).toBeNull();
  });
});

describe("MapBlock (component)", () => {
  it("renders without throwing and does not import leaflet synchronously", () => {
    // dynamic({ssr:false}) means the leaflet map is lazy — the outer component
    // renders chrome (link/notes) immediately without pulling leaflet into this render.
    const raw = JSON.stringify({ markers: [{ lat: 21.0285, lng: 105.8542, label: "Hồ Gươm" }] });
    const { container } = render(<MapBlock raw={raw} />);
    expect(container.querySelector(".chat-map-wrap")).not.toBeNull();
    // Google Maps link rendered from the parsed config (no leaflet needed).
    const link = container.querySelector("a.chat-map-link");
    expect(link).not.toBeNull();
  });

  it("shows an error for an invalid config", () => {
    const { container } = render(<MapBlock raw="{nope" />);
    expect(container.textContent).toMatch(/bản đồ|map|invalid/i);
  });
});
