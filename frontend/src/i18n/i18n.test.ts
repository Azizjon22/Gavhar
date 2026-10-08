import { describe, expect, it } from 'vitest';
import { EVENT_STATUSES, EVENT_TYPES } from '@/features/events/types/event.types';
import { PERIODS } from '@/features/finance/lib/period';
import { WORKER_POSITIONS } from '@/features/workers/types/worker.types';
import { SHOPPING_STATUSES } from '@/features/shopping/types/shopping.types';
import {
  PRODUCT_CATEGORIES,
  WAREHOUSE_SECTIONS,
  WAREHOUSE_UNITS,
} from '@/features/warehouse/types/warehouse.types';
import { PASSWORD_RULES } from '@/lib/password-policy';
import { LANGUAGES } from '@/stores/locale.store';
import ru from './ru.json';
import uz from './uz.json';

type Dictionary = { [key: string]: string | Dictionary };

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Barcha barg kalitlar; ko'plik qo'shimchalari (`_one`, `_few`...) olib tashlanadi. */
const flatten = (dictionary: Dictionary, prefix = ''): string[] =>
  Object.entries(dictionary).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [`${prefix}${key}`.replace(PLURAL_SUFFIX, '')]
      : flatten(value, `${prefix}${key}.`),
  );

const uzKeys = new Set(flatten(uz));
const ruKeys = new Set(flatten(ru));

const sources = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Tarjima kaliti bo'lmagan, lekin shunga o'xshash satrlar (audit amal nomlari). */
const NOT_TRANSLATION_KEYS = new Set(['auth.login_failed', 'auth.token_reuse']);
const NAMESPACES = Object.keys(uz).join('|');
const KEY_LITERAL = new RegExp(`['"]((?:${NAMESPACES})\\.[A-Za-z0-9_.-]*[A-Za-z0-9_-])['"]`, 'g');

const usedKeys = new Set(
  Object.values(sources).flatMap((source) =>
    [...source.matchAll(KEY_LITERAL)]
      .map((match) => match[1] as string)
      .filter((key) => !NOT_TRANSLATION_KEYS.has(key)),
  ),
);

