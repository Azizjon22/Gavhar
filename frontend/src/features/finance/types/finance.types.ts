import type { EventStatus, EventType } from '@/features/events/types/event.types';

export interface FinanceTotals {
  /** Jami olingan pul: o'tgan to'ylar + bekor qilingan bronlardan qolgan zaklad. */
  income: string;
  eventsIncome: string;
  retainedDeposits: string;
  expenses: string;
  profit: string;
  /** O'tgan to'ylarning shartnoma summasi. */
  accrued: string;
  /** O'tgan to'ylardan hali olinmagan pul. */
  debt: string;
  eventsCount: number;
  guestsCount: number;
}

export interface SeriesPoint {
  /** Kun (`YYYY-MM-DD`) yoki oy (`YYYY-MM`). */
  key: string;
  income: string;
  expense: string;
  profit: string;
}

export interface FinanceEvent {
  id: string;
  number: number;
  title: string | null;
  type: EventType;
  status: EventStatus;
  startAt: string;
  guestCount: number;
  clientName: string;
  hallName: string;
  totalAmount: string;
  paidAmount: string;
  debt: string;
  /** Shu to'yga qilingan xarajatlar va sof foyda (olingan − xarajat). */
  expenses: string;
  netProfit: string;
}

export interface FinanceSummary {
  range: { from: string; to: string; countedUntil: string | null };
  totals: FinanceTotals;
  /** Hali bo'lmagan to'ylar — hisobga kirmaydi. */
  upcoming: { count: number; total: string; paid: string };
  /** Sotib olingan, lekin hali tasdiqlanmagan bozorlik — foydadan ayirilmagan. */
  pendingShopping: { count: number; total: string };
  series: SeriesPoint[];
  expensesByCategory: { id: string; name: string; amount: string }[];
  events: FinanceEvent[];
}

export interface ExpenseCategory {
  id: string;
  name: string;
  isSystem: boolean;
}

export interface Expense {
  id: string;
  category: { id: string; name: string };
  amount: string;
  /** `YYYY-MM-DD`. */
  date: string;
  note: string | null;
  /** To'y xarajati bo'lsa — qaysi to'yniki. */
  event: { id: string; number: number; title: string } | null;
  /** Tasdiqlangan bozorlikdan yozilgan — faqat Bozorlik bo'limida o'zgartiriladi. */
  fromShopping: boolean;
  createdByName: string | null;
  createdAt: string;
}

export interface ExpensePayload {
  categoryId: string;
  amount: string;
  /** Umumiy xarajatda shart; to'y xarajatida yuborilmaydi (to'y kuni olinadi). */
  date?: string;
  note: string | null;
}

/** Bitta to'yning hisobi. */
export interface EventFinance {
  eventId: string;
  totalAmount: string;
  paidAmount: string;
  expensesTotal: string;
  /** Olingan pul − shu to'y xarajatlari. */
  netProfit: string;
  expenses: Expense[];
}
