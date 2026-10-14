import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Armchair,
  ArrowLeft,
  Ban,
  CalendarDays,
  CircleCheck,
  Download,
  Ellipsis,
  FileText,
  HandCoins,
  Pencil,
  Phone,
  RotateCcw,
  Trash2,
  Soup,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { EventExpensesCard } from '@/features/finance/components/EventExpensesCard';
import { EventStockCard } from '@/features/warehouse/components/EventStockCard';
import { EventWorkersCard } from '@/features/workers/components/EventWorkersCard';
import { usePermissions } from '@/hooks/use-permissions';
import { downloadFile } from '@/lib/download';
import { errorMessage } from '@/lib/error-message';
import { formatDate, formatDateTime, formatTime, inAppZone } from '@/lib/format';
import { formatAmount, toSum } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { type EventTransition, eventKeys, eventsApi } from '../api/events.api';
import { CancelEventDialog } from '../components/CancelEventDialog';
import { EventFormDialog } from '../components/EventFormDialog';
import { EventStatusBadge } from '../components/EventStatusBadge';
import { PaymentDialog } from '../components/PaymentDialog';
import { type EventDetail, type EventStatus, type Payment, isEditable } from '../types/event.types';

/**
 * Asosiy keyingi qadam: kutilayotgan — tasdiqlash (to'liq to'langanda o'zi tasdiqlanadi),
 * tasdiqlangan — kuni kelgach yakunlash.
 */
const NEXT_STEP: Partial<Record<EventStatus, EventTransition>> = {
  REQUEST: 'confirm',
  CONFIRMED: 'complete',
};

type DialogName = 'edit' | 'payment' | 'cancel' | 'delete' | null;

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-[18px]">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm font-semibold">{children}</dd>
      </div>
    </div>
  );
}

