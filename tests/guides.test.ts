import { describe, expect, it } from 'vitest';
import { camelotWheelSvg, crossfaderCurvesSvg, GUIDES } from '../src/ui/guides';

describe('guides', () => {
  it('every guide has a unique id, a diagram and text', () => {
    expect(new Set(GUIDES.map((g) => g.id)).size).toBe(GUIDES.length);
    for (const g of GUIDES) {
      expect(g.figure()).toMatch(/^<svg [^>]*viewBox=/);
      expect(g.body.length).toBeGreaterThan(80);
      expect(g.caption.length).toBeGreaterThan(10);
      if (g.target) expect(g.target.startsWith('#')).toBe(true);
    }
  });

  it('the Camelot wheel shows all 24 keys', () => {
    const wheel = camelotWheelSvg();
    for (let n = 1; n <= 12; n++) {
      expect(wheel).toContain(`>${n}A<`);
      expect(wheel).toContain(`>${n}B<`);
    }
    expect(wheel).toContain('>Am<');
    expect(wheel).toContain('>C<');
  });

  it('plots both decks for all three crossfader curves', () => {
    expect(crossfaderCurvesSvg().match(/<path /g)).toHaveLength(6);
  });
});
