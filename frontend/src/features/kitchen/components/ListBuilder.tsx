import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Plus,
  Search,
  Send,
  ShoppingBasket,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { shoppingApi, shoppingKeys } from '@/features/shopping/api/shopping.api';
import type {
  CatalogItem,
  KitchenEvent,
  MenuCourse,
  MyShoppingList,
} from '@/features/shopping/types/shopping.types';
import { formatQuantity } from '@/features/warehouse/lib/quantity';
import {
  PRODUCT_CATEGORIES,
  type ProductCategory,
  WAREHOUSE_UNITS,
  type WarehouseUnit,
} from '@/features/warehouse/types/warehouse.types';
import { errorMessage } from '@/lib/error-message';
import { inAppZone } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  type KgMode,
  daysUntil,
  defaultKgMode,
  fromInput,
  nameKey,
  quantityValue,
  roundFor,
  toInput,
} from '../lib/kitchen';
import { ProductCategoryIcon } from './ProductCategoryIcon';
import { CategoryCover, ProductTile } from './ProductTile';
import { QuantityStepper } from './QuantityStepper';

/**
 * Oshpaz ro'yxatni taom bo'yicha yozadi — hech narsa esdan chiqmasin. Bu bo'linish
 * faqat shu ekranda: yuboriladigan ro'yxatda har mahsulotning bitta jami miqdori
 * bo'ladi. GENERAL — biror taomga bog'lanmagan miqdor (nusxa olingan ro'yxatdan).
 */
type Part = MenuCourse | 'GENERAL';
const STAGES: MenuCourse[] = ['SALAD', 'FIRST_DISH', 'SECOND_DISH', 'OTHER'];
const PART_ORDER: Part[] = [...STAGES, 'GENERAL'];
/** Umumiy (to'yga bog'lanmagan) ro'yxat uchun tanlov qiymati. */
const GENERAL = 'general';

interface Line {
  name: string;
  unit: WarehouseUnit;
  category: ProductCategory | null;
  photo: CatalogItem['photo'];
  /** Har taom uchun miqdor; jami — yig'indisi. */
  parts: Partial<Record<Part, number>>;
}

const totalOf = (line: Line) =>
  Math.round(Object.values(line.parts).reduce((sum, value) => sum + (value ?? 0), 0) * 1000) / 1000;

/** Bosqich taomlari: kelin-kuyov tanlagani bo'lsa — o'sha, bo'lmasa menyudagi variantlar. */
function stageDishes(event: KitchenEvent | undefined, stage: MenuCourse): string[] {
  if (!event) return [];
  if (stage === 'FIRST_DISH' && event.firstDish) return [event.firstDish];
  if (stage === 'SECOND_DISH' && event.secondDish) return [event.secondDish];
  return (event.menu?.sections ?? [])
    .filter((section) => section.course === stage)
    .flatMap((section) => (section.items.length > 0 ? section.items : [section.nameUz]));
}

interface Props {
  catalog: CatalogItem[];
  events: KitchenEvent[];
  previous: MyShoppingList[];
  initialEventId: string | null;
  onSent: () => void;
}

