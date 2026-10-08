import { describe, expect, it } from 'vitest';
import { GEM_EDGE_COUNT, GEM_FACE_COUNT, gemFrame } from './gem-geometry';

const ANGLES = Array.from({ length: 72 }, (_, step) => (step / 72) * Math.PI * 2);

describe('gemFrame', () => {
  it('olti qirrali tosh: 13 ta yuza va 24 ta qirra', () => {
    expect(GEM_FACE_COUNT).toBe(13);
    expect(GEM_EDGE_COUNT).toBe(24);
    expect(gemFrame(0).faces).toHaveLength(13);
    expect(gemFrame(0).edges).toHaveLength(24);
  });

  it('har qanday burchakda tosh 64×64 maydondan chiqmaydi', () => {
    for (const angle of ANGLES) {
      for (const edge of gemFrame(angle).edges) {
        for (const value of [edge.x1, edge.y1, edge.x2, edge.y2]) {
          expect(value).toBeGreaterThanOrEqual(2);
          expect(value).toBeLessThanOrEqual(62);
        }
      }
    }
  });

  it('to‘liq aylanishdan keyin boshlang‘ich holatga qaytadi', () => {
    expect(gemFrame(0.7 + Math.PI * 2)).toEqual(gemFrame(0.7));
  });

  it('ustki maydoncha doim ko‘rinadi, orqa yuzalar yaltiramaydi', () => {
    for (const angle of ANGLES) {
      const { faces, edges } = gemFrame(angle);
      expect(faces[0]?.shine).toBeGreaterThan(0);
      // Qavariq jismda bir vaqtda hamma yuza ko'rinmaydi.
      const lit = faces.filter((face) => face.shine > 0).length;
      expect(lit).toBeGreaterThanOrEqual(3);
      expect(lit).toBeLessThan(GEM_FACE_COUNT);
      // Chegara yopiq kontur: kamida olti qirradan iborat.
      expect(edges.filter((edge) => edge.kind === 'outline').length).toBeGreaterThanOrEqual(6);
      expect(edges.some((edge) => edge.kind === 'back')).toBe(true);
    }
  });
});
