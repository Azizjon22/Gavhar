import { Check, FileDown, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { STATUS_VARIANT } from '@/features/shopping/lib/status';
import { type MyShoppingList, isItemDone } from '@/features/shopping/types/shopping.types';
import { formatQuantity } from '@/features/warehouse/lib/quantity';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LIST_STEPS, listStepIndex } from '../lib/kitchen';

interface Props {
  list: MyShoppingList;
  /** Bosh sahifada — mahsulotlarsiz, faqat holat. */
  compact?: boolean;
  onCancel?: (list: MyShoppingList) => void;
  onPdf?: (list: MyShoppingList) => void;
  pdfLoading?: boolean;
}

/** Oshpaz ro'yxati: qaysi to'yga, qayerga yetdi (qadamlar) va nima olindi. */
export function KitchenListCard({ list, compact = false, onCancel, onPdf, pdfLoading }: Props) {
  const { t } = useTranslation();
  const step = listStepIndex(list.status);
  const done = list.items.filter(isItemDone).length;
  // Adminga yuborilmagan va xaridi boshlanmagan ro'yxatni oshpaz bekor qila oladi.
  const cancellable = (list.status === 'SUBMITTED' || list.status === 'REVIEWED') && done === 0;

  return (
    <article className="rounded-2xl border bg-card p-4 shadow-soft">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {list.event
              ? `№ ${list.event.number} · ${list.event.title ?? list.event.clientName}`
              : t('shopping.general.title')}
          </p>
          <p className="tabular text-xs text-muted-foreground">
            {formatDateTime(list.createdAt)} ·{' '}
            {t('shopping.itemsCount', { count: list.items.length })}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[list.status]}>{t(`shopping.status.${list.status}`)}</Badge>
      </header>

      <ol className="mt-3.5 grid grid-cols-5 gap-1" aria-label={t('kitchen.lists.progress')}>
        {LIST_STEPS.map((key, index) => {
          const reached = index <= step;
          return (
            <li key={key} className="grid gap-1.5">
              <span
                className={cn(
                  'h-1.5 rounded-full transition-colors',
                  reached ? (index === step ? 'bg-gold' : 'bg-primary') : 'bg-muted',
                )}
              />
              <span
                className={cn(
                  'truncate text-center text-[10px] font-semibold sm:text-[11px]',
                  reached ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {t(`kitchen.lists.steps.${key}`)}
              </span>
            </li>
          );
        })}
      </ol>
      {list.status === 'APPROVED' && done > 0 && (
        <p className="tabular mt-2 text-xs text-muted-foreground">
          {t('shopping.progress', { done, total: list.items.length })}
        </p>
      )}

      {!compact && (
        <ul className="mt-3 grid gap-1.5 border-t pt-3 text-sm">
          {list.items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3">
              <span
                className={cn(
                  'flex min-w-0 items-center gap-1.5',
                  item.skipped && 'text-muted-foreground line-through',
                )}
              >
                {item.price !== null && !item.skipped && (
                  <Check className="size-3.5 shrink-0 text-success" />
                )}
                <span className="truncate">{item.name}</span>
              </span>
              <span className="tabular shrink-0 text-muted-foreground">
                {item.requestedQuantity && (
                  <>
                    <s>{formatQuantity(item.requestedQuantity)}</s> →{' '}
                  </>
                )}
                {formatQuantity(item.quantity)} {t(`warehouse.unit.${item.unit}`)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!compact && (onCancel || onPdf) && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {onPdf && (
            <Button variant="outline" size="sm" loading={pdfLoading} onClick={() => onPdf(list)}>
              <FileDown />
              PDF
            </Button>
          )}
          {onCancel && cancellable && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onCancel(list)}
            >
              <X />
              {t('kitchen.lists.cancel')}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
