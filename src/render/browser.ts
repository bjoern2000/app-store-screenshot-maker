import { chromium, type Browser } from "playwright";

let browserPromise: Promise<Browser> | null = null;

/**
 * Lazily launch a single shared Chromium browser. Renderers create their own
 * contexts off it so they stay isolated per render but pay browser-launch cost once.
 */
export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise;
  browserPromise = null;
  await b.close();
}
