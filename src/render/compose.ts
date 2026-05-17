import type { LocaleStrings } from "../project/locales.js";

const TOKEN_RE = /\{\{\s*t\.([a-zA-Z0-9_]+)\s*\}\}/g;

export interface SubstituteResult {
  text: string;
  missingKeys: string[];
}

/**
 * Replace {{t.key}} tokens with their localized value.
 * Unresolved tokens stay visible in-place so the agent can spot the gap during preview.
 */
export function substitute(text: string, strings: LocaleStrings): SubstituteResult {
  const missing = new Set<string>();
  const out = text.replace(TOKEN_RE, (_, key: string) => {
    const value = strings[key];
    if (value === undefined) {
      missing.add(key);
      return `{{t.${key}}}`;
    }
    return value;
  });
  return { text: out, missingKeys: [...missing] };
}

export interface ComposeOptions {
  canvasHtml: string;
  locale: string;
  strings: LocaleStrings;
  /** URL pointing at the project root, e.g. "file:///.../proj/". Trailing slash required. */
  baseHref: string;
}

export interface Composed {
  html: string;
  missingKeys: string[];
}

export function composeHtml(opts: ComposeOptions): Composed {
  const { text, missingKeys } = substitute(opts.canvasHtml, opts.strings);
  const html = `<!doctype html>
<html lang="${escapeAttr(opts.locale)}">
<head>
<meta charset="utf-8">
<base href="${escapeAttr(opts.baseHref)}">
<link rel="stylesheet" href="styles.css">
</head>
<body>
${text}
</body>
</html>
`;
  return { html, missingKeys };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
