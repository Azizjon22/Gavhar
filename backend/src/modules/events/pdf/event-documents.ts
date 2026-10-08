import { EventType, ExtraServiceUnit, PaymentKind, PaymentMethod, Prisma } from '@prisma/client';
import { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import type { EventDetail } from '../events.service';

/** Hujjatlar o'zbek tilida tuziladi. To'yxona rekvizitlari Sozlamalar bo'limidan olinadi. */
const VENUE_NAME = '«Gavhar» to‘yxonasi';
const TIME_ZONE = 'Asia/Tashkent';
const EMERALD = '#0F4C3A';
const GOLD = '#B8862F';
const MUTED = '#5D6F68';

const EVENT_TYPES: Record<EventType, string> = {
  WEDDING: 'To‘y',
  NIKOH: 'Nikoh',
  OSH: 'Nahor oshi',
  SUNNAT: 'Sunnat to‘yi',
  BIRTHDAY: 'Tug‘ilgan kun',
  ANNIVERSARY: 'Yubiley',
  CORPORATE: 'Korporativ tadbir',
  OTHER: 'Tadbir',
};
const PAYMENT_KINDS: Record<PaymentKind, string> = {
  DEPOSIT: 'Zaklad',
  PAYMENT: 'To‘lov',
  REFUND: 'Qaytarildi',
};
const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  CASH: 'Naqd',
  CARD: 'Karta',
  TRANSFER: 'O‘tkazma',
};

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});

const formatDate = (value: Date): string => dateFormat.format(value);
const formatDateTime = (value: Date): string =>
  `${dateFormat.format(value)} ${timeFormat.format(value)}`;

/** 69000000.00 → "69 000 000"; tiyin bo'lsa "1 234.50". */
export const formatSum = (value: Prisma.Decimal): string => {
  const [integer = '0', fraction = ''] = value.toFixed(2).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fraction === '00' ? grouped : `${grouped}.${fraction}`;
};
const sum = (value: Prisma.Decimal): string => `${formatSum(value)} so‘m`;

export const formatPhone = (phone: string): string =>
  /^\+998\d{9}$/.test(phone)
    ? `+998 ${phone.slice(4, 6)} ${phone.slice(6, 9)} ${phone.slice(9, 11)} ${phone.slice(11)}`
    : phone;

const header = (title: string, subtitle: string): Content => ({
  columns: [
    [
      { text: VENUE_NAME, fontSize: 18, bold: true, color: EMERALD },
      {
        text: 'To‘yxona va studio',
        fontSize: 9,
        color: GOLD,
        characterSpacing: 1.5,
        margin: [0, 2, 0, 0],
      },
    ],
    [
      { text: title, fontSize: 14, bold: true, alignment: 'right' },
      { text: subtitle, color: MUTED, alignment: 'right', margin: [0, 3, 0, 0] },
    ],
  ],
  margin: [0, 0, 0, 14],
});

const rule: Content = {
  canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: GOLD }],
  margin: [0, 0, 0, 14],
};

const row = (label: string, value: string): TableCell[] => [
  { text: label, color: MUTED },
  { text: value, bold: true },
];

const amountRow = (label: string, value: string, strong = false): TableCell[] => [
  { text: label, bold: strong, fontSize: strong ? 11 : 10 },
  { text: value, bold: strong, fontSize: strong ? 11 : 10, alignment: 'right' },
];

const section = (title: string): Content => ({
  text: title.toUpperCase(),
  fontSize: 9,
  bold: true,
  color: EMERALD,
  characterSpacing: 1,
  margin: [0, 14, 0, 6],
});

const signatures: Content = {
  columns: [
    {
      stack: [{ text: 'To‘yxona nomidan', color: MUTED }, { text: '\n\n_______________________' }],
    },
    {
      stack: [
        { text: 'Mijoz', color: MUTED, alignment: 'right' },
        { text: '\n\n_______________________', alignment: 'right' },
      ],
    },
  ],
  margin: [0, 36, 0, 0],
};

const base = (content: Content[], title: string): TDocumentDefinitions => ({
  info: { title, author: VENUE_NAME },
  pageSize: 'A4',
  pageMargins: [40, 44, 40, 48],
  content,
  footer: (currentPage, pageCount) => ({
    text: `${title} · ${currentPage}/${pageCount}`,
    alignment: 'center',
    color: MUTED,
    fontSize: 8,
    margin: [0, 16, 0, 0],
  }),
});

