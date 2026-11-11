import { describe, expect, it } from 'vitest';
import {
  campaignMapDisplaySize,
  campaignMapFileError,
  clampCampaignMapOffset,
  MAX_CAMPAIGN_MAP_UPLOAD_BYTES,
} from '../src/features/campaigns/campaignMap';

describe('campaign map upload validation', () => {
  it('accepts JPEG, PNG, and WebP images within the size limit', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp'])
      expect(
        campaignMapFileError({
          type,
          size: MAX_CAMPAIGN_MAP_UPLOAD_BYTES,
        }),
      ).toBeNull();
  });

  it('rejects unsupported formats and oversized images', () => {
    expect(campaignMapFileError({ type: 'image/gif', size: 1 })).toMatch(
      /JPEG, PNG, or WebP/,
    );
    expect(
      campaignMapFileError({
        type: 'image/png',
        size: MAX_CAMPAIGN_MAP_UPLOAD_BYTES + 1,
      }),
    ).toMatch(/8 MB or smaller/);
  });

  it('fits the full map at its default zoom and scales it proportionally', () => {
    const image = { width: 1600, height: 900 };
    const viewport = { width: 400, height: 300 };

    expect(campaignMapDisplaySize(image, viewport, 1)).toEqual({
      width: 400,
      height: 225,
    });
    expect(campaignMapDisplaySize(image, viewport, 2)).toEqual({
      width: 800,
      height: 450,
    });
  });

  it('clamps map movement to keep the preview filled when zoomed', () => {
    expect(
      clampCampaignMapOffset(
        { x: 900, y: -900 },
        { width: 1600, height: 900 },
        { width: 400, height: 300 },
        2,
      ),
    ).toEqual({ x: 200, y: -75 });
  });
});