export function ListBuilder({ catalog, events, previous, initialEventId, onSent }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<string>(() =>
    initialEventId && events.some((event) => event.id === initialEventId)
      ? initialEventId
      : (events[0]?.id ?? GENERAL),
  );
  const [cart, setCart] = useState<Map<string, Line>>(() => new Map());
  const [stage, setStage] = useState<MenuCourse>('SALAD');
  const [section, setSection] = useState<ProductCategory | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [modes, setModes] = useState<Map<string, KgMode>>(() => new Map());
  const [custom, setCustom] = useState<{
    name: string;
    quantity: string;
    unit: WarehouseUnit | 'G';
  }>({ name: '', quantity: '', unit: 'KG' });
  const [note, setNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const event = events.find((item) => item.id === target);
  const byName = useMemo(
    () => new Map(catalog.map((item) => [nameKey(item.name), item])),
    [catalog],
  );
  const needle = query.trim().toLowerCase();
  const products = catalog.filter(
    (item) =>
      (section === 'ALL' || (item.productCategory ?? 'OTHER') === section) &&
      (needle === '' || item.name.toLowerCase().includes(needle)),
  );
  const browsing = section === 'ALL' && needle === '';
  const sections = PRODUCT_CATEGORIES.filter((category) =>
    catalog.some((item) => (item.productCategory ?? 'OTHER') === category),
  );
  const lines = [...cart.values()];
  const stageIndex = STAGES.indexOf(stage);
  const nextStage = STAGES[stageIndex + 1];
  const dishes = stageDishes(event, stage);

  const modeOf = (name: string, category: ProductCategory | null): KgMode =>
    modes.get(nameKey(name)) ?? defaultKgMode(category);
  const partOf = (name: string, part: Part = stage) => cart.get(nameKey(name))?.parts[part] ?? 0;

  /** Bitta taom uchun miqdorni qo'yadi; mahsulot jami o'zi hisoblanadi. */
  const setPart = (item: Omit<Line, 'parts'>, value: number, part: Part = stage) =>
    setCart((current) => {
      const next = new Map(current);
      const key = nameKey(item.name);
      const parts = { ...current.get(key)?.parts };
      if (value > 0) parts[part] = value;
      else delete parts[part];
      const line = { ...item, parts };
      if (totalOf(line) <= 0) next.delete(key);
      else next.set(key, line);
      return next;
    });
  const removeLine = (name: string) =>
    setCart((current) => {
      const next = new Map(current);
      next.delete(nameKey(name));
      return next;
    });
  const asLine = (item: CatalogItem): Omit<Line, 'parts'> => ({
    name: item.name,
    unit: item.unit,
    category: item.productCategory,
    photo: item.photo,
  });
  const switchMode = (item: CatalogItem, mode: KgMode) => {
    setModes((current) => new Map(current).set(nameKey(item.name), mode));
    // 200 g ni butun kilogrammda yozib bo'lmaydi — shu taom miqdori qaytadan yoziladi.
    if (mode === 'kg' && !Number.isInteger(partOf(item.name))) setPart(asLine(item), 0);
  };
  const goToStage = (next: MenuCourse) => {
    setStage(next);
    setSection('ALL');
    setQuery('');
  };

  const addCustom = () => {
    const name = custom.name.trim();
    if (name.length < 2) return;
    const known = byName.get(nameKey(name));
    const unit: WarehouseUnit = known?.unit ?? (custom.unit === 'G' ? 'KG' : custom.unit);
    const mode: KgMode = custom.unit === 'G' ? 'g' : 'kg';
    const value = fromInput(custom.quantity, unit, mode);
    if (!(value > 0)) return;
    if (unit === 'KG') setModes((current) => new Map(current).set(nameKey(name), mode));
    setPart(
      {
        name: known?.name ?? name,
        unit,
        category: known?.productCategory ?? null,
        photo: known?.photo ?? null,
      },
      value,
    );
    setCustom({ name: '', quantity: '', unit: custom.unit });
  };

  /** Oldingi ro'yxatdan boshlash — ikkala to'yda mehmon soni bo'lsa, unga moslanadi. */
  const copyFrom = (list: MyShoppingList) => {
    const from = list.event?.guestCount;
    const to = event?.guestCount;
    const ratio = from && to ? to / from : 1;
    const next = new Map<string, Line>();
    for (const item of list.items) {
      const known = byName.get(nameKey(item.name));
      next.set(nameKey(item.name), {
        name: known?.name ?? item.name,
        unit: item.unit,
        category: known?.productCategory ?? null,
        photo: known?.photo ?? null,
        parts: { GENERAL: roundFor(item.unit, Number(item.quantity) * ratio) },
      });
    }
    setCart(next);
    const source = list.event?.title ?? list.event?.clientName ?? t('shopping.general.title');
    setCopied(
      ratio !== 1
        ? t('kitchen.builder.copiedScaled', { source, from, to, ratio: ratio.toFixed(2) })
        : t('kitchen.builder.copied', { source }),
    );
    setCopying(false);
  };

  const mutation = useMutation({
    mutationFn: () =>
      shoppingApi.create(target === GENERAL ? null : target, {
        items: lines.map((line) => ({
          name: line.name,
          unit: line.unit,
          quantity: quantityValue(totalOf(line)),
        })),
        note: note.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
      toast.success(t('shopping.toast.created'));
      setCart(new Map());
      setNote('');
      setCopied(null);
      setReviewing(false);
      onSent();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const copySources = previous.filter((list) => list.items.length > 0).slice(0, 8);
  const unitLabel = (line: Line) =>
    line.unit === 'KG'
      ? t(modeOf(line.name, line.category) === 'g' ? 'kitchen.builder.gram' : 'kitchen.builder.kg')
      : t(`warehouse.unit.${line.unit}`);

  return (
    <div className="grid grid-cols-1 gap-5 pb-40 sm:pb-24">
      {/* 1. Qaysi to'y uchun */}
      <section>
        <p className="mb-2 text-sm font-semibold">{t('kitchen.builder.forWhich')}</p>
        <div className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1">
          {events.map((item) => {
            const date = inAppZone(item.startAt);
            const selected = item.id === target;
            const days = daysUntil(item.day);
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setTarget(item.id)}
                className={cn(
                  'flex w-60 shrink-0 cursor-pointer snap-start items-center gap-3 rounded-2xl border p-3 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  selected
                    ? 'border-primary bg-primary/10 ring-1 ring-primary'
                    : 'bg-card hover:border-gold/60',
                )}
              >
                <span
                  className={cn(
                    'flex w-12 shrink-0 flex-col items-center rounded-xl py-1.5',
                    selected ? 'bg-primary text-primary-foreground' : 'bg-muted',
                  )}
                >
                  <span className="text-[10px] font-bold uppercase opacity-80">
                    {date.format('dd')}
                  </span>
                  <span className="tabular font-display text-xl leading-none font-semibold">
                    {date.format('D')}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {item.title ?? item.clientName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {days <= 0
                      ? t('kitchen.when.today')
                      : days === 1
                        ? t('kitchen.when.tomorrow')
                        : t('kitchen.when.inDays', { count: days })}{' '}
                    · {item.guestCount} {t('kitchen.guests')}
                  </span>
                  {item.lists.length > 0 && (
                    <span className="block text-[11px] font-semibold text-success">
                      {t('kitchen.builder.hasList')}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={target === GENERAL}
            onClick={() => setTarget(GENERAL)}
            className={cn(
              'flex w-48 shrink-0 cursor-pointer snap-start flex-col justify-center rounded-2xl border p-3 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              target === GENERAL
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'bg-card hover:border-gold/60',
            )}
          >
            <span className="text-sm font-semibold">{t('shopping.general.title')}</span>
            <span className="text-xs text-muted-foreground">
              {t('kitchen.builder.generalHint')}
            </span>
          </button>
        </div>
      </section>

      {/* 2. Mahsulotlar */}
      <section className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">{t('kitchen.builder.pickProducts')}</p>
          {copySources.length > 0 && (
            <button
              type="button"
              onClick={() => setCopying(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-gold/60 hover:text-foreground"
            >
              <Copy className="size-3.5" />
              {t('kitchen.builder.copy')}
            </button>
          )}
        </div>
        {copied && (
          <p className="flex items-start justify-between gap-2 rounded-xl bg-gold/10 px-3 py-2 text-xs text-gold-dark dark:text-gold-light">
            <span>
              {copied}. {t('kitchen.builder.copiedHint')}
            </span>
            <button
              type="button"
              className="cursor-pointer"
              aria-label={t('common.close')}
              onClick={() => setCopied(null)}
            >
              <X className="size-3.5" />
            </button>
          </p>
        )}

        {target !== GENERAL && (
          <div className="rounded-2xl border bg-card/80 p-3 shadow-soft">
            <div className="grid grid-cols-4 gap-1.5">
              {STAGES.map((item, index) => {
                const count = lines.filter((line) => (line.parts[item] ?? 0) > 0).length;
                const active = item === stage;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={active}
                    onClick={() => goToStage(item)}
                    className={cn(
                      'flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center transition duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                      active
                        ? 'border-primary bg-primary text-primary-foreground shadow-md'
                        : 'hover:-translate-y-0.5 hover:border-gold/60',
                    )}
                  >
                    <span
                      className={cn(
                        'tabular flex size-6 items-center justify-center rounded-full text-xs font-bold',
                        active
                          ? 'bg-primary-foreground/20'
                          : count > 0
                            ? 'bg-success/15 text-success'
                            : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {!active && count > 0 ? <Check className="size-3.5" /> : index + 1}
                    </span>
                    <span className="w-full truncate text-[11px] font-semibold sm:text-xs">
                      {t(`kitchen.stages.${item}`)}
                    </span>
                    <span
                      className={cn(
                        'tabular text-[10px]',
                        active ? 'text-primary-foreground/80' : 'text-muted-foreground',
                      )}
                    >
                      {t('kitchen.builder.items', { count })}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              key={stage}
              className="mt-3 flex animate-in flex-wrap items-center justify-between gap-3 fade-in"
            >
              <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                <p className="text-sm font-semibold">
                  {t('kitchen.builder.now', { stage: t(`kitchen.stagePurpose.${stage}`) })}
                </p>
                {dishes.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {dishes.map((dish) => (
                      <span
                        key={dish}
                        className="rounded-full bg-gold/12 px-2.5 py-1 text-xs font-medium text-gold-dark dark:text-gold-light"
                      >
                        {dish}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('kitchen.builder.noDishes')}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                className="w-full shrink-0 sm:w-auto"
                disabled={!nextStage && lines.length === 0}
                onClick={() => (nextStage ? goToStage(nextStage) : setReviewing(true))}
              >
                {nextStage
                  ? t('kitchen.builder.next', { stage: t(`kitchen.stages.${nextStage}`) })
                  : t('kitchen.builder.openCart')}
                <ArrowRight />
              </Button>
            </div>
          </div>
        )}

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
          {(['ALL', ...sections] as const).map((item) => {
            const picked =
              item === 'ALL'
                ? lines.length
                : lines.filter((line) => (line.category ?? 'OTHER') === item).length;
            return (
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
                {picked > 0 && (
                  <span
                    className={cn(
                      'tabular rounded-full px-1.5 text-[10px]',
                      section === item ? 'bg-primary-foreground/20' : 'bg-primary/15 text-primary',
                    )}
                  >
                    {picked}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {browsing && sections.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 lg:grid-cols-4">
            {sections.map((category, index) => (
              <CategoryCover
                key={category}
                category={category}
                index={index}
                count={
                  catalog.filter((item) => (item.productCategory ?? 'OTHER') === category).length
                }
                picked={lines.filter((line) => (line.category ?? 'OTHER') === category).length}
                icon={<ProductCategoryIcon category={category} className="size-4" />}
                onOpen={() => setSection(category)}
              />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card/60 p-4 text-center text-sm text-muted-foreground">
            {needle ? t('kitchen.builder.notFound', { query }) : t('kitchen.builder.emptyCatalog')}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {section !== 'ALL' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSection('ALL')}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-semibold transition hover:border-gold/60"
                >
                  <ArrowLeft className="size-4" />
                  {t('kitchen.builder.categories')}
                </button>
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                  <ProductCategoryIcon
                    category={section}
                    className="size-4 shrink-0 text-gold-dark dark:text-gold-light"
                  />
                  <span className="truncate">{t(`warehouse.productCategory.${section}`)}</span>
                </span>
              </div>
            )}
            <div
              key={section}
              className="grid grid-cols-2 gap-2.5 min-[480px]:grid-cols-3 lg:grid-cols-4"
            >
              {products.map((item, index) => {
                const value = partOf(item.name);
                const line = cart.get(nameKey(item.name));
                const total = line ? totalOf(line) : 0;
                const mode = modeOf(item.name, item.productCategory);
                return (
                  <ProductTile
                    key={item.name}
                    index={index}
                    name={item.name}
                    unit={item.unit}
                    category={item.productCategory}
                    photo={item.photo}
                    selected={value > 0}
                    corner={
                      total > value
                        ? t('kitchen.builder.totalCorner', {
                            amount: `${formatQuantity(quantityValue(total))} ${t(`warehouse.unit.${item.unit}`)}`,
                          })
                        : undefined
                    }
                    onPick={() =>
                      value === 0 &&
                      setPart(
                        asLine(item),
                        fromInput(item.unit === 'KG' && mode === 'g' ? '50' : '1', item.unit, mode),
                      )
                    }
                  >
                    <QuantityStepper
                      name={item.name}
                      unit={item.unit}
                      value={value}
                      mode={mode}
                      onChange={(next) => setPart(asLine(item), next)}
                      onModeChange={(next) => switchMode(item, next)}
                    />
                  </ProductTile>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-dashed bg-card/60 p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            {t('kitchen.builder.customTitle')}
          </p>
          <form
            className="grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-[minmax(0,1fr)_5rem_6.5rem_2.5rem]"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              addCustom();
            }}
          >
            <Input
              value={custom.name}
              maxLength={80}
              aria-label={t('kitchen.builder.customName')}
              placeholder={t('kitchen.builder.customName')}
              onChange={(inputEvent) => setCustom({ ...custom, name: inputEvent.target.value })}
              className="col-span-2 h-10 min-w-0 min-[480px]:col-span-1"
            />
            <Input
              value={custom.quantity}
              inputMode="decimal"
              placeholder="0"
              aria-label={t('kitchen.builder.customQuantity')}
              onChange={(inputEvent) => setCustom({ ...custom, quantity: inputEvent.target.value })}
              className="tabular h-10 text-center"
            />
            <Select
              value={custom.unit}
              onValueChange={(value) =>
                setCustom({ ...custom, unit: value as WarehouseUnit | 'G' })
              }
            >
              <SelectTrigger className="h-10" aria-label={t('kitchen.builder.customUnit')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WAREHOUSE_UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {t(`warehouse.unit.${unit}`)}
                  </SelectItem>
                ))}
                <SelectItem value="G">{t('kitchen.builder.gram')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="submit"
              variant="secondary"
              size="icon"
              className="size-10"
              aria-label={t('kitchen.builder.customAdd')}
            >
              <Plus />
            </Button>
          </form>
          {lines.some((line) => !byName.has(nameKey(line.name))) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {lines
                .filter((line) => !byName.has(nameKey(line.name)))
                .map((line) => (
                  <span
                    key={line.name}
                    className="tabular inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary dark:text-gold-light"
                  >
                    {line.name} ·{' '}
                    {toInput(totalOf(line), line.unit, modeOf(line.name, line.category))}{' '}
                    {unitLabel(line)}
                    <button
                      type="button"
                      className="cursor-pointer"
                      aria-label={t('kitchen.builder.remove', { name: line.name })}
                      onClick={() => removeLine(line.name)}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
            </div>
          )}
        </div>
      </section>

      {/* Suzuvchi savat paneli — ro'yxat qancha uzun bo'lmasin, doim bir joyda. */}
      <div className="fixed inset-x-0 bottom-[84px] z-20 px-4 lg:bottom-5">
        <div
          className={cn(
            'mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-2xl border p-3 shadow-xl backdrop-blur-xl transition',
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
              <ShoppingBasket className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {lines.length > 0
                  ? t('kitchen.builder.cartCount', { count: lines.length })
                  : t('kitchen.builder.cartEmpty')}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {event
                  ? `${event.title ?? event.clientName} · ${event.guestCount} ${t('kitchen.guests')}`
                  : t('shopping.general.title')}
              </p>
            </div>
          </div>
          <Button disabled={lines.length === 0} onClick={() => setReviewing(true)}>
            {t('kitchen.builder.cart')}
            <ArrowRight />
          </Button>
        </div>
      </div>

      <Dialog open={reviewing} onOpenChange={(open) => !mutation.isPending && setReviewing(open)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{t('kitchen.builder.reviewTitle')}</DialogTitle>
            <DialogDescription>
              {event
                ? `${event.title ?? event.clientName} — ${inAppZone(event.startAt).format('D MMMM')} · ${t('kitchen.builder.cartCount', { count: lines.length })}`
                : `${t('shopping.general.title')} · ${t('kitchen.builder.cartCount', { count: lines.length })}`}
            </DialogDescription>
          </DialogHeader>
          {event && (
            <div className="grid grid-cols-1 gap-2 text-sm">
              <p className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
                <Users className="size-4 text-muted-foreground" />
                {event.guestCount} {t('kitchen.guests')}
                {event.menu && ` · ${event.menu.name}`}
              </p>
              <p className="rounded-xl bg-gold/10 px-3 py-2">
                <span className="text-gold-dark dark:text-gold-light">
                  {t('shopping.firstDish')}:
                </span>{' '}
                <b>{event.firstDish ?? '—'}</b>
                <span className="mx-2 text-muted-foreground">·</span>
                <span className="text-gold-dark dark:text-gold-light">
                  {t('shopping.secondDish')}:
                </span>{' '}
                <b>{event.secondDish ?? '—'}</b>
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t('kitchen.builder.reviewHint')}</p>
          <ul className="grid max-h-[45dvh] divide-y overflow-y-auto">
            {lines.map((line) => {
              const mode = modeOf(line.name, line.category);
              return (
                <li key={line.name} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {line.name}
                    </span>
                    <span className="tabular shrink-0 text-sm font-bold">
                      {toInput(totalOf(line), line.unit, mode)} {unitLabel(line)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={t('kitchen.builder.remove', { name: line.name })}
                      onClick={() => removeLine(line.name)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {PART_ORDER.filter((part) => (line.parts[part] ?? 0) > 0).map((part) => (
                      <label
                        key={part}
                        className="flex items-center gap-1.5 rounded-lg bg-muted/60 py-1 pr-1 pl-2 text-xs text-muted-foreground"
                      >
                        {t(`kitchen.parts.${part}`)}
                        <input
                          key={line.parts[part]}
                          defaultValue={toInput(line.parts[part] ?? 0, line.unit, mode)}
                          inputMode="decimal"
                          aria-label={t('kitchen.builder.partAmount', {
                            name: line.name,
                            part: t(`kitchen.parts.${part}`),
                          })}
                          onBlur={(inputEvent) =>
                            setPart(line, fromInput(inputEvent.target.value, line.unit, mode), part)
                          }
                          className="tabular h-7 w-14 rounded-md border border-input bg-background text-center text-xs font-bold text-foreground"
                        />
                        <span>{unitLabel(line)}</span>
                      </label>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <Input
            value={note}
            maxLength={500}
            aria-label={t('shopping.editor.note')}
            placeholder={t('shopping.editor.notePlaceholder')}
            onChange={(inputEvent) => setNote(inputEvent.target.value)}
          />
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex">
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => {
                setReviewing(false);
                setSection('ALL');
                setQuery('');
              }}
            >
              <ShoppingBasket />
              {t('kitchen.builder.keepShopping')}
            </Button>
            <Button
              loading={mutation.isPending}
              disabled={lines.length === 0}
              onClick={() => mutation.mutate()}
            >
              <Send />
              {t('kitchen.builder.send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={copying} onOpenChange={setCopying}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t('kitchen.builder.copyTitle')}</DialogTitle>
            <DialogDescription>
              {event
                ? t('kitchen.builder.copyScaled', { count: event.guestCount })
                : t('kitchen.builder.copyPlain')}
            </DialogDescription>
          </DialogHeader>
          <ul className="grid grid-cols-1 gap-2">
            {copySources.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => copyFrom(list)}
                  className="w-full cursor-pointer rounded-xl border p-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <p className="truncate text-sm font-semibold">
                    {list.event
                      ? `№ ${list.event.number} · ${list.event.title ?? list.event.clientName}`
                      : t('shopping.general.title')}
                  </p>
                  <p className="tabular text-xs text-muted-foreground">
                    {t('shopping.itemsCount', { count: list.items.length })}
                    {list.event && ` · ${list.event.guestCount} ${t('kitchen.guests')}`}
                    {event &&
                      list.event &&
                      ` → ×${(event.guestCount / list.event.guestCount).toFixed(2)}`}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
