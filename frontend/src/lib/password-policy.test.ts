import { describe, expect, it } from 'vitest';
import { PASSWORD_RULES, generatePassword, isStrongPassword } from './password-policy';

describe('isStrongPassword', () => {
  it('siyosatga mos parolni qabul qiladi', () => {
    expect(isStrongPassword('Gavhar!Toyxona2026')).toBe(true);
    expect(isStrongPassword('Ўзбек#Парол2026')).toBe(true);
  });

  it.each([
    ['Qisqa!1aA', 'length'],
    ['kichikharflar!2026', 'upper'],
    ['KATTAHARFLAR!2026', 'lower'],
    ['RaqamsizParol!!!', 'digit'],
    ['MaxsusBelgisiz2026', 'special'],
  ])('%s — "%s" qoidasi bajarilmagan', (password, failedRule) => {
    const failed = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.key);

    expect(failed).toEqual([failedRule]);
    expect(isStrongPassword(password)).toBe(false);
  });

  it('128 belgidan uzun parolni rad etadi', () => {
    expect(isStrongPassword(`Aa1!${'x'.repeat(125)}`)).toBe(false);
  });
});

describe('generatePassword', () => {
  it('har doim siyosatga mos va har safar boshqa parol beradi', () => {
    const passwords = Array.from({ length: 200 }, () => generatePassword());

    expect(passwords.every(isStrongPassword)).toBe(true);
    expect(passwords.every((password) => password.length === 16)).toBe(true);
    expect(new Set(passwords).size).toBe(passwords.length);
  });

  it("o'xshash belgilarni ishlatmaydi", () => {
    const sample = Array.from({ length: 100 }, () => generatePassword(32)).join('');

    expect(sample).not.toMatch(/[0O1lI]/);
  });
});
