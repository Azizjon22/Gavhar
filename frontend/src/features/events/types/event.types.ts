import type { ExtraServiceUnit } from '@/features/extra-services/types/extra-service.types';
import type { ListParams } from '@/types/api';

export const EVENT_TYPES = [
  'WEDDING',
  'NIKOH',
  'OSH',
  'SUNNAT',
  'BIRTHDAY',
  'ANNIVERSARY',
  'CORPORATE',
  'OTHER',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const TABLE_CAPACITIES = [10, 12] as const;

export const EVENT_STATUSES = ['REQUEST', 'CONFIRMED', 'HELD', 'COMPLETED', 'CANCELLED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export type PaymentKind = 'DEPOSIT' | 'PAYMENT' | 'REFUND';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER';
export type Currency = 'UZS' | 'USD';

/** Ro'yxat va kalendar uchun yengil ko'rinish. Pul qiymatlari — satr. */
export interface EventSummary {
  id: string;
  number: number;
  type: EventType;
  status: EventStatus;
  title: string | null;
  startAt: string;
  endAt: string;
  guestCount: number;
  /** Stol turi: bitta stolga necha kishi (10 yoki 12). */
  tableCapacity: number | null;
  /** Kelin-kuyov tanlagan 1- va 2-ovqat (faqat super admin belgilaydi). */
  firstDish: string | null;
  secondDish: string | null;
  /**
   * Pulga oid maydonlar faqat moliya ruxsati (`finance:read`) bor foydalanuvchiga
   * keladi — admin va zavzalda ular umuman bo'lmaydi.
   */
  totalAmount?: string;
  paidAmount?: string;
  debt?: string;
  client: { id: string; fullName: string; phone: string };
  hall: { id: string; name: string };
  /** Nomi bron paytidagi holatda saqlanadi; paket o'chirilgan bo'lsa `id` — null. */
  menuPackage: { id: string | null; name: string } | null;
}

export interface EventServiceLine {
  extraServiceId: string;
  name: string;
  unit: ExtraServiceUnit;
  unitPrice?: string;
  quantity: number;
  total?: string;
}

export interface Payment {
  id: string;
  kind: PaymentKind;
  method: PaymentMethod;
  currency: Currency;
  amount: string;
  exchangeRate: string;
  amountUzs: string;
  paidAt: string;
  note: string | null;
}

export interface EventDetail extends EventSummary {
  pricePerGuest?: string;
  guestsTotal?: string;
  extrasTotal?: string;
  discount?: string;
  requiredDeposit?: string;
  minDepositPercent?: number;
  note: string | null;
  cancelReason: string | null;
  services: EventServiceLine[];
  payments?: Payment[];
  createdAt: string;
  updatedAt: string;
}

export interface EventPayload {
  clientId: string;
  hallId: string;
  type: EventType;
  title: string | null;
  startAt: string;
  endAt: string;
  guestCount: number;
  /** Pulni ko'rmaydigan rol yubormaydi — narx menyu paketidan olinadi. */
  pricePerGuest?: string;
  menuPackageId: string | null;
  tableCapacity: number | null;
  /** Faqat super admin yuboradi — boshqalarda maydon umuman bo'lmaydi. */
  firstDish?: string | null;
  secondDish?: string | null;
  discount?: string;
  services: { extraServiceId: string; quantity: number }[];
  note: string | null;
}

export interface PaymentPayload {
  kind: PaymentKind;
  method: PaymentMethod;
  currency: Currency;
  amount: string;
  exchangeRate?: string;
  paidAt?: string;
  note: string | null;
}

export interface ListEventsParams extends ListParams {
  status?: EventStatus;
  hallId?: string;
  clientId?: string;
  debtOnly?: boolean;
}

export interface BookingSettings {
  minDepositPercent: number;
}

/** Tahrirlash mumkin bo'lgan holatlar (yakunlangan va bekor qilingan — yo'q). */
export const isEditable = (status: EventStatus): boolean =>
  status === 'REQUEST' || status === 'CONFIRMED' || status === 'HELD';
