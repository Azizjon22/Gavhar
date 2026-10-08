import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ClipboardCheck, type LucideIcon, Plus, ShoppingCart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { financeKeys } from '@/features/finance/api/finance.api';
import { usePermissions } from '@/hooks/use-permissions';
import { errorMessage } from '@/lib/error-message';
import { inAppZone } from '@/lib/format';
import { formatAmount } from '@/lib/money';
import { useAuthStore } from '@/stores/auth.store';
import { shoppingApi, shoppingKeys } from '../api/shopping.api';
import { EventCard } from '../components/EventCard';
import { type EditorTarget, ListEditorDialog } from '../components/ListEditorDialog';
import { PurchaseDialog, type PurchaseTarget } from '../components/PurchaseDialog';
import { type ListAction, ShoppingListBlock } from '../components/ShoppingListBlock';
import type { KitchenEvent, ShoppingList, ShoppingStatus } from '../types/shopping.types';

/** `general` — to'yga bog'lanmagan umumiy bozorlik (tuz, salfetka kabi doimiy xaridlar). */
const TABS = ['today', 'upcoming', 'past', 'general'] as const;
type Tab = (typeof TABS)[number];
const FORMAT = 'YYYY-MM-DD';
/** Qancha orqaga va oldinga qaraladi (kun). */
const PAST_DAYS = 21;
const FUTURE_DAYS = 60;

type ConfirmState = {
  action: 'confirm' | 'unconfirm' | 'delete';
  event?: KitchenEvent;
  list: ShoppingList;
} | null;

/**
 * Bozorlik: har bir to'y kartasida menyu va bozorlik ro'yxatlari.
 * Oshpaz yozadi → SUPER_ADMIN tekshiradi → admin sotib olib narx kiritadi →
 * SUPER_ADMIN tasdiqlaydi (shundan keyingina xarajatga yoziladi).
 */
