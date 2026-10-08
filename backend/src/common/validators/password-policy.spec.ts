import { passwordPolicyViolations } from './password-policy';

describe('passwordPolicyViolations', () => {
  it('siyosatga mos parolni qabul qiladi', () => {
    expect(passwordPolicyViolations('Gavhar!Toyxona2026')).toEqual([]);
    expect(passwordPolicyViolations('Ўзбек#Парол2026')).toEqual([]);
  });

  it.each([
    ['Qisqa!1aA', 'kamida 12 ta belgi'],
    ['kichikharflar!2026', 'kamida bitta katta harf'],
    ['KATTAHARFLAR!2026', 'kamida bitta kichik harf'],
    ['RaqamsizParol!!!', 'kamida bitta raqam'],
    ['MaxsusBelgisiz2026', 'kamida bitta maxsus belgi'],
  ])('%s → %s', (password, violation) => {
    expect(passwordPolicyViolations(password)).toContain(violation);
  });

  it('juda uzun va matn bo‘lmagan qiymatni rad etadi', () => {
    expect(passwordPolicyViolations(`Aa1!${'x'.repeat(130)}`)).toContain(
      "ko'pi bilan 128 ta belgi",
    );
    expect(passwordPolicyViolations(12345678901234)).toHaveLength(1);
  });
});
