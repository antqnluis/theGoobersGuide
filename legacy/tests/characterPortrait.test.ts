import { describe, expect, it } from 'vitest';
import {
  MAX_PORTRAIT_UPLOAD_BYTES,
  portraitFileError,
} from '../src/features/characters/characterPortrait';

describe('character portrait upload validation', () => {
  it('accepts JPEG, PNG, and WebP uploads within the size limit', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp'])
      expect(portraitFileError({ type, size: MAX_PORTRAIT_UPLOAD_BYTES })).toBe(
        null,
      );
  });

  it('rejects unsupported file types and oversized uploads', () => {
    expect(portraitFileError({ type: 'image/gif', size: 1 })).toMatch(
      /JPEG, PNG, or WebP/,
    );
    expect(
      portraitFileError({
        type: 'image/png',
        size: MAX_PORTRAIT_UPLOAD_BYTES + 1,
      }),
    ).toMatch(/8 MB or smaller/);
  });
});
