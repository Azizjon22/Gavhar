import { QueryClient } from '@tanstack/react-query';
import { toApiError } from '@/lib/api-error';

const MAX_RETRIES = 2;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 4xx — mijoz xatosi, qayta urinish foydasiz. Faqat tarmoq va 5xx.
      retry: (failureCount, error) => {
        const { status } = toApiError(error);
        return (status === 0 || status >= 500) && failureCount < MAX_RETRIES;
      },
    },
    mutations: { retry: false },
  },
});
