import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, Plus, Send, Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { localizedName } from '@/features/menu/types/menu.types';
import {
  isPositiveQuantity,
  parseQuantityInput,
  toQuantityValue,
} from '@/features/warehouse/lib/quantity';
import {
  WAREHOUSE_UNITS,
  type WarehouseUnit,
  isWholeUnit,
} from '@/features/warehouse/types/warehouse.types';
import { errorMessage } from '@/lib/error-message';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useLocaleStore } from '@/stores/locale.store';
import { shoppingApi, shoppingKeys } from '../api/shopping.api';
import type { KitchenEvent, ShoppingList } from '../types/shopping.types';

/** `create` — oshpaz yangi ro'yxat yozadi; `edit` — o'zinikini tuzatadi; `review` — SUPER_ADMIN tekshiradi. */
export type EditorMode = 'create' | 'edit' | 'review';

export interface EditorTarget {
  mode: EditorMode;
  /** Berilmasa — to'yga bog'lanmagan umumiy bozorlik. */
  event?: KitchenEvent;
  list?: ShoppingList;
}

interface Row {
  key: string;
  id?: string;
  name: string;
  unit: WarehouseUnit;
  quantity: string;
  note: string;
  /** Izoh maydoni ochiqmi. */
  noteOpen: boolean;
}

const emptyRow = (): Row => ({
  key: crypto.randomUUID(),
  name: '',
  unit: 'KG',
  quantity: '',
  note: '',
  noteOpen: false,
});
const isBlank = (row: Row) => row.name.trim() === '' && row.quantity === '';
const isValid = (row: Row) => row.name.trim().length >= 2 && isPositiveQuantity(row.quantity);

interface Props {
  target: EditorTarget | null;
  onClose: () => void;
}

