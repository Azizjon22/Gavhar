import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { financeKeys } from '@/features/finance/api/finance.api';
import { usePermissions } from '@/hooks/use-permissions';
import { errorMessage } from '@/lib/error-message';
import { warehouseApi, warehouseKeys } from '../api/warehouse.api';
import type { StockUsage } from '../types/warehouse.types';
import { StockUsageList } from './StockUsageList';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * To'ylar uchun ombordan olinganlar — bozorlikdan alohida. Super admin narxini ko'radi
 * va xato olinganini istalgan vaqtda omborga qaytaradi.
 */
export function UsagesDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isSuperAdmin } = usePermissions();
  const [returning, setReturning] = useState<StockUsage | null>(null);

  const query = useQuery({
    queryKey: warehouseKeys.usages,
    queryFn: warehouseApi.usages,
    enabled: open,
    staleTime: 0,
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{t('warehouse.usages.title')}</DialogTitle>
            <DialogDescription>{t('warehouse.usages.description')}</DialogDescription>
          </DialogHeader>
          {query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : !query.data ? (
            <div className="grid gap-2">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : query.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('warehouse.usages.empty')}
            </p>
          ) : (
            <div className="max-h-[60dvh] overflow-y-auto">
              <StockUsageList
                usages={query.data}
                showEvent
                canReturn={() => isSuperAdmin}
                onReturn={setReturning}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
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
    </>
  );
}
