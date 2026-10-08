import { http } from '@/lib/api-client';
import type {
  EventFinance,
  Expense,
  ExpenseCategory,
  ExpensePayload,
  FinanceSummary,
} from '../types/finance.types';

export interface SummaryParams {
  from: string;
  to: string;
  groupBy: 'day' | 'month';
}

export interface ExpenseListParams {
  from: string;
  to: string;
  page: number;
  limit: number;
}

export const financeApi = {
  summary: (params: SummaryParams) => http.get<FinanceSummary>('/finance/summary', { params }),

  expenses: (params: ExpenseListParams) => http.list<Expense>('/finance/expenses', params),
  createExpense: (body: ExpensePayload & { eventId?: string }) =>
    http.post<Expense>('/finance/expenses', body),
  eventFinance: (eventId: string) => http.get<EventFinance>(`/finance/events/${eventId}`),
  updateExpense: (id: string, body: ExpensePayload) =>
    http.patch<Expense>(`/finance/expenses/${id}`, body),
  removeExpense: (id: string) => http.delete(`/finance/expenses/${id}`),

  categories: () => http.get<ExpenseCategory[]>('/finance/categories'),
  createCategory: (name: string) => http.post<ExpenseCategory>('/finance/categories', { name }),
  updateCategory: (id: string, name: string) =>
    http.patch<ExpenseCategory>(`/finance/categories/${id}`, { name }),
  removeCategory: (id: string) => http.delete(`/finance/categories/${id}`),
};

export const financeKeys = {
  all: ['finance'] as const,
  summary: (params: SummaryParams) => ['finance', 'summary', params] as const,
  expenses: (params: ExpenseListParams) => ['finance', 'expenses', params] as const,
  categories: ['finance', 'categories'] as const,
  event: (eventId: string) => ['finance', 'event', eventId] as const,
};
