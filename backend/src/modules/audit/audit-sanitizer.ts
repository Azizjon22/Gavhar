const REDACTED = '[yashirilgan]';
const SENSITIVE_KEY = /(password|secret|token|hash|backupcode)/i;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);

/** Audit logga yozishdan oldin sirlarni yashiradi va qiymatlarni JSON'ga moslaydi. */
export const sanitizeForAudit = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitizeForAudit);

  if (isPlainObject(value)) {
    // Prisma.Decimal va shunga o'xshash qiymat-obyektlar matn sifatida yoziladi.
    if (typeof (value as { toFixed?: unknown }).toFixed === 'function') {
      return (value as { toString(): string }).toString();
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([key, v]) => [key, SENSITIVE_KEY.test(key) ? REDACTED : sanitizeForAudit(v)]),
    );
  }

  return REDACTED;
};

/** Faqat o'zgargan maydonlarni qaytaradi: `{ before, after }`. O'zgarish bo'lmasa `null`. */
export const auditDiff = <T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Partial<T>; after: Partial<T> } | null => {
  const changedBefore: Partial<T> = {};
  const changedAfter: Partial<T> = {};

  for (const key of Object.keys(after) as Array<keyof T>) {
    if (after[key] === undefined) continue;
    if (
      JSON.stringify(sanitizeForAudit(before[key])) === JSON.stringify(sanitizeForAudit(after[key]))
    )
      continue;
    changedBefore[key] = before[key];
    changedAfter[key] = after[key];
  }

  return Object.keys(changedAfter).length > 0
    ? { before: changedBefore, after: changedAfter }
    : null;
};
