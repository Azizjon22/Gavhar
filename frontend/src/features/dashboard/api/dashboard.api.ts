import { http } from '@/lib/api-client';
import type { DashboardOverview } from '../types/dashboard.types';

export const dashboardApi = {
  overview: () => http.get<DashboardOverview>('/dashboard/overview'),
};

export const dashboardKeys = {
  overview: ['dashboard', 'overview'] as const,
};