/** Bozorlik ro'yxatini yozish va tuzatish: mahsulot, miqdor, birlik. Menyu tarkibi yonida turadi. */
export function ListEditorDialog({ target, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const language = useLocaleStore((state) => state.language);
  const datalistId = useId();
  const [last, setLast] = useState(target);
  const shown = target ?? last;

  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!target) return;
    setLast(target);
    setRows([
      ...(target.list?.items ?? []).map((item) => ({
        key: item.id,
        id: item.id,
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        note: item.note ?? '',
        noteOpen: Boolean(item.note),
      })),
      emptyRow(),
    ]);
    setNote(target.list?.note ?? '');
    setSubmitted(false);
  }, [target]);

  const suggestionsQuery = useQuery({
    queryKey: shoppingKeys.suggestions,
    queryFn: shoppingApi.suggestions,
    enabled: target !== null,
    staleTime: 5 * 60_000,
  });
  const suggestions = suggestionsQuery.data ?? [];

  const filled = rows.filter((row) => !isBlank(row));
  const valid = filled.length > 0 && filled.every(isValid);

  const mutation = useMutation({
    mutationFn: async (input: { current: EditorTarget; thenApprove: boolean }) => {
      const body = {
        items: filled.map((row) => ({
          ...(row.id && { id: row.id }),
          name: row.name.trim(),
          unit: row.unit,
          quantity: toQuantityValue(row.quantity),
          note: row.note.trim() || null,
        })),
        note: note.trim() || null,
      };
      const { current } = input;
      const saved = current.list
        ? await shoppingApi.update(current.list.id, body)
        : await shoppingApi.create(current.event?.id ?? null, body);
      return input.thenApprove ? shoppingApi.approve(saved.id) : saved;
    },
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
      toast.success(
        t(
          input.thenApprove
            ? 'shopping.toast.approved'
            : input.current.mode === 'create'
              ? 'shopping.toast.created'
              : 'shopping.toast.saved',
        ),
      );
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!shown) return null;
  const { mode, event } = shown;

  const patch = (key: string, change: Partial<Row>) =>
    setRows((current) => {
      const next = current.map((row) => (row.key === key ? { ...row, ...change } : row));
      // Oxirgi qator to'ldirila boshlasa, yangisi o'zi qo'shiladi.
      const tail = next[next.length - 1];
      return tail && !isBlank(tail) ? [...next, emptyRow()] : next;
    });
  const changeName = (row: Row, name: string) => {
    const known = suggestions.find((item) => item.name.toLowerCase() === name.trim().toLowerCase());
    patch(row.key, known && row.quantity === '' ? { name, unit: known.unit } : { name });
  };
  const submit = (thenApprove: boolean) => {
    setSubmitted(true);
    if (valid && target) mutation.mutate({ current: target, thenApprove });
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => !open && !mutation.isPending && onClose()}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t(`shopping.editor.title.${mode}`)}</DialogTitle>
          <DialogDescription>
            {event
              ? `№ ${event.number} · ${event.title ?? t(`events.type.${event.type}`)} · ${formatDate(event.startAt)} · ${t('halls.guests', { count: event.guestCount })}`
              : t('shopping.general.subtitle')}
            {mode !== 'create' && shown.list && ` · ${shown.list.createdByName}`}
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-5"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            submit(false);
          }}
        >
          {event?.menu && event.menu.sections.length > 0 && (
            <div className="rounded-xl border border-gold/30 bg-gold/8 p-3.5 text-sm">
              <p className="font-semibold">
                {t('shopping.menu')}: {event.menu.name}
              </p>
              <ul className="mt-1.5 grid gap-x-6 gap-y-0.5 text-muted-foreground sm:grid-cols-2">
                {event.menu.sections.map((section) => (
                  <li key={section.nameUz}>
                    <span className="text-foreground">{localizedName(section, language)}</span>
                    {section.kindsCount > 1 &&
                      ` · ${t('menu.kinds', { count: section.kindsCount })}`}
                    {section.items.length > 0 && ` — ${section.items.join(', ')}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-2">
            <p className="text-sm font-medium">{t('shopping.editor.items')}</p>
            <ul className="grid max-h-[42dvh] gap-2 overflow-y-auto pr-1">
              {rows.map((row, index) => {
                const blank = isBlank(row);
                const showError = submitted && !blank && !isValid(row);
                const allowFraction = !isWholeUnit(row.unit);
                return (
                  <li
                    key={row.key}
                    className="grid grid-cols-[minmax(0,1fr)_76px_92px_32px_32px] gap-x-2 gap-y-1.5"
                  >
                    <Input
                      value={row.name}
                      maxLength={80}
                      list={datalistId}
                      aria-label={t('shopping.editor.name', { number: index + 1 })}
                      aria-invalid={showError && row.name.trim().length < 2}
                      placeholder={t('shopping.editor.namePlaceholder')}
                      onChange={(inputEvent) => changeName(row, inputEvent.target.value)}
                    />
                    <Input
                      inputMode={allowFraction ? 'decimal' : 'numeric'}
                      className="tabular text-right"
                      placeholder="0"
                      aria-label={t('shopping.editor.quantity', { number: index + 1 })}
                      aria-invalid={showError && !isPositiveQuantity(row.quantity)}
                      value={row.quantity.replace('.', ',')}
                      onChange={(inputEvent) =>
                        patch(row.key, {
                          quantity: parseQuantityInput(inputEvent.target.value, allowFraction),
                        })
                      }
                    />
                    <Select
                      value={row.unit}
                      onValueChange={(value) => {
                        const unit = value as WarehouseUnit;
                        patch(row.key, {
                          unit,
                          quantity: isWholeUnit(unit)
                            ? parseQuantityInput(row.quantity, false)
                            : row.quantity,
                        });
                      }}
                    >
                      <SelectTrigger aria-label={t('shopping.editor.unit', { number: index + 1 })}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WAREHOUSE_UNITS.map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {t(`warehouse.unit.${unit}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className={cn('mt-1', row.note ? 'text-primary' : 'text-muted-foreground')}
                      aria-label={t('shopping.editor.rowNote', { number: index + 1 })}
                      aria-expanded={row.noteOpen}
                      disabled={blank}
                      onClick={() => patch(row.key, { noteOpen: !row.noteOpen })}
                    >
                      <MessageSquareText />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="mt-1 text-muted-foreground hover:text-destructive"
                      aria-label={t('shopping.editor.removeRow', { number: index + 1 })}
                      disabled={blank && index === rows.length - 1}
                      onClick={() =>
                        setRows((current) => {
                          const next = current.filter((item) => item.key !== row.key);
                          return next.length > 0 ? next : [emptyRow()];
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                    {row.noteOpen && (
                      <Input
                        value={row.note}
                        maxLength={200}
                        className="col-span-full h-9 text-sm"
                        aria-label={t('shopping.editor.rowNote', { number: index + 1 })}
                        placeholder={t('shopping.editor.rowNotePlaceholder')}
                        onChange={(inputEvent) => patch(row.key, { note: inputEvent.target.value })}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            <datalist id={datalistId}>
              {suggestions.map((item) => (
                <option key={`${item.name}|${item.unit}`} value={item.name} />
              ))}
            </datalist>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRows((current) => [...current, emptyRow()])}
              >
                <Plus />
                {t('shopping.editor.addRow')}
              </Button>
              <p className="tabular text-xs text-muted-foreground">
                {t('shopping.itemsCount', { count: filled.length })}
              </p>
            </div>
            {submitted && !valid && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {t(filled.length === 0 ? 'shopping.editor.empty' : 'shopping.editor.invalid')}
              </p>
            )}
          </div>

          <div className="grid content-start gap-2">
            <Label htmlFor="shopping-note">
              {t('shopping.editor.note')}{' '}
              <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
            </Label>
            <Input
              id="shopping-note"
              value={note}
              maxLength={500}
              placeholder={t('shopping.editor.notePlaceholder')}
              onChange={(inputEvent) => setNote(inputEvent.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
              {t('common.cancel')}
            </Button>
            {mode === 'review' ? (
              <>
                <Button
                  type="submit"
                  variant="outline"
                  loading={mutation.isPending && !mutation.variables?.thenApprove}
                  disabled={mutation.isPending}
                >
                  {t('common.save')}
                </Button>
                <Button
                  loading={mutation.isPending && mutation.variables?.thenApprove === true}
                  disabled={mutation.isPending}
                  onClick={() => submit(true)}
                >
                  <Send />
                  {t('shopping.actions.approve')}
                </Button>
              </>
            ) : (
              <Button type="submit" loading={mutation.isPending}>
                {mode === 'create' && <Send />}
                {t(mode === 'create' ? 'shopping.editor.submit' : 'common.save')}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
