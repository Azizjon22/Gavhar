import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Apple,
  ClipboardList,
  Ellipsis,
  History,
  Image as ImageIcon,
  ImageOff,
  Minus,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  Utensils,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { type Column, DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/use-permissions';
import { errorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';
import { warehouseApi, warehouseKeys } from '../api/warehouse.api';
import { HistoryDialog } from '../components/HistoryDialog';
import { ItemFormDialog } from '../components/ItemFormDialog';
import { MovementDialog } from '../components/MovementDialog';
import { RecentMovementsDialog } from '../components/RecentMovementsDialog';
import { StocktakeDialog } from '../components/StocktakeDialog';
import { formatQuantity } from '../lib/quantity';
import {
  type MovementType,
  WAREHOUSE_SECTIONS,
  type WarehouseItem,
  type WarehouseSection,
} from '../types/warehouse.types';

const SECTION_ICON = { TABLEWARE: Utensils, FOOD: Apple } as const;

type DialogState =
  | { type: 'form'; item?: WarehouseItem }
  | { type: 'movement'; item: WarehouseItem; movement: MovementType }
  | { type: 'history'; item: WarehouseItem }
  | { type: 'count'; item: WarehouseItem }
  | { type: 'recent' }
  | { type: 'delete'; item: WarehouseItem }
  | null;

/** Ombor: idish-tovoq va oziq-ovqat bo'limlari, kirim-chiqim va qoldiq nazorati. */
export function WarehousePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canCreate = can('warehouse:create');
  const canUpdate = can('warehouse:update');
  const canDelete = can('warehouse:delete');

  const [section, setSection] = useState<WarehouseSection>('TABLEWARE');
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  const query = useQuery({ queryKey: warehouseKeys.items, queryFn: warehouseApi.items });
  const deleteMutation = useMutation({
    mutationFn: (item: WarehouseItem) => warehouseApi.remove(item.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
      toast.success(t('warehouse.toast.deleted'));
      setDialog(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Rasm yuklash: menyudan tanlangan mahsulot uchun yashirin fayl tanlagich ochiladi.
  const fileInput = useRef<HTMLInputElement>(null);
  const photoTarget = useRef<WarehouseItem | null>(null);
  const photoMutation = useMutation({
    mutationFn: ({ item, file }: { item: WarehouseItem; file?: File }) =>
      file ? warehouseApi.uploadPhoto(item.id, file) : warehouseApi.removePhoto(item.id),
    onSuccess: async (_, { file }) => {
      await queryClient.invalidateQueries({ queryKey: warehouseKeys.items });
      toast.success(t(file ? 'warehouse.toast.photoSaved' : 'warehouse.toast.photoRemoved'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const { mutate: changePhoto } = photoMutation;
  const pickPhoto = useCallback((item: WarehouseItem) => {
    photoTarget.current = item;
    fileInput.current?.click();
  }, []);
  const removePhoto = useCallback((item: WarehouseItem) => changePhoto({ item }), [changePhoto]);

  const all = query.data;
  const inSection = useMemo(
    () => (all ?? []).filter((item) => item.section === section),
    [all, section],
  );
  const lowCount = inSection.filter((item) => item.isLow).length;
  const needle = search.trim().toLowerCase();
  const rows = all
    ? inSection.filter(
        (item) =>
          (!lowOnly || item.isLow) && (needle === '' || item.name.toLowerCase().includes(needle)),
      )
    : undefined;
  const filtered = needle !== '' || lowOnly;

  const columns = useMemo<Column<WarehouseItem>[]>(() => {
    const base: Column<WarehouseItem>[] = [
      {
        id: 'name',
        header: t('warehouse.columns.name'),
        cell: (item) => (
          <div className="flex items-center gap-3 sm:min-w-36">
            {item.photo ? (
              <img
                src={item.photo.thumbUrl}
                alt=""
                loading="lazy"
                className="size-10 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:flex">
                <ImageIcon className="size-4" />
              </span>
            )}
            <div className="min-w-0">
              <p className="font-semibold">{item.name}</p>
              {(item.productCategory || item.note) && (
                <p className="text-xs text-muted-foreground">
                  {[
                    item.productCategory && t(`warehouse.productCategory.${item.productCategory}`),
                    item.note,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>
          </div>
        ),
      },
      {
        id: 'quantity',
        header: t('warehouse.columns.quantity'),
        className: 'text-right',
        cell: (item) => (
          <div className="tabular whitespace-nowrap">
            <p className={cn('text-base font-bold', item.isLow && 'text-destructive')}>
              {formatQuantity(item.quantity)}{' '}
              <span className="text-xs font-medium text-muted-foreground">
                {t(`warehouse.unit.${item.unit}`)}
              </span>
            </p>
            {item.isLow && (
              <p className="text-xs font-medium text-destructive md:hidden">{t('warehouse.low')}</p>
            )}
          </div>
        ),
      },
      {
        id: 'status',
        header: t('warehouse.columns.status'),
        className: 'hidden md:table-cell',
        cell: (item) =>
          item.isLow ? (
            <Badge variant="destructive" className="gap-1">
              <TriangleAlert className="size-3" />
              {t('warehouse.low')}
            </Badge>
          ) : Number(item.minQuantity) > 0 ? (
            <span className="tabular text-xs text-muted-foreground">
              {t('warehouse.minimum', {
                quantity: `${formatQuantity(item.minQuantity)} ${t(`warehouse.unit.${item.unit}`)}`,
              })}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ];

    return [
      ...base,
      {
        id: 'actions',
        header: <span className="sr-only">{t('common.actions')}</span>,
        className: 'text-right max-sm:pl-0',
        cell: (item) => (
          <div className="flex items-center justify-end gap-1 sm:gap-1.5">
            {canUpdate && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={t('warehouse.stockInFor', { name: item.name })}
                  className="text-success hover:text-success max-sm:w-8 max-sm:px-0"
                  onClick={() => setDialog({ type: 'movement', item, movement: 'IN' })}
                >
                  <Plus />
                  <span className="hidden sm:inline">{t('warehouse.stockIn')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={t('warehouse.stockOutFor', { name: item.name })}
                  disabled={Number(item.quantity) === 0}
                  className="max-sm:w-8 max-sm:px-0"
                  onClick={() => setDialog({ type: 'movement', item, movement: 'OUT' })}
                >
                  <Minus />
                  <span className="hidden sm:inline">{t('warehouse.stockOut')}</span>
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('warehouse.actionsLabel', { name: item.name })}
                >
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDialog({ type: 'history', item })}>
                  <History />
                  {t('warehouse.history.title')}
                </DropdownMenuItem>
                {canUpdate && (
                  <>
                    <DropdownMenuItem onSelect={() => setDialog({ type: 'count', item })}>
                      <ClipboardList />
                      {t('warehouse.stocktake.title')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => pickPhoto(item)}>
                      <ImageIcon />
                      {t(item.photo ? 'warehouse.photo.replace' : 'warehouse.photo.upload')}
                    </DropdownMenuItem>
                    {item.photo && (
                      <DropdownMenuItem onSelect={() => removePhoto(item)}>
                        <ImageOff />
                        {t('warehouse.photo.remove')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setDialog({ type: 'form', item })}>
                      <Pencil />
                      {t('common.edit')}
                    </DropdownMenuItem>
                  </>
                )}
                {canDelete && (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDialog({ type: 'delete', item })}
                  >
                    <Trash2 />
                    {t('common.delete')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ];
  }, [t, canUpdate, canDelete, pickPhoto, removePhoto]);

  const deleting = dialog?.type === 'delete' ? dialog.item : null;
  const createButton = canCreate && (
    <Button onClick={() => setDialog({ type: 'form' })}>
      <Plus />
      {t('warehouse.new')}
    </Button>
  );

  return (
    <>
      <PageHeader
        title={t('warehouse.title')}
        description={t('warehouse.description')}
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog({ type: 'recent' })}>
              <History />
              {t('warehouse.recent.title')}
            </Button>
            {createButton}
          </>
        }
      />
      <input
        ref={fileInput}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const item = photoTarget.current;
          event.target.value = '';
          if (file && item) changePhoto({ item, file });
        }}
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={section}
          onValueChange={(value) => {
            setSection(value as WarehouseSection);
            setLowOnly(false);
            setSearch('');
          }}
        >
          <TabsList>
            {WAREHOUSE_SECTIONS.map((key) => {
              const Icon = SECTION_ICON[key];
              const count = (all ?? []).filter((item) => item.section === key).length;
              return (
                <TabsTrigger key={key} value={key}>
                  <Icon />
                  {t(`warehouse.section.${key}`)}
                  {all && <span className="tabular ml-1 opacity-60">{count}</span>}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {lowCount > 0 && (
            <Button
              variant={lowOnly ? 'destructive' : 'outline'}
              aria-pressed={lowOnly}
              className={cn(!lowOnly && 'text-destructive hover:text-destructive')}
              onClick={() => setLowOnly((value) => !value)}
            >
              <TriangleAlert />
              {t('warehouse.lowCount', { count: lowCount })}
            </Button>
          )}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('warehouse.searchPlaceholder')}
            className="sm:w-64"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(item) => item.id}
            loading={query.isLoading}
            skeletonRows={5}
            empty={
              filtered ? (
                <EmptyState
                  title={t('common.noResults.title')}
                  description={t('common.noResults.text')}
                />
              ) : (
                <EmptyState
                  title={t('warehouse.empty.title')}
                  description={t(
                    section === 'FOOD' ? 'warehouse.empty.food' : 'warehouse.empty.tableware',
                  )}
                  action={createButton}
                />
              )
            }
          />
        )}
      </Card>

      <ItemFormDialog
        open={dialog?.type === 'form'}
        onOpenChange={(open) => !open && setDialog(null)}
        section={section}
        item={dialog?.type === 'form' ? dialog.item : undefined}
      />
      <MovementDialog
        // Holat obyektining o'zi uzatiladi — har chizishda yangi obyekt formani tozalab yubormasin.
        target={dialog?.type === 'movement' ? dialog : null}
        onClose={() => setDialog(null)}
      />
      <StocktakeDialog
        item={dialog?.type === 'count' ? dialog.item : null}
        onClose={() => setDialog(null)}
      />
      <RecentMovementsDialog
        open={dialog?.type === 'recent'}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <HistoryDialog
        item={dialog?.type === 'history' ? dialog.item : null}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('warehouse.confirm.deleteTitle')}
        description={t('warehouse.confirm.deleteText', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
      />
    </>
  );
}
