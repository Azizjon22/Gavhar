import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { shoppingApi, shoppingKeys } from '@/features/shopping/api/shopping.api';
import { inAppZone } from '@/lib/format';

const FORMAT = 'YYYY-MM-DD';
/** Oshpaz qancha oldinga qaraydi (kun). */
export const AGENDA_DAYS = 90;

/** Bugundan boshlab rejadagi to'ylar (bekor qilinganlarsiz), eng yaqini birinchi. */
export function useKitchenAgenda() {
  const today = inAppZone().format(FORMAT);
  const range = useMemo(
    () => ({ from: today, to: inAppZone().add(AGENDA_DAYS, 'day').format(FORMAT) }),
    [today],
  );
  const query = useQuery({
    queryKey: shoppingKeys.events(range),
    queryFn: () => shoppingApi.events(range),
    staleTime: 0,
    refetchInterval: 60_000,
  });
  const events = useMemo(
    () =>
      (query.data ?? [])
        .filter((event) => event.status !== 'CANCELLED')
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [query.data],
  );
  return { query, events: query.data ? events : undefined, today };
}

/** O'zim yozgan ro'yxatlar — holati tez-tez o'zgaradi. */
export function useMyLists() {
  return useQuery({
    queryKey: shoppingKeys.mine,
    queryFn: shoppingApi.mine,
    staleTime: 0,
    refetchInterval: 30_000,
  });
}
