import { TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import { Prisma } from '@prisma/client';
import { UNIT_LABELS, quantityString } from '@/common/utils/quantity.util';
import {
  documentBase,
  documentHeader,
  documentRule,
  documentSection,
  formatDocumentDate,
  formatSum,
} from '@/modules/events/pdf/event-documents';
import { ShoppingListRecord } from '../shopping.service';

const STATUS_LABELS: Record<ShoppingListRecord['status'], string> = {
  SUBMITTED: 'Tekshiruvda',
  APPROVED: 'Xarid uchun',
  PURCHASED: 'Sotib olingan',
  CONFIRMED: 'Tasdiqlangan',
};

const quantity = (value: Prisma.Decimal, unit: ShoppingListRecord['items'][number]['unit']) =>
  `${quantityString(value).replace('.', ',')} ${UNIT_LABELS[unit]}`;

/** Bozorlik ro'yxati: bozorga olib borish yoki hisobot uchun chop etiladigan varaq. */
export function buildShoppingList(list: ShoppingListRecord): TDocumentDefinitions {
  const { event } = list;
  const title = event ? `Bozorlik — bron № ${event.number}` : 'Umumiy bozorlik';
  const priced = list.items.some((item) => item.price || item.skipped);
  const total = list.items.reduce(
    (sum, item) => (item.skipped || !item.price ? sum : sum.add(item.price)),
    new Prisma.Decimal(0),
  );

  const head: TableCell[] = [
    { text: '№', bold: true },
    { text: 'Mahsulot', bold: true },
    { text: 'Miqdor', bold: true, alignment: 'right' },
    { text: 'Narxi, so‘m', bold: true, alignment: 'right' },
  ];
  const rows: TableCell[][] = list.items.map((item, index) => [
    { text: String(index + 1), color: '#5D6F68' },
    {
      text: item.note
        ? [item.name, { text: `\n${item.note}`, fontSize: 8, color: '#5D6F68' }]
        : item.name,
      decoration: item.skipped ? 'lineThrough' : undefined,
    },
    { text: quantity(item.quantity, item.unit), alignment: 'right' },
    {
      text: item.skipped ? 'olinmadi' : item.price ? formatSum(item.price) : '',
      alignment: 'right',
      color: item.skipped ? '#5D6F68' : undefined,
    },
  ]);
  if (priced) {
    rows.push([
      { text: '' },
      { text: 'Jami', bold: true, fontSize: 11 },
      { text: '' },
      { text: formatSum(total), bold: true, fontSize: 11, alignment: 'right' },
    ]);
  }

  const details: [string, string][] = [
    ...(event
      ? ([
          ['Tadbir', event.title ?? event.client.fullName],
          ['Sana', formatDocumentDate(event.startAt)],
          ['Zal', event.hall.name],
          ['Mehmonlar soni', `${event.guestCount} kishi`],
        ] as [string, string][])
      : ([['Yozilgan sana', formatDocumentDate(list.createdAt)]] as [string, string][])),
    ['Oshpaz', list.createdByName],
    ...(list.purchasedByName ? [['Xarid qildi', list.purchasedByName] as [string, string]] : []),
  ];

  return documentBase(
    [
      documentHeader(title, STATUS_LABELS[list.status]),
      documentRule,
      {
        table: {
          widths: [110, '*'],
          body: details.map(([label, value]): TableCell[] => [
            { text: label, color: '#5D6F68' },
            { text: value, bold: true },
          ]),
        },
        layout: 'noBorders',
      },
      documentSection('Ro‘yxat'),
      {
        table: { headerRows: 1, widths: [22, '*', 90, 110], body: [head, ...rows] },
        layout: 'lightHorizontalLines',
      },
      ...(list.note ? [documentSection('Izoh'), { text: list.note }] : []),
    ],
    title,
  );
}
