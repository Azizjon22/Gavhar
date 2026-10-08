import { ValidationArguments, ValidationOptions, registerDecorator } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const RULES: ReadonlyArray<{ test: (value: string) => boolean; message: string }> = [
  {
    test: (v) => v.length >= PASSWORD_MIN_LENGTH,
    message: `kamida ${PASSWORD_MIN_LENGTH} ta belgi`,
  },
  {
    test: (v) => v.length <= PASSWORD_MAX_LENGTH,
    message: `ko'pi bilan ${PASSWORD_MAX_LENGTH} ta belgi`,
  },
  { test: (v) => /\p{Lu}/u.test(v), message: 'kamida bitta katta harf' },
  { test: (v) => /\p{Ll}/u.test(v), message: 'kamida bitta kichik harf' },
  { test: (v) => /\d/.test(v), message: 'kamida bitta raqam' },
  { test: (v) => /[^\p{L}\p{N}\s]/u.test(v), message: 'kamida bitta maxsus belgi' },
];

/** Parol siyosatiga mos kelmagan talablar ro'yxati; bo'sh bo'lsa parol yaroqli. */
export const passwordPolicyViolations = (value: unknown): string[] => {
  if (typeof value !== 'string') return ["parol matn bo'lishi kerak"];
  return RULES.filter((rule) => !rule.test(value)).map((rule) => rule.message);
};

export function IsStrongPassword(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isStrongPassword',
      target: target.constructor,
      propertyName: String(propertyName),
      options,
      validator: {
        validate: (value: unknown) => passwordPolicyViolations(value).length === 0,
        defaultMessage: (args?: ValidationArguments) =>
          `Parol talablari: ${passwordPolicyViolations(args?.value).join(', ')}`,
      },
    });
  };
}
