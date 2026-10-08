import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { errorMessage } from '@/lib/error-message';
import { formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { financeApi, financeKeys } from '../api/finance.api';
import type { Expense } from '../types/finance.types';
import { ExpenseFormDialog } from './ExpenseFormDialog';

interface Props {
  event: { id: string; label: string };
  /** O'zgarsa hisob qayta olinadi (masalan to'langan summa — yangi to'lovdan keyin). */
  revision?: string;
}

/**
 * To'y xarajatlari va sof foyda: shu to'ydan olingan pul minus unga qilingan
 * xarajatlar (kamerachi, san'atkor, oshpazga to'lov, bozorlik…).
 */
export function EventExpensesCard({ event, revision }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const query = useQuery({
    queryKey: [...financeKeys.event(event.id), revision],
    queryFn: () => financeApi.eventFinance(event.id),
  });
  const categoriesQuery = useQuery({
    queryKey: financeKeys.categories,
    queryFn: financeApi.categories,
    enabled: adding,
  });
  const deleteMutation = useMutation({
    mutationFn: (expense: Expense) => financeApi.removeExpense(expense.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financeKeys.all });
      toast.success(t('finance.toast.expenseDeleted'));
      setDeleting(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const data = query.data;
  const profit = Number(data?.netProfit ?? 0);
  const currency = t('common.currency');

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{t('finance.eventCard.title')}</CardTitle>
        {can('finance:create') && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus />
            {t('finance.addExpense')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !data ? (
          <Skeleton className="h-28 rounded-xl" />
        ) : (
          <>
            {data.expenses.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
                {t('finance.eventCard.empty')}
              </p>
            ) : (
              <ul className="divide-y">
                {data.expenses.map((expense) => (
                  <li key={expense.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {expense.category.name}
                        {expense.fromShopping && (
                          <Badge variant="secondary" className="gap-1">
                            <ShoppingBasket className="size-3" />
                            {t('finance.fromShopping')}
                          </Badge>
                        )}
                      </p>
                      {expense.note && !expense.fromShopping && (
                        <p className="text-xs text-muted-foreground">{expense.note}</p>
                      )}
                    </div>
                    <span className="tabular text-sm font-semibold whitespace-nowrap">
                      {formatAmount(expense.amount)}
                    </span>
                    {can('finance:delete') && !expense.fromShopping ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('common.delete')}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleting(expense)}
                      >
                        <Trash2 />
                      </Button>
                    ) : (
                      <span className="size-8 shrink-0" />
                    )}
                  </li>
                ))}
              </ul>
            )}

            <dl className="mt-4 grid gap-2 border-t pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('finance.eventCard.paid')}</dt>
                <dd className="tabular whitespace-nowrap">{formatAmount(data.paidAmount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('finance.expenses')}</dt>
                <dd className="tabular whitespace-nowrap">− {formatAmount(data.expensesTotal)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t pt-2">
                <dt className="font-bold">{t('finance.profit')}</dt>
                <dd
                  className={cn(
                    'tabular font-display text-2xl font-semibold whitespace-nowrap',
                    profit < 0 ? 'text-destructive' : 'text-gold-dark dark:text-gold-light',
                  )}
                >
                  {formatAmount(data.netProfit)}{' '}
                  <span className="font-sans text-xs font-medium text-muted-foreground">
                    {currency}
                  </span>
                </dd>
              </div>
            </dl>
          </>
        )}
      </CardContent>

      <ExpenseFormDialog
        open={adding}
        onOpenChange={setAdding}
        categories={categoriesQuery.data ?? []}
        event={event}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('finance.confirm.deleteTitle')}
        description={t('finance.confirm.deleteText', {
          category: deleting?.category.name ?? '',
          amount: formatAmount(deleting?.amount),
        })}
        confirmLabel={t('common.delete')}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
      />
    </Card>
  );
}
