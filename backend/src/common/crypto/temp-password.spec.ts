import { passwordPolicyViolations } from '@/common/validators/password-policy';
import { generateTemporaryPassword } from './temp-password';

describe('generateTemporaryPassword', () => {
  it('har doim parol siyosatiga mos keladi', () => {
    for (let i = 0; i < 300; i += 1) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(16);
      expect(passwordPolicyViolations(password)).toEqual([]);
    }
  });

  it('adashtiradigan belgilar ishlatilmaydi va parollar takrorlanmaydi', () => {
    const passwords = Array.from({ length: 200 }, () => generateTemporaryPassword());
    expect(new Set(passwords).size).toBe(200);
    expect(passwords.join('')).not.toMatch(/[0O1lI]/);
  });
});