function AmountRow({ label, amount, strong }: { label: string; amount: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-4', strong && 'text-base font-bold')}>
      <dt className={strong ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular whitespace-nowrap">{amount}</dd>
    </div>
  );
}

export function EventDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [dialog, setDialog] = useState<DialogName>(null);
  const [voiding, setVoiding] = useState<Payment | null>(null);

  const query = useQuery({ queryKey: eventKeys.detail(id), queryFn: () => eventsApi.get(id) });
  const event = query.data;

  /** Server qaytargan yangi holatni keshga yozadi va ro'yxat/kalendarni yangilaydi. */
  const applyUpdate = (updated: EventDetail) => {
    queryClient.setQueryData(eventKeys.detail(id), updated);
    void queryClient.invalidateQueries({ queryKey: eventKeys.all });
  };
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const transition = useMutation({
    mutationFn: (action: EventTransition) => eventsApi.transition(id, action),
    onSuccess: (updated, action) => {
      applyUpdate(updated);
      toast.success(t(`events.toast.${action}`));
    },
    onError,
  });
  const voidMutation = useMutation({
    mutationFn: (payment: Payment) => eventsApi.voidPayment(id, payment.id),
    onSuccess: (updated) => {
      applyUpdate(updated);
      toast.success(t('payments.toast.voided'));
      setVoiding(null);
    },
    onError,
  });
  const deleteMutation = useMutation({
    mutationFn: () => eventsApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: eventKeys.all });
      toast.success(t('events.toast.deleted'));
      navigate('/events', { replace: true });
    },
    onError,
  });
  const download = useMutation({
    mutationFn: ({ url, name }: { url: string; name: string }) => downloadFile(url, name),
    onError,
  });

  const backLink = (
    <Link
      to="/events"
      className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <ArrowLeft className="size-4" />
      {t('events.backToList')}
    </Link>
  );

  if (query.isError) {
    return (
      <>
        {backLink}
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      </>
    );
  }
  if (!event) {
    return (
      <>
        {backLink}
        <Skeleton className="h-24 rounded-2xl" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </>
    );
  }

  const canUpdate = can('events:update');
  const editable = isEditable(event.status);
  // To'y kuni kelmaguncha yakunlab bo'lmaydi.
  const dayArrived =
    inAppZone(event.startAt).format('YYYY-MM-DD') <= inAppZone().format('YYYY-MM-DD');
  const step = NEXT_STEP[event.status];
  const nextStep = step === 'complete' && !dayArrived ? undefined : step;
  // Pul (summa, to'lovlar, shartnoma) faqat moliya ruxsati bor foydalanuvchiga ko'rinadi.
  const showMoney = can('finance:read');
  const paid = toSum(event.paidAmount);
  const total = toSum(event.totalAmount);
  const cancellable = event.status === 'REQUEST' || event.status === 'CONFIRMED';
  const reopenable = event.status === 'CANCELLED' || event.status === 'COMPLETED';
  // Tasdiqlangan, yakunlangan yoki pulli bron o'chirilmaydi (server oxirgi so'zni aytadi).
  const removable =
    (event.status === 'REQUEST' || event.status === 'CANCELLED') &&
    (event.payments ?? []).length === 0;
  // Yakunlangan to'yning qarzi ham undiriladi; bekor qilinganida — faqat qaytarish.
  const canPay = can('finance:create') && (event.status !== 'CANCELLED' || paid > 0);
  const currency = t('common.currency');
  const money = (value: string | undefined) => `${formatAmount(value)} ${currency}`;
  const secondaryActions = canUpdate && (cancellable || reopenable || removable);

  return (
    <>
      {backLink}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {t('events.detail.title', { number: event.number })}
            </h1>
            <EventStatusBadge status={event.status} />
          </div>
          <p className="mt-1.5 text-muted-foreground">
            {t(`events.type.${event.type}`)}
            {event.title && ` — ${event.title}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showMoney && (
            <Button
              variant="outline"
              loading={download.isPending}
              onClick={() =>
                download.mutate({
                  url: eventsApi.contractUrl(event.id),
                  name: `shartnoma-${event.number}.pdf`,
                })
              }
            >
              <FileText />
              {t('events.actions.contract')}
            </Button>
          )}
          {canUpdate && editable && (
            <Button variant="outline" onClick={() => setDialog('edit')}>
              <Pencil />
              {t('common.edit')}
            </Button>
          )}
          {canUpdate && nextStep && (
            <Button loading={transition.isPending} onClick={() => transition.mutate(nextStep)}>
              <CircleCheck />
              {t(`events.actions.${nextStep}`)}
            </Button>
          )}
          {secondaryActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={t('common.actions')}>
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {reopenable && (
                  <DropdownMenuItem onSelect={() => transition.mutate('reopen')}>
                    <RotateCcw />
                    {t('events.actions.reopen')}
                  </DropdownMenuItem>
                )}
                {cancellable && (
                  <DropdownMenuItem variant="destructive" onSelect={() => setDialog('cancel')}>
                    <Ban />
                    {t('events.actions.cancel')}
                  </DropdownMenuItem>
                )}
                {removable && can('events:delete') && (
                  <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
                    <Trash2 />
                    {t('common.delete')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {event.status === 'CANCELLED' && event.cancelReason && (
        <p className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm leading-relaxed">
          <span className="font-semibold">{t('events.detail.cancelReason')}:</span>{' '}
          {event.cancelReason}
        </p>
      )}

      <div
        className={cn('grid items-start gap-6', showMoney && 'lg:grid-cols-[minmax(0,1fr)_380px]')}
      >
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('events.detail.info')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-5 sm:grid-cols-2">
                <InfoRow icon={<Users />} label={t('events.form.client')}>
                  {event.client.fullName}
                </InfoRow>
                <InfoRow icon={<Phone />} label={t('clients.columns.phone')}>
                  <a href={`tel:${event.client.phone}`} className="tabular hover:underline">
                    {formatPhone(event.client.phone)}
                  </a>
                </InfoRow>
                <InfoRow icon={<CalendarDays />} label={t('events.detail.when')}>
                  <span className="tabular">
                    {formatDate(event.startAt)}, {formatTime(event.startAt)}–
                    {formatTime(event.endAt)}
                  </span>
                </InfoRow>
                <InfoRow icon={<Users />} label={t('events.form.guestCount')}>
                  {t('halls.guests', { count: event.guestCount })}
                </InfoRow>
                {event.tableCapacity && (
                  <InfoRow icon={<Armchair />} label={t('events.form.tableCapacity')}>
                    {t('events.tableSeats', { count: event.tableCapacity })}
                  </InfoRow>
                )}
                {(event.firstDish || event.secondDish) && (
                  <InfoRow icon={<Soup />} label={t('events.detail.dishes')}>
                    {[event.firstDish, event.secondDish].filter(Boolean).join(' · ')}
                  </InfoRow>
                )}
                {event.menuPackage && (
                  <InfoRow icon={<UtensilsCrossed />} label={t('events.form.menuPackage')}>
                    {event.menuPackage.name}
                  </InfoRow>
                )}
              </dl>
              {event.note && (
                <p className="mt-5 rounded-xl bg-muted/60 p-4 text-sm leading-relaxed whitespace-pre-line">
                  {event.note}
                </p>
              )}
            </CardContent>
          </Card>

          {showMoney && (
            <Card>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                <CardTitle>{t('payments.title')}</CardTitle>
                {canPay && (
                  <Button size="sm" onClick={() => setDialog('payment')}>
                    <HandCoins />
                    {t('payments.add')}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {(event.payments ?? []).length === 0 ? (
                  <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    {t('payments.empty')}
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {(event.payments ?? []).map((payment) => (
                      <li
                        key={payment.id}
                        className="flex items-center gap-3 rounded-xl border p-3.5 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 font-semibold">
                            <Badge variant={payment.kind === 'REFUND' ? 'destructive' : 'success'}>
                              {t(`payments.kind.${payment.kind}`)}
                            </Badge>
                            <span className="tabular whitespace-nowrap">
                              {payment.kind === 'REFUND' ? '− ' : ''}
                              {money(payment.amount)}
                            </span>
                          </p>
                          <p className="tabular mt-1 truncate text-xs text-muted-foreground">
                            {formatDateTime(payment.paidAt)} ·{' '}
                            {t(`payments.method.${payment.method}`)}
                            {payment.note && ` · ${payment.note}`}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t('payments.actionsLabel')}
                            >
                              <Ellipsis />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() =>
                                download.mutate({
                                  url: eventsApi.receiptUrl(event.id, payment.id),
                                  name: `kvitansiya-${event.number}.pdf`,
                                })
                              }
                            >
                              <Download />
                              {t('payments.receipt')}
                            </DropdownMenuItem>
                            {can('finance:delete') && (
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setVoiding(payment)}
                              >
                                <Ban />
                                {t('payments.void')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {can('staff:read') && (
            <EventWorkersCard eventId={event.id} locked={event.status === 'CANCELLED'} />
          )}

          <EventStockCard eventId={event.id} />

          {can('finance:read') && (
            <EventExpensesCard
              revision={event.paidAmount}
              event={{
                id: event.id,
                label: `№ ${event.number} · ${event.title ?? event.client.fullName}`,
              }}
            />
          )}
        </div>

        {showMoney && (
          <Card className="lg:sticky lg:top-24">
            <CardHeader>
              <CardTitle>{t('events.summary.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                <AmountRow
                  label={t('events.summary.package')}
                  amount={event.menuPackage?.name ?? '—'}
                />
                <div className="my-1 h-px bg-border" />
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="font-semibold">{t('events.summary.total')}</dt>
                  <dd className="tabular font-display text-3xl font-semibold whitespace-nowrap text-gold-dark dark:text-gold-light">
                    {formatAmount(event.totalAmount)}
                  </dd>
                </div>
                <p className="-mt-2 text-right text-xs text-muted-foreground">{currency}</p>

                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={total > 0 ? Math.round((paid / total) * 100) : 0}
                  aria-label={t('events.summary.paid')}
                  className="h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="bg-gold-gradient h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${total > 0 ? Math.min(100, (paid / total) * 100) : 0}%` }}
                  />
                </div>
                <AmountRow
                  label={t('events.summary.received')}
                  amount={money(event.receivedAmount)}
                />
                {toSum(event.refundedAmount) > 0 && (
                  <AmountRow
                    label={t('events.summary.refunded')}
                    amount={`− ${money(event.refundedAmount)}`}
                  />
                )}
                <AmountRow label={t('events.summary.paid')} amount={money(event.paidAmount)} />
                <div
                  className={cn(
                    'flex justify-between gap-4 font-bold',
                    toSum(event.debt) > 0 && event.status !== 'CANCELLED'
                      ? 'text-destructive'
                      : 'text-success',
                  )}
                >
                  <dt>{t('events.summary.debt')}</dt>
                  <dd className="tabular whitespace-nowrap">{money(event.debt)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        )}
      </div>

      <EventFormDialog
        open={dialog === 'edit'}
        onOpenChange={(open) => !open && setDialog(null)}
        event={event}
        onSaved={applyUpdate}
      />
      <PaymentDialog
        event={event}
        open={dialog === 'payment'}
        onOpenChange={(open) => !open && setDialog(null)}
        onDone={applyUpdate}
      />
      <CancelEventDialog
        event={event}
        open={dialog === 'cancel'}
        onOpenChange={(open) => !open && setDialog(null)}
        onDone={applyUpdate}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('events.confirm.deleteTitle')}
        description={t('events.confirm.deleteText', { number: event.number })}
        confirmLabel={t('common.delete')}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(open) => !open && setVoiding(null)}
        title={t('payments.confirm.voidTitle')}
        description={t('payments.confirm.voidText', {
          amount: voiding ? formatAmount(voiding.amount) : '',
        })}
        confirmLabel={t('payments.void')}
        variant="destructive"
        loading={voidMutation.isPending}
        onConfirm={() => voiding && voidMutation.mutate(voiding)}
      />
    </>
  );
}