/** Bron shartnomasi: tomonlar, tadbir tafsilotlari, hisob-kitob va to'lovlar. */
export function buildContract(event: EventDetail): TDocumentDefinitions {
  const title = `Shartnoma № ${event.number}`;
  const guestsTotal = event.pricePerGuest.mul(event.guestCount);
  const debt = event.totalAmount.sub(event.paidAmount);

  const priceRows: TableCell[][] = [
    amountRow(
      `Dasturxon: ${event.guestCount} kishi × ${sum(event.pricePerGuest)}`,
      sum(guestsTotal),
    ),
    ...event.services.map((service) =>
      amountRow(
        service.unit === ExtraServiceUnit.PER_GUEST
          ? `${service.name}: ${event.guestCount} kishi × ${sum(service.unitPrice)}${service.quantity > 1 ? ` × ${service.quantity}` : ''}`
          : `${service.name}${service.quantity > 1 ? ` × ${service.quantity}` : ''}`,
        sum(service.total),
      ),
    ),
    ...(event.discount.isZero() ? [] : [amountRow('Chegirma', `− ${sum(event.discount)}`)]),
    amountRow('Jami', sum(event.totalAmount), true),
    amountRow('To‘langan', sum(event.paidAmount)),
    amountRow('Qoldiq', sum(debt.isNegative() ? debt.mul(0) : debt), true),
  ];

  const content: Content[] = [
    header(title, `${formatDate(event.createdAt)} · Toshkent vaqti`),
    rule,
    {
      text: [
        { text: `${VENUE_NAME} `, bold: true },
        'bir tomondan va ',
        { text: event.client.fullName, bold: true },
        ` (tel. ${formatPhone(event.client.phone)}) ikkinchi tomondan quyidagi tadbirni o‘tkazish haqida kelishdilar.`,
      ],
      lineHeight: 1.35,
    },
    section('Tadbir'),
    {
      table: {
        widths: [140, '*'],
        body: [
          row(
            'Tadbir turi',
            event.title ? `${EVENT_TYPES[event.type]} — ${event.title}` : EVENT_TYPES[event.type],
          ),
          row('Zal', event.hall.name),
          ...(event.menuPackageName ? [row('Menyu paketi', event.menuPackageName)] : []),
          row('Boshlanishi', formatDateTime(event.startAt)),
          row('Tugashi', formatDateTime(event.endAt)),
          row('Mehmonlar soni', `${event.guestCount} kishi`),
        ],
      },
      layout: 'lightHorizontalLines',
    },
    section('Hisob-kitob'),
    { table: { widths: ['*', 130], body: priceRows }, layout: 'lightHorizontalLines' },
  ];

  if (event.payments.length > 0) {
    content.push(section('To‘lovlar'), {
      table: {
        headerRows: 1,
        widths: [90, 80, 70, '*'],
        body: [
          [
            { text: 'Sana', color: MUTED },
            { text: 'Turi', color: MUTED },
            { text: 'Usul', color: MUTED },
            { text: 'Summa', color: MUTED, alignment: 'right' },
          ] satisfies TableCell[],
          ...event.payments.map((payment): TableCell[] => [
            formatDate(payment.paidAt),
            PAYMENT_KINDS[payment.kind],
            PAYMENT_METHODS[payment.method],
            {
              text:
                payment.currency === 'USD'
                  ? `${formatSum(payment.amount)} $ × ${payment.exchangeRate.toString()} = ${sum(payment.amountUzs)}`
                  : sum(payment.amountUzs),
              alignment: 'right',
            },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    });
  }

  if (event.note) content.push(section('Izoh'), { text: event.note, lineHeight: 1.35 });
  content.push(signatures);

  return base(content, title);
}

/** Bitta to'lov uchun kvitansiya. */
export function buildReceipt(
  event: EventDetail,
  payment: EventDetail['payments'][number],
): TDocumentDefinitions {
  const title = `Kvitansiya · shartnoma № ${event.number}`;
  const debt = event.totalAmount.sub(event.paidAmount);

  return base(
    [
      header('To‘lov kvitansiyasi', formatDateTime(payment.paidAt)),
      rule,
      {
        table: {
          widths: [140, '*'],
          body: [
            row('Shartnoma', `№ ${event.number}`),
            row('Mijoz', `${event.client.fullName}, ${formatPhone(event.client.phone)}`),
            row(
              'Tadbir',
              `${EVENT_TYPES[event.type]}, ${event.hall.name}, ${formatDateTime(event.startAt)}`,
            ),
            row('To‘lov turi', PAYMENT_KINDS[payment.kind]),
            row('To‘lov usuli', PAYMENT_METHODS[payment.method]),
            ...(payment.currency === 'USD'
              ? [
                  row(
                    'Valyutada',
                    `${formatSum(payment.amount)} $ (kurs ${payment.exchangeRate.toString()})`,
                  ),
                ]
              : []),
            ...(payment.note ? [row('Izoh', payment.note)] : []),
          ],
        },
        layout: 'lightHorizontalLines',
      },
      {
        table: {
          widths: ['*', 160],
          body: [
            amountRow(
              payment.kind === PaymentKind.REFUND ? 'Qaytarilgan summa' : 'Qabul qilingan summa',
              sum(payment.amountUzs),
              true,
            ),
            amountRow('Shartnoma summasi', sum(event.totalAmount)),
            amountRow('Jami to‘langan', sum(event.paidAmount)),
            amountRow('Qoldiq', sum(debt.isNegative() ? debt.mul(0) : debt)),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 18, 0, 0],
      },
      signatures,
    ],
    title,
  );
}

// Boshqa hujjatlar (masalan bozorlik ro'yxati) ham shu ko'rinishda chiqadi.
export {
  base as documentBase,
  formatDate as formatDocumentDate,
  header as documentHeader,
  rule as documentRule,
  section as documentSection,
};