describe('tarjimalar', () => {
  it("o'zbek va rus tillarida kalitlar to'plami bir xil", () => {
    expect([...uzKeys].filter((key) => !ruKeys.has(key))).toEqual([]);
    expect([...ruKeys].filter((key) => !uzKeys.has(key))).toEqual([]);
  });

  it("bo'sh tarjima yo'q", () => {
    const empty = (dictionary: Dictionary, prefix = ''): string[] =>
      Object.entries(dictionary).flatMap(([key, value]) =>
        typeof value === 'string'
          ? value.trim() === ''
            ? [`${prefix}${key}`]
            : []
          : empty(value, `${prefix}${key}.`),
      );

    expect(empty(uz)).toEqual([]);
    expect(empty(ru)).toEqual([]);
  });

  it('kodda ishlatilgan barcha kalitlar lug‘atda mavjud', () => {
    expect(usedKeys.size).toBeGreaterThan(150);
    expect([...usedKeys].filter((key) => !uzKeys.has(key)).sort()).toEqual([]);
  });

  it("lug'atda ishlatilmaydigan kalit qolmagan (dinamik oilalardan tashqari)", () => {
    // Bu oilalar kodda shablon satr orqali yig'iladi: t(`users.toast.${action}`).
    const dynamicFamilies = [
      'audit.actions.',
      'audit.categories.',
      'auth.hero.features.',
      'errors.codes.',
      'events.actions.',
      'events.calendar.',
      'events.status.',
      'events.toast.',
      'events.type.',
      'finance.period.',
      'payments.kind.',
      'payments.method.',
      'services.unit.',
      'shopping.confirmDialog.',
      'shopping.editor.title.',
      'shopping.empty.',
      'shopping.status.',
      'shopping.tabs.',
      'shopping.tasks.',
      'shopping.toast.',
      'halls.status.',
      'language.',
      'password.rules.',
      'permissions.',
      'profile.tabs.',
      'theme.',
      'twoFactor.intro.',
      'users.confirm.',
      'users.status.',
      'users.toast.',
      'warehouse.itemForm.createTitle.',
      'warehouse.itemForm.namePlaceholder.',
      'warehouse.productCategory.',
      'warehouse.section.',
      'warehouse.unit.',
      'warehouse.unitName.',
      'workers.position.',
      'workers.positionPlural.',
    ];
    const unused = [...uzKeys].filter(
      (key) => !usedKeys.has(key) && !dynamicFamilies.some((family) => key.startsWith(family)),
    );

    expect(unused.sort()).toEqual([]);
  });

  it('dinamik yig‘iladigan kalitlar mavjud', () => {
    const dynamic = [
      ...PASSWORD_RULES.map((rule) => `password.rules.${rule.key}`),
      ...LANGUAGES.map((language) => `language.${language}`),
      ...['light', 'dark', 'system'].map((theme) => `theme.${theme}`),
      ...['account', 'security', 'sessions', 'brand'].map((tab) => `profile.tabs.${tab}`),
      ...[
        'auth',
        'user',
        'role',
        'session',
        'event',
        'payment',
        'client',
        'hall',
        'menu',
        'gallery',
        'expense',
        'warehouse',
        'shopping',
        'worker',
      ].map((category) => `audit.categories.${category}`),
      ...['ACTIVE', 'MAINTENANCE'].map((status) => `halls.status.${status}`),
      ...EVENT_STATUSES.map((status) => `events.status.${status}`),
      ...EVENT_TYPES.map((type) => `events.type.${type}`),
      ...['confirm', 'hold', 'complete'].flatMap((step) => [
        `events.actions.${step}`,
        `events.toast.${step}`,
      ]),
      ...['month', 'week', 'day'].map((view) => `events.calendar.${view}`),
      ...['DEPOSIT', 'PAYMENT', 'REFUND'].map((kind) => `payments.kind.${kind}`),
      ...['CASH', 'CARD', 'TRANSFER'].map((method) => `payments.method.${method}`),
      ...['PER_EVENT', 'PER_GUEST'].map((unit) => `services.unit.${unit}`),
      ...PERIODS.map((period) => `finance.period.${period}`),
      ...WORKER_POSITIONS.flatMap((position) => [
        `workers.position.${position}`,
        `workers.positionPlural.${position}`,
      ]),
      ...SHOPPING_STATUSES.map((status) => `shopping.status.${status}`),
      'shopping.tabs.general',
      ...['today', 'upcoming', 'past'].flatMap((tab) => [
        `shopping.tabs.${tab}`,
        `shopping.empty.${tab}.title`,
        `shopping.empty.${tab}.text`,
      ]),
      ...['review', 'confirm', 'purchase'].map((task) => `shopping.tasks.${task}`),
      ...['create', 'edit', 'review'].map((mode) => `shopping.editor.title.${mode}`),
      ...['confirm', 'unconfirm', 'delete'].flatMap((action) => [
        `shopping.toast.${action}`,
        `shopping.confirmDialog.${action}.title`,
        `shopping.confirmDialog.${action}.text`,
        `shopping.confirmDialog.${action}.submit`,
      ]),
      ...WAREHOUSE_SECTIONS.map((section) => `warehouse.section.${section}`),
      ...PRODUCT_CATEGORIES.map((category) => `warehouse.productCategory.${category}`),
      ...WAREHOUSE_UNITS.flatMap((unit) => [
        `warehouse.unit.${unit}`,
        `warehouse.unitName.${unit}`,
      ]),
      ...['food', 'tableware'].flatMap((section) => [
        `warehouse.itemForm.createTitle.${section}`,
        `warehouse.itemForm.namePlaceholder.${section}`,
      ]),
      ...['install', 'scan', 'confirm'].map((step) => `twoFactor.intro.${step}`),
      ...['security', 'roles', 'audit'].map((feature) => `auth.hero.features.${feature}`),
      ...['ACTIVE', 'BLOCKED'].map((status) => `users.status.${status}`),
      ...['block', 'unblock', 'delete', 'resetTwoFactor'].flatMap((action) => [
        `users.toast.${action}`,
        `users.confirm.${action}.title`,
        `users.confirm.${action}.text`,
        `users.confirm.${action}.confirm`,
      ]),
    ];

    expect(dynamic.filter((key) => !uzKeys.has(key))).toEqual([]);
  });
});
