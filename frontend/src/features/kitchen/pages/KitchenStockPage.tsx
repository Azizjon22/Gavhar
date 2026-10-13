import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarHeart, Check, PackageOpen, Search, Warehouse, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { warehouseApi, warehouseKeys } from '@/features/warehouse/api/warehouse.api';
import { StockUsageList } from '@/features/warehouse/components/StockUsageList';
import { formatQuantity } from '@/features/warehouse/lib/quantity';
import {
  PRODUCT_CATEGORIES,
  type ProductCategory,
  type StockItem,
  type StockUsage,
} from '@/features/warehouse/types/warehouse.types';
import { errorMessage } from '@/lib/error-message';
import { inAppZone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { ProductCategoryIcon } from '../components/ProductCategoryIcon';
import { ProductTile } from '../components/ProductTile';
import { QuantityStepper } from '../components/QuantityStepper';
import { type KgMode, daysUntil, defaultKgMode, quantityValue, toInput } from '../lib/kitchen';
import { useKitchenAgenda } from '../lib/use-kitchen';

/**
 * Ombor oshpaz nigohida: javonda nima bor (narxsiz) va bugungi yoki ertangi to'y uchun
 * nima olingani. Olingan mahsulot qoldiqdan o'zi ayriladi; xato olinganini oshpaz shu
 * kuni o'zi qaytaradi.
 */
export function KitchenStockPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const { query: agendaQuery, events: agenda } = useKitchenAgenda();
  const stock = useQuery({
    queryKey: warehouseKeys.stock,
    queryFn: warehouseApi.stock,
    staleTime: 0,
  });
  const usages = useQuery({
    queryKey: warehouseKeys.myUsages,
    queryFn: warehouseApi.myUsages,
    staleTime: 0,
  });

  const events = (agenda ?? []).filter((event) => daysUntil(event.day) <= 1);
  const [eventId, setEventId] = useState<string | null>(null);
  // Eng yaqin to'y oldindan tanlanadi — odatda oshpaz bugungi to'y uchun oladi.
  const chosen = events.find((event) => event.id === eventId) ?? events[0];
  const [taking, setTaking] = useState<Map<string, number>>(() => new Map());
  const [modes, setModes] = useState<Map<string, KgMode>>(() => new Map());
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<ProductCategory | 'ALL'>('ALL');
  const [reviewing, setReviewing] = useState(false);
  const [returning, setReturning] = useState<StockUsage | null>(null);

  const items = stock.data ?? [];
  const modeOf = (item: StockItem): KgMode =>
    modes.get(item.id) ?? defaultKgMode(item.productCategory);
  const needle = query.trim().toLowerCase();
  const sections = PRODUCT_CATEGORIES.filter((category) =>
    items.some((item) => (item.productCategory ?? 'OTHER') === category),
  );
  const visible = items.filter(
    (item) =>
      (section === 'ALL' || (item.productCategory ?? 'OTHER') === section) &&
      (needle === '' || item.name.toLowerCase().includes(needle)),
  );
  const lines = items.filter((item) => (taking.get(item.id) ?? 0) > 0);
  const today = inAppZone().format('YYYY-MM-DD');
  const takenToday = (usages.data ?? []).filter(
    (usage) => inAppZone(usage.createdAt).format('YYYY-MM-DD') === today,
  );

  const setAmount = (item: StockItem, value: number) =>
    setTaking((current) => {
      const next = new Map(current);
      if (value <= 0) next.delete(item.id);
      else next.set(item.id, Math.min(value, Number(item.quantity)));
      return next;
    });

  const takeMutation = useMutation({
    mutationFn: () =>
      warehouseApi.take({
        eventId: chosen?.id ?? '',
        items: lines.map((item) => ({
          itemId: item.id,
          quantity: quantityValue(taking.get(item.id) ?? 0),
        })),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
      toast.success(t('kitchen.stock.taken'));
      setTaking(new Map());
      setReviewing(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const returnMutation = useMutation({
    mutationFn: (usage: StockUsage) => warehouseApi.giveBack(usage.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
      toast.success(t('warehouse.usages.returned'));
      setReturning(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const error = agendaQuery.error ?? stock.error ?? usages.error;
  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          void agendaQuery.refetch();
          void stock.refetch();
          void usages.refetch();
        }}
      />
    );
  }
  if (!agenda || !stock.data || !usages.data) {
    return (
      <div className="grid grid-cols-1 gap-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 pb-40 sm:pb-24">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {t('kitchen.stock.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('kitchen.stock.description')}</p>
      </div>

      <section>
        <p className="mb-2 text-sm font-semibold">{t('kitchen.stock.forWhich')}</p>
        {events.length === 0 ? (
          <p className="flex items-center gap-2 rounded-2xl border border-dashed bg-card/60 px-4 py-3 text-sm text-muted-foreground">
            <CalendarHeart className="size-4 shrink-0" />
            {t('kitchen.stock.noEvents')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {events.map((event) => {
              const selected = chosen?.id === event.id;
              return (
                <button
                  key={event.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setEventId(event.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    selected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'bg-card hover:border-gold/60',
                  )}
                >
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-bold',
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {daysUntil(event.day) <= 0
                      ? t('kitchen.when.today')
                      : t('kitchen.when.tomorrow')}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {event.title ?? event.clientName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {event.guestCount} {t('kitchen.guests')}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {takenToday.length > 0 && (
        <section className="grid grid-cols-1 gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <PackageOpen className="size-4 text-gold-dark dark:text-gold-light" />
            {t('kitchen.stock.today')}
          </h2>
          <StockUsageList
            usages={takenToday}
            showEvent
            canReturn={(usage) => usage.takenById === userId}
            onReturn={setReturning}
          />
        </section>
      )}

      <section className="grid grid-cols-1 gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(inputEvent) => setQuery(inputEvent.target.value)}
            placeholder={t('kitchen.builder.search')}
            aria-label={t('kitchen.builder.search')}
            className="h-11 bg-card pr-9 pl-9"
          />
          {needle && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('common.clear')}
              className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {(['ALL', ...sections] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={section === item}
              onClick={() => setSection(item)}
              className={cn(
                'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                section === item
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground',
              )}
            >
              {item !== 'ALL' && <ProductCategoryIcon category={item} className="size-3.5" />}
              {item === 'ALL' ? t('common.all') : t(`warehouse.productCategory.${item}`)}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/60 py-12 text-center">
            <Warehouse className="size-7 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t('kitchen.stock.empty')}</p>
          </div>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card/60 p-4 text-center text-sm text-muted-foreground">
            {t('kitchen.builder.notFound', { query })}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 min-[480px]:grid-cols-3 lg:grid-cols-4">
            {visible.map((item, index) => {
              const value = taking.get(item.id) ?? 0;
              const empty = Number(item.quantity) <= 0;
              const mode = modeOf(item);
              return (
                <ProductTile
                  key={item.id}
                  index={index}
                  name={item.name}
                  unit={item.unit}
                  category={item.productCategory}
                  photo={item.photo}
                  selected={value > 0}
                  corner={
                    empty
                      ? t('kitchen.stock.out')
                      : t('kitchen.stock.left', {
                          amount: `${formatQuantity(item.quantity)} ${t(`warehouse.unit.${item.unit}`)}`,
                        })
                  }
                  onPick={() =>
                    !empty &&
                    value === 0 &&
                    setAmount(item, item.unit === 'KG' && mode === 'g' ? 0.05 : 1)
                  }
                >
                  <div className={cn(empty && 'pointer-events-none opacity-40')}>
                    <QuantityStepper
                      name={item.name}
                      unit={item.unit}
                      value={value}
                      mode={mode}
                      max={Number(item.quantity)}
                      onChange={(next) => setAmount(item, next)}
                      onModeChange={(next) =>
                        setModes((current) => new Map(current).set(item.id, next))
                      }
                    />
                  </div>
                </ProductTile>
              );
            })}
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-[84px] z-20 px-4 lg:bottom-5">
        <div
          className={cn(
            'mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-2xl border p-3 shadow-xl backdrop-blur-xl',
            lines.length > 0 ? 'border-primary/40 bg-card/95' : 'bg-card/85',
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl',
                lines.length > 0
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              <PackageOpen className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {lines.length > 0
                  ? t('kitchen.builder.cartCount', { count: lines.length })
                  : t('kitchen.stock.nothing')}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {chosen ? (chosen.title ?? chosen.clientName) : t('kitchen.stock.pickEvent')}
              </p>
            </div>
          </div>
          <Button disabled={lines.length === 0 || !chosen} onClick={() => setReviewing(true)}>
            {t('kitchen.stock.take')}
            <ArrowRight />
          </Button>
        </div>
      </div>

      <Dialog
        open={reviewing}
        onOpenChange={(open) => !takeMutation.isPending && setReviewing(open)}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t('kitchen.stock.reviewTitle')}</DialogTitle>
            <DialogDescription>
              {chosen &&
                t('kitchen.stock.reviewText', { event: chosen.title ?? chosen.clientName })}
            </DialogDescription>
          </DialogHeader>
          <ul className="grid divide-y">
            {lines.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-semibold">
                  <Check className="size-4 shrink-0 text-success" />
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="tabular shrink-0 font-bold">
                  {toInput(taking.get(item.id) ?? 0, item.unit, modeOf(item))}{' '}
                  {item.unit === 'KG'
                    ? t(modeOf(item) === 'g' ? 'kitchen.builder.gram' : 'kitchen.builder.kg')
                    : t(`warehouse.unit.${item.unit}`)}
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={takeMutation.isPending}
              onClick={() => setReviewing(false)}
            >
              {t('common.back')}
            </Button>
            <Button loading={takeMutation.isPending} onClick={() => takeMutation.mutate()}>
              <PackageOpen />
              {t('kitchen.stock.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={returning !== null}
        onOpenChange={(open) => !open && setReturning(null)}
        title={t('warehouse.usages.confirmTitle')}
        description={t('kitchen.stock.returnText')}
        confirmLabel={t('warehouse.usages.giveBack')}
        loading={returnMutation.isPending}
        onConfirm={() => returning && returnMutation.mutate(returning)}
      />
    </div>
  );
}
