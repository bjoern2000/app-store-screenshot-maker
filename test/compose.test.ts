import { describe, it, expect } from "vitest";
import { substitute, composeHtml } from "../src/render/compose.js";

describe("substitute", () => {
  it("replaces known tokens", () => {
    const r = substitute("Hello {{t.name}}!", { name: "world" });
    expect(r.text).toBe("Hello world!");
    expect(r.missingKeys).toEqual([]);
  });

  it("leaves unknown tokens visible and reports them", () => {
    const r = substitute("Hi {{t.missing}}", {});
    expect(r.text).toBe("Hi {{t.missing}}");
    expect(r.missingKeys).toEqual(["missing"]);
  });

  it("handles whitespace and digits inside the token", () => {
    const r = substitute("<p>{{ t.feature_1 }}</p>", { feature_1: "X" });
    expect(r.text).toBe("<p>X</p>");
  });

  it("dedupes missing key reports", () => {
    const r = substitute("{{t.a}}{{t.a}}{{t.a}}", {});
    expect(r.missingKeys).toEqual(["a"]);
  });
});

describe("composeHtml", () => {
  it("includes the base href, locale, and substituted body", () => {
    const { html, missingKeys } = composeHtml({
      canvasHtml: "<h1>{{t.title}}</h1>",
      locale: "en",
      strings: { title: "Hello" },
      baseHref: "file:///tmp/proj/",
    });
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/<base href="file:\/\/\/tmp\/proj\/">/);
    expect(html).toMatch(/<h1>Hello<\/h1>/);
    expect(missingKeys).toEqual([]);
  });

  it("escapes dangerous attribute values in baseHref/locale", () => {
    const { html } = composeHtml({
      canvasHtml: "<p>x</p>",
      locale: 'en"><script>',
      strings: {},
      baseHref: 'file:///"a',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain("&quot;");
  });
});