export function ShoppingPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { can, isSuperAdmin } = usePermissions();
  const userId = useAuthStore((state) => state.user?.id) ?? '';
  const viewer = useMemo(
    () => ({
      id: userId,
      isSuperAdmin,
      canWrite: can('shopping:create'),
      canPurchase: can('shopping:purchase'),
    }),
    [userId, isSuperAdmin, can],
  );

  const today = inAppZone().format(FORMAT);
  const range = useMemo(
    () => ({
      from: inAppZone().subtract(PAST_DAYS, 'day').format(FORMAT),
      to: inAppZone().add(FUTURE_DAYS, 'day').format(FORMAT),
    }),
    // Kun almashganda oraliq ham yangilanadi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today],
  );

  const [tab, setTab] = useState<Tab | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [purchase, setPurchase] = useState<PurchaseTarget | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const query = useQuery({
    queryKey: shoppingKeys.events(range),
    queryFn: () => shoppingApi.events(range),
    // Ro'yxatlar ustida bir necha kishi ishlaydi — sahifa ochilganda va har 20 soniyada yangilanadi.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 20_000,
  });

  const groups = useMemo(() => {
    const events = query.data ?? [];
    return {
      today: events.filter((event) => event.day === today),
      upcoming: events.filter((event) => event.day > today),
      // O'tganlar — eng yaqini tepada.
      past: events.filter((event) => event.day < today).reverse(),
    };
  }, [query.data, today]);
  const active: Tab = tab ?? (groups.today.length > 0 || !query.data ? 'today' : 'upcoming');

  const mutation = useMutation({
    mutationFn: async (input: NonNullable<ConfirmState>) => {
      if (input.action === 'delete') return shoppingApi.remove(input.list.id);
      return input.action === 'confirm'
        ? shoppingApi.confirm(input.list.id)
        : shoppingApi.unconfirm(input.list.id);
    },
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
      toast.success(t(`shopping.toast.${input.action}`));
      setConfirm(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const handleAction = (
    action: ListAction,
    event: KitchenEvent | undefined,
    list: ShoppingList,
  ) => {
    if (action === 'edit' || action === 'review') setEditor({ mode: action, event, list });
    else if (action === 'purchase') setPurchase({ event, list });
    else setConfirm({ action, event, list });
  };

  const generalQuery = useQuery({
    queryKey: shoppingKeys.general,
    queryFn: shoppingApi.general,
    staleTime: 0,
    refetchInterval: 20_000,
  });
  const general = generalQuery.data;
  // To'y ro'yxatlari ham, umumiy ro'yxatlar ham sanaladi — qo'ng'iroqchadagi son bilan bir xil.
  const countByStatus = (status: ShoppingStatus) =>
    [...(query.data ?? []).flatMap((event) => event.lists), ...(general ?? [])].filter(
      (list) => list.status === status,
    ).length;
  const tasks: { key: string; icon: LucideIcon; count: number }[] = [
    ...(isSuperAdmin
      ? [
          { key: 'review', icon: ClipboardCheck, count: countByStatus('SUBMITTED') },
          { key: 'confirm', icon: BadgeCheck, count: countByStatus('PURCHASED') },
        ]
      : []),
    ...(viewer.canPurchase
      ? [{ key: 'purchase', icon: ShoppingCart, count: countByStatus('APPROVED') }]
      : []),
  ].filter((task) => task.count > 0);

  const events = active === 'general' ? [] : groups[active];
  const countOf = (key: Tab) => (key === 'general' ? (general?.length ?? 0) : groups[key].length);

  return (
    <>
      <PageHeader title={t('shopping.title')} description={t('shopping.description')} />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={active} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList>
            {TABS.map((key) => (
              <TabsTrigger key={key} value={key}>
                {t(`shopping.tabs.${key}`)}
                {query.data && <span className="tabular ml-1 opacity-60">{countOf(key)}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {tasks.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {tasks.map(({ key, icon: Icon, count }) => (
              <li
                key={key}
                className="flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1.5 text-sm font-semibold"
              >
                <Icon className="size-4 text-gold-dark dark:text-gold-light" />
                {t(`shopping.tasks.${key}`, { count })}
              </li>
            ))}
          </ul>
        )}
      </div>

      {active === 'general' ? (
        <Card className="grid gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-semibold">{t('shopping.general.title')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('shopping.general.subtitle')}</p>
            </div>
            {viewer.canWrite && (
              <Button onClick={() => setEditor({ mode: 'create' })}>
                <Plus />
                {t('shopping.write')}
              </Button>
            )}
          </div>
          {generalQuery.isError ? (
            <ErrorState error={generalQuery.error} onRetry={() => void generalQuery.refetch()} />
          ) : !general ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : general.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
              {t('shopping.general.empty')}
            </p>
          ) : (
            general.map((list) => (
              <ShoppingListBlock
                key={list.id}
                list={list}
                viewer={viewer}
                today={today}
                onAction={(action, target) => handleAction(action, undefined, target)}
              />
            ))
          )}
        </Card>
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : !query.data ? (
        <div className="grid gap-5">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : events.length === 0 ? (
        <Card>
          <EmptyState
            title={t(`shopping.empty.${active}.title`)}
            description={t(`shopping.empty.${active}.text`)}
          />
        </Card>
      ) : (
        <div className="grid gap-5">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              viewer={viewer}
              today={today}
              onWrite={(target) => setEditor({ mode: 'create', event: target })}
              onAction={handleAction}
            />
          ))}
        </div>
      )}

      <ListEditorDialog target={editor} onClose={() => setEditor(null)} />
      <PurchaseDialog target={purchase} onClose={() => setPurchase(null)} />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t(`shopping.confirmDialog.${confirm?.action ?? 'confirm'}.title`)}
        description={t(`shopping.confirmDialog.${confirm?.action ?? 'confirm'}.text`, {
          name: confirm?.list.createdByName ?? '',
          amount: formatAmount(confirm?.list.total),
        })}
        confirmLabel={t(`shopping.confirmDialog.${confirm?.action ?? 'confirm'}.submit`)}
        variant={confirm?.action === 'confirm' ? 'default' : 'destructive'}
        loading={mutation.isPending}
        onConfirm={() => confirm && mutation.mutate(confirm)}
      />
    </>
  );
}
