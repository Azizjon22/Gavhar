import { describe, expect, it } from 'vitest';
import { addStep, defaultKgMode, fromInput, roundFor, toInput } from './kitchen';

describe('oshpaz miqdorlari', () => {
  it('kg mahsulot: kilogramm yoki gramm bilan yoziladi, kg da saqlanadi', () => {
    expect(fromInput('15', 'KG', 'kg')).toBe(15);
    expect(fromInput('250', 'KG', 'g')).toBe(0.25);
    expect(toInput(0.25, 'KG', 'g')).toBe('250');
    expect(toInput(15, 'KG', 'kg')).toBe('15');
    expect(fromInput('abc', 'KG', 'kg')).toBe(0);
    expect(fromInput('1,5', 'LITER', 'kg')).toBe(1.5);
  });

  it('donalab sanaladigan birlik butun bo‘ladi', () => {
    expect(fromInput('3.6', 'PIECE', 'kg')).toBe(4);
    expect(addStep('PIECE', 'kg', 4, -1)).toBe(3);
  });

  it('qadamlar: kg — 1, gramm — 50 g, litr — 1 dan kami yarimlab', () => {
    expect(addStep('KG', 'kg', 2, 1)).toBe(3);
    expect(addStep('KG', 'g', 0.1, 1)).toBe(0.15);
    expect(addStep('KG', 'g', 0.05, -1)).toBe(0);
    expect(addStep('LITER', 'kg', 0, 1)).toBe(0.5);
    expect(addStep('LITER', 'kg', 1, -1)).toBe(0.5);
    expect(addStep('LITER', 'kg', 2, 1)).toBe(3);
  });

  it('ziravor grammlab, qolgani kilogrammlab yoziladi', () => {
    expect(defaultKgMode('SPICE')).toBe('g');
    expect(defaultKgMode('MEAT')).toBe('kg');
    expect(defaultKgMode(null)).toBe('kg');
  });

  it('mehmon soniga moslangan miqdor yoziladigan ko‘rinishda qoladi', () => {
    expect(roundFor('KG', 22.4)).toBe(22);
    expect(roundFor('KG', 0.33)).toBe(0.35);
    expect(roundFor('LITER', 2.3)).toBe(2.5);
    expect(roundFor('PIECE', 4.1)).toBe(5);
    expect(roundFor('PIECE', 0.2)).toBe(1);
  });
});
