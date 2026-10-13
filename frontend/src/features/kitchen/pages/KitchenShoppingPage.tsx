import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { shoppingApi, shoppingKeys } from '@/features/shopping/api/shopping.api';
import type { MyShoppingList } from '@/features/shopping/types/shopping.types';
import { downloadFile } from '@/lib/download';
import { errorMessage } from '@/lib/error-message';
import { KitchenListCard } from '../components/KitchenListCard';
import { ListBuilder } from '../components/ListBuilder';
import { useKitchenAgenda, useMyLists } from '../lib/use-kitchen';

type Tab = 'new' | 'mine';

/** Oshpaz bozorligi: yangi ro'yxat yozish va o'z ro'yxatlarining holati. */
export function KitchenShoppingPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'mine' ? 'mine' : 'new';
  const eventId = params.get('event');
  const [cancelling, setCancelling] = useState<MyShoppingList | null>(null);

  const { query: agendaQuery, events } = useKitchenAgenda();
  const myLists = useMyLists();
  const catalog = useQuery({
    queryKey: shoppingKeys.catalog,
    queryFn: shoppingApi.catalog,
    staleTime: 5 * 60_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (list: MyShoppingList) => shoppingApi.remove(list.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
      toast.success(t('kitchen.lists.cancelled'));
      setCancelling(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const pdfMutation = useMutation({
    mutationFn: (list: MyShoppingList) =>
      downloadFile(shoppingApi.pdfUrl(list.id), `bozorlik-${list.event?.number ?? 'umumiy'}.pdf`),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const setTab = (next: Tab) =>
    setParams(next === 'mine' ? { tab: 'mine' } : {}, { replace: true });
  const loading = !events || !catalog.data || !myLists.data;
  const error = agendaQuery.error ?? catalog.error ?? myLists.error;

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {t('kitchen.shopping.title')}
        </h1>
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList>
            <TabsTrigger value="new">{t('kitchen.shopping.new')}</TabsTrigger>
            <TabsTrigger value="mine">
              {t('kitchen.shopping.mine')}
              {myLists.data && (
                <span className="tabular ml-1 opacity-60">{myLists.data.length}</span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void agendaQuery.refetch();
            void catalog.refetch();
            void myLists.refetch();
          }}
        />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : tab === 'new' ? (
        <ListBuilder
          // To'y almashsa (havoladan) — savat yangidan boshlanadi.
          key={eventId ?? 'none'}
          catalog={catalog.data}
          events={events}
          previous={myLists.data}
          initialEventId={eventId}
          onSent={() => setTab('mine')}
        />
      ) : myLists.data.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/60 py-12 text-center">
          <ClipboardList className="size-7 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t('kitchen.lists.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {myLists.data.map((list) => (
            <KitchenListCard
              key={list.id}
              list={list}
              onCancel={setCancelling}
              onPdf={(target) => pdfMutation.mutate(target)}
              pdfLoading={pdfMutation.isPending && pdfMutation.variables.id === list.id}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={t('kitchen.lists.cancelTitle')}
        description={t('kitchen.lists.cancelText')}
        confirmLabel={t('kitchen.lists.cancel')}
        variant="destructive"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelling && cancelMutation.mutate(cancelling)}
      />
    </div>
  );
}
