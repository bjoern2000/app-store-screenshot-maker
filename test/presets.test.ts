import { describe, it, expect } from "vitest";
import { dimensionsFor, DEFAULT_DIMENSIONS } from "../src/render/presets.js";
import type { Manifest } from "../src/project/schema.js";

function baseManifest(): Manifest {
  return { version: 1, locales: ["en"], defaultLocale: "en", canvases: [] };
}

describe("dimensionsFor", () => {
  it("returns the App Store iPhone default", () => {
    const d = dimensionsFor(baseManifest(), "app_store", "iphone");
    expect(d).toEqual(DEFAULT_DIMENSIONS.app_store.iphone);
    expect(d.width).toBe(1320);
    expect(d.height).toBe(2868);
  });

  it("returns the Play Store android phone default", () => {
    const d = dimensionsFor(baseManifest(), "play_store", "android_phone");
    expect(d.width).toBe(1080);
    expect(d.height).toBe(1920);
  });

  it("respects per-manifest overrides", () => {
    const m: Manifest = {
      ...baseManifest(),
      dimensions: { app_store: { iphone: { width: 100, height: 200 } } },
    };
    expect(dimensionsFor(m, "app_store", "iphone")).toEqual({ width: 100, height: 200 });
    // unrelated entry still hits default
    expect(dimensionsFor(m, "play_store", "android_phone").width).toBe(1080);
  });
});
