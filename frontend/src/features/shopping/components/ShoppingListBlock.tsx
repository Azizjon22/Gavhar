import { useMutation } from '@tanstack/react-query';
import {
  BadgeCheck,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileDown,
  Pencil,
  ShoppingCart,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatQuantity } from '@/features/warehouse/lib/quantity';
import { downloadFile } from '@/lib/download';
import { errorMessage } from '@/lib/error-message';
import { formatDate, formatDateTime } from '@/lib/format';
import { formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { shoppingApi } from '../api/shopping.api';
import { STATUS_VARIANT } from '../lib/status';
import type { KitchenEvent, ShoppingList } from '../types/shopping.types';

export type ListAction = 'edit' | 'review' | 'purchase' | 'confirm' | 'unconfirm' | 'delete';

interface Props {
  /** Berilmasa — to'yga bog'lanmagan umumiy ro'yxat. */
  event?: KitchenEvent;
  list: ShoppingList;
  /** Joriy foydalanuvchi shu ro'yxat ustida nima qila oladi. */
  viewer: { id: string; isSuperAdmin: boolean; canWrite: boolean; canPurchase: boolean };
  today: string;
  onAction: (action: ListAction, list: ShoppingList) => void;
}

/** Bitta bozorlik ro'yxati: kim yozgan, holati, mahsulotlar va narxlar. */
export function ShoppingListBlock({ event, list, viewer, today, onAction }: Props) {
  const { t } = useTranslation();
  const pdfMutation = useMutation({
    mutationFn: () =>
      downloadFile(shoppingApi.pdfUrl(list.id), `bozorlik-${event?.number ?? 'umumiy'}.pdf`),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const isOwner = list.createdById === viewer.id;
  // Umumiy bozorlik biror kunga bog'lanmagan — unda "to'y kuni" cheklovi yo'q.
  const tooEarly = event !== undefined && today < event.day;
  const button = (action: ListAction, icon: ReactNode, label: string, primary = false) => (
    <Button
      key={action}
      size="sm"
      variant={primary ? 'default' : 'outline'}
      onClick={() => onAction(action, list)}
    >
      {icon}
      {label}
    </Button>
  );

  const actions: ReactNode[] = [];
  if (list.status === 'SUBMITTED') {
    if (viewer.isSuperAdmin) {
      actions.push(button('review', <ClipboardCheck />, t('shopping.actions.review'), true));
    } else if (isOwner && viewer.canWrite) {
      actions.push(button('edit', <Pencil />, t('common.edit')));
    }
  }
  // Bozorlik to'y kuni qilinadi: undan oldin tugma o'chiq turadi va sababi yonida yoziladi.
  const waitingForDay = list.status === 'APPROVED' && viewer.canPurchase && tooEarly;
  if (list.status === 'APPROVED' && viewer.canPurchase) {
    actions.push(
      tooEarly ? (
        <Button key="purchase" size="sm" disabled>
          <ShoppingCart />
          {t('shopping.actions.purchase')}
        </Button>
      ) : (
        button('purchase', <ShoppingCart />, t('shopping.actions.purchase'), true)
      ),
    );
  }
  if (list.status === 'PURCHASED' && viewer.isSuperAdmin) {
    actions.push(button('purchase', <Pencil />, t('shopping.actions.fixPrices')));
    actions.push(button('confirm', <BadgeCheck />, t('shopping.actions.confirm'), true));
  }
  if (list.status === 'CONFIRMED' && viewer.isSuperAdmin) {
    actions.push(button('unconfirm', <Undo2 />, t('shopping.actions.unconfirm')));
  }
  const canDelete =
    (viewer.isSuperAdmin && list.status !== 'CONFIRMED') ||
    (isOwner && viewer.canWrite && list.status === 'SUBMITTED');

  return (
    <article className="rounded-xl border bg-card/60 p-3.5 sm:p-4">
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{list.createdByName}</p>
          <p className="tabular text-xs text-muted-foreground">{formatDateTime(list.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={STATUS_VARIANT[list.status]}>{t(`shopping.status.${list.status}`)}</Badge>
          <Button
            variant="outline"
            size="sm"
            loading={pdfMutation.isPending}
            onClick={() => pdfMutation.mutate()}
          >
            <FileDown />
            PDF
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('shopping.actions.delete')}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onAction('delete', list)}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </header>

      <ul className="mt-3 grid gap-1.5 text-sm">
        {list.items.map((item) => {
          const unit = t(`warehouse.unit.${item.unit}`);
          return (
            <li key={item.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className={cn(item.skipped && 'text-muted-foreground line-through')}>
                  {item.name}
                </span>
                {item.note && (
                  <span className="ml-2 text-xs text-muted-foreground">{item.note}</span>
                )}
              </span>
              <span className="tabular flex shrink-0 items-baseline gap-3 whitespace-nowrap">
                <span className="text-muted-foreground">
                  {item.requestedQuantity && (
                    <>
                      <s>{formatQuantity(item.requestedQuantity)}</s> →{' '}
                    </>
                  )}
                  {formatQuantity(item.quantity)} {unit}
                  {item.price && !item.skipped && (
                    <Check className="ml-1.5 inline size-3.5 -translate-y-px text-success" />
                  )}
                </span>
                {item.skipped ? (
                  <span className="min-w-24 text-right text-xs text-muted-foreground">
                    {t('shopping.skipped')}
                  </span>
                ) : (
                  item.price && (
                    <span className="min-w-24 text-right font-semibold">
                      {formatAmount(item.price)} {t('common.currency')}
                    </span>
                  )
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {list.note && (
        <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          {list.note}
        </p>
      )}

      {(Number(list.total) > 0 || list.purchasedByName) && (
        <p className="tabular mt-3 flex flex-wrap items-baseline justify-between gap-x-3 border-t pt-2.5 text-sm">
          <span className="text-xs text-muted-foreground">
            {list.purchasedByName &&
              t('shopping.purchasedBy', {
                name: list.purchasedByName,
                date: formatDateTime(list.purchasedAt),
              })}
          </span>
          <span className="font-semibold">
            {formatAmount(list.total)} {t('common.currency')}
          </span>
        </p>
      )}

      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {waitingForDay && (
            <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="size-4 shrink-0 text-gold-dark dark:text-gold-light" />
              {t('shopping.tooEarly', { date: formatDate(event?.startAt) })}
            </p>
          )}
          {actions}
        </div>
      )}
    </article>
  );
}
