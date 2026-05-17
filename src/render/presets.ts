import type { Manifest, Platform, Device, Dimensions } from "../project/schema.js";

/**
 * Default store-spec dimensions. Confirmed against current Apple/Google docs as of 2026-05.
 * Override per-project in manifest.dimensions.
 *
 * - App Store iPhone 6.9" display: 1320 × 2868
 *   https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/
 * - Play Store phone (minimum):    1080 × 1920
 *   https://support.google.com/googleplay/android-developer/answer/9866151
 */
export const DEFAULT_DIMENSIONS: Record<Platform, Record<Device, Dimensions>> = {
  app_store: {
    iphone: { width: 1320, height: 2868 },
    android_phone: { width: 1320, height: 2868 }, // n/a but keeps the shape uniform
  },
  play_store: {
    android_phone: { width: 1080, height: 1920 },
    iphone: { width: 1080, height: 1920 }, // n/a
  },
};

export function dimensionsFor(
  manifest: Manifest,
  platform: Platform,
  device: Device,
): Dimensions {
  const slice = manifest.dimensions?.[platform] as
    | Partial<Record<Device, Dimensions>>
    | undefined;
  const override = slice?.[device];
  if (override) return override;
  return DEFAULT_DIMENSIONS[platform][device];
}
