import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { financeKeys } from '@/features/finance/api/finance.api';
import { usePermissions } from '@/hooks/use-permissions';
import { errorMessage } from '@/lib/error-message';
import { warehouseApi, warehouseKeys } from '../api/warehouse.api';
import type { StockUsage } from '../types/warehouse.types';
import { StockUsageList } from './StockUsageList';

interface Props {
  eventId: string;
}

/**
 * To'y sahifasida: oshpaz shu to'y uchun ombordan nimalar olgani. Super admin narxini
 * ko'radi va xato olinganini omborga qaytaradi. Hech narsa olinmagan bo'lsa ko'rinmaydi.
 */
export function EventStockCard({ eventId }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isSuperAdmin } = usePermissions();
  const [returning, setReturning] = useState<StockUsage | null>(null);

  const query = useQuery({
    queryKey: warehouseKeys.eventUsages(eventId),
    queryFn: () => warehouseApi.eventUsages(eventId),
  });
  const mutation = useMutation({
    mutationFn: (usage: StockUsage) => warehouseApi.giveBack(usage.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
      toast.success(t('warehouse.usages.returned'));
      setReturning(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (query.data?.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('warehouse.usages.eventTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !query.data ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : (
          <StockUsageList
            usages={query.data}
            canReturn={() => isSuperAdmin}
            onReturn={setReturning}
          />
        )}
      </CardContent>
      <ConfirmDialog
        open={returning !== null}
        onOpenChange={(next) => !next && setReturning(null)}
        title={t('warehouse.usages.confirmTitle')}
        description={t('warehouse.usages.confirmText', {
          name: returning?.takenByName ?? '',
          number: returning?.event.number ?? '',
        })}
        confirmLabel={t('warehouse.usages.giveBack')}
        loading={mutation.isPending}
        onConfirm={() => returning && mutation.mutate(returning)}
      />
    </Card>
  );
}
