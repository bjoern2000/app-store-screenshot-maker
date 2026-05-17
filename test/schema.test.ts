import { describe, it, expect } from "vitest";
import {
  CanvasIdSchema,
  LocaleSchema,
  ManifestSchema,
  CanvasEntrySchema,
} from "../src/project/schema.js";

describe("CanvasIdSchema", () => {
  it.each([["hero"], ["feature-1"], ["a_b_c"], ["m1"]])("accepts %s", (id) => {
    expect(() => CanvasIdSchema.parse(id)).not.toThrow();
  });

  it.each([[""], ["UPPER"], ["-leading"], ["spaces here"], ["with/slash"]])(
    "rejects %s",
    (id) => {
      expect(() => CanvasIdSchema.parse(id)).toThrow();
    },
  );
});

describe("LocaleSchema", () => {
  it.each([["en"], ["de"], ["ja"], ["en-US"], ["pt-BR"]])("accepts %s", (l) => {
    expect(() => LocaleSchema.parse(l)).not.toThrow();
  });

  it.each([["EN"], ["en_US"], ["english"], ["e"]])("rejects %s", (l) => {
    expect(() => LocaleSchema.parse(l)).toThrow();
  });
});

describe("CanvasEntrySchema", () => {
  it("accepts a well-formed entry", () => {
    const e = CanvasEntrySchema.parse({
      id: "hero",
      platform: "app_store",
      device: "iphone",
      order: 0,
    });
    expect(e.id).toBe("hero");
  });

  it("rejects unknown platforms", () => {
    expect(() =>
      CanvasEntrySchema.parse({
        id: "hero",
        platform: "windows_store",
        device: "iphone",
        order: 0,
      }),
    ).toThrow();
  });
});

describe("ManifestSchema", () => {
  it("fills defaults from a minimal input", () => {
    const m = ManifestSchema.parse({ version: 1 });
    expect(m.locales).toEqual(["en"]);
    expect(m.defaultLocale).toBe("en");
    expect(m.canvases).toEqual([]);
  });
});
