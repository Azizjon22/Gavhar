import { auditDiff, sanitizeForAudit } from './audit-sanitizer';

describe('sanitizeForAudit', () => {
  it('sirli maydonlarni har qanday chuqurlikda yashiradi', () => {
    const result = sanitizeForAudit({
      email: 'a@gavhar.uz',
      passwordHash: '$argon2id$...',
      totpSecretEnc: 'v1.abc',
      nested: { refreshToken: 'xyz', items: [{ backupCode: 'ABCDE-12345', name: 'ok' }] },
    });

    expect(result).toEqual({
      email: 'a@gavhar.uz',
      passwordHash: '[yashirilgan]',
      totpSecretEnc: '[yashirilgan]',
      nested: {
        refreshToken: '[yashirilgan]',
        items: [{ backupCode: '[yashirilgan]', name: 'ok' }],
      },
    });
  });

  it('sana, bigint va Decimal qiymatlarni JSON uchun matnga aylantiradi', () => {
    const decimal = { toFixed: () => '1500000.00', toString: () => '1500000' };

    expect(
      sanitizeForAudit({ at: new Date('2026-10-06T00:00:00Z'), size: 10n, amount: decimal }),
    ).toEqual({ at: '2026-10-06T00:00:00.000Z', size: '10', amount: '1500000' });
  });
});

describe('auditDiff', () => {
  it("faqat o'zgargan maydonlarni qaytaradi", () => {
    expect(
      auditDiff(
        { name: 'Eski', phone: '+998901112233', role: 'Admin' },
        { name: 'Yangi', role: 'Admin' },
      ),
    ).toEqual({ before: { name: 'Eski' }, after: { name: 'Yangi' } });
  });

  it("o'zgarish bo'lmasa null", () => {
    expect(auditDiff({ permissions: ['a', 'b'] }, { permissions: ['a', 'b'] })).toBeNull();
  });
});
