import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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
import { toApiError } from '@/lib/api-error';
import { errorMessage } from '@/lib/error-message';
import { warehouseApi, warehouseKeys } from '../api/warehouse.api';
import { parseQuantityInput, toQuantityValue } from '../lib/quantity';
import {
  PRODUCT_CATEGORIES,
  type ProductCategory,
  WAREHOUSE_UNITS,
  type WarehouseItem,
  type WarehouseSection,
  type WarehouseUnit,
  isWholeUnit,
} from '../types/warehouse.types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Yangi mahsulot shu bo'limga qo'shiladi. */
  section: WarehouseSection;
  /** Berilsa — tahrirlash. */
  item?: WarehouseItem;
}

/** Mahsulot: nom, o'lchov birligi, "kam qoldi" chegarasi va (yangisida) boshlang'ich qoldiq. */
export function ItemFormDialog({ open, onOpenChange, section, item }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [unit, setUnit] = useState<WarehouseUnit>('PIECE');
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [initial, setInitial] = useState('');
  const [minimum, setMinimum] = useState('');
  const [note, setNote] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setUnit(item?.unit ?? (section === 'FOOD' ? 'KG' : 'PIECE'));
    setCategory(item?.productCategory ?? '');
    setInitial('');
    setMinimum(item && Number(item.minQuantity) > 0 ? item.minQuantity : '');
    setNote(item?.note ?? '');
    setNameError(null);
    setSubmitted(false);
  }, [open, item, section]);

  const allowFraction = !isWholeUnit(unit);
  const nameValid = name.trim().length >= 2;
  // Qoldig'i bor mahsulotning birligi o'zgartirilmaydi.
  const unitValid = !item || unit === item.unit || Number(item.quantity) === 0;
  const isFood = (item?.section ?? section) === 'FOOD';
  const sectionKey = section === 'FOOD' ? 'food' : 'tableware';

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        unit,
        minQuantity: toQuantityValue(minimum) || '0',
        ...(isFood && { productCategory: category || null }),
        note: note.trim() || null,
      };
      if (item) return warehouseApi.update(item.id, body);
      const initialQuantity = toQuantityValue(initial);
      return warehouseApi.create({
        ...body,
        section,
        ...(Number(initialQuantity) > 0 && { initialQuantity }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
      toast.success(t(item ? 'warehouse.toast.updated' : 'warehouse.toast.created'));
      onOpenChange(false);
    },
    onError: (error) => {
      if (toApiError(error).code === 'WAREHOUSE_ITEM_NAME_TAKEN') {
        setNameError(errorMessage(error));
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  const changeUnit = (next: WarehouseUnit) => {
    setUnit(next);
    if (isWholeUnit(next)) {
      setInitial((value) => parseQuantityInput(value, false));
      setMinimum((value) => parseQuantityInput(value, false));
    }
  };
  const optional = (
    <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {t(
              item
                ? 'warehouse.itemForm.editTitle'
                : `warehouse.itemForm.createTitle.${sectionKey}`,
            )}
          </DialogTitle>
          <DialogDescription>{t('warehouse.itemForm.description')}</DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            setNameError(null);
            if (nameValid && unitValid) mutation.mutate();
          }}
        >
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_150px]">
            <div className="grid content-start gap-2">
              <Label htmlFor="item-name">{t('warehouse.itemForm.name')}</Label>
              <Input
                id="item-name"
                value={name}
                maxLength={80}
                placeholder={t(`warehouse.itemForm.namePlaceholder.${sectionKey}`)}
                aria-invalid={(submitted && !nameValid) || nameError !== null}
                onChange={(event) => setName(event.target.value)}
              />
              {(nameError ?? (submitted && !nameValid)) && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {nameError ?? t('validation.itemName')}
                </p>
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="item-unit">{t('warehouse.itemForm.unit')}</Label>
              <Select value={unit} onValueChange={(value) => changeUnit(value as WarehouseUnit)}>
                <SelectTrigger id="item-unit" aria-invalid={!unitValid}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WAREHOUSE_UNITS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`warehouse.unitName.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!unitValid && (
            <p role="alert" className="-mt-3 text-xs font-medium text-destructive">
              {t('errors.codes.UNIT_CHANGE_WITH_STOCK')}
            </p>
          )}

          {isFood && (
            <div className="grid content-start gap-2">
              <Label htmlFor="item-category">
                {t('warehouse.itemForm.category')} {optional}
              </Label>
              <Select
                value={category || 'none'}
                onValueChange={(value) =>
                  setCategory(value === 'none' ? '' : (value as ProductCategory))
                }
              >
                <SelectTrigger id="item-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('warehouse.itemForm.noCategory')}</SelectItem>
                  {PRODUCT_CATEGORIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`warehouse.productCategory.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            {!item && (
              <div className="grid content-start gap-2">
                <Label htmlFor="item-initial">
                  {t('warehouse.itemForm.initial')} {optional}
                </Label>
                <Input
                  id="item-initial"
                  inputMode={allowFraction ? 'decimal' : 'numeric'}
                  className="tabular"
                  placeholder="0"
                  value={initial.replace('.', ',')}
                  onChange={(event) =>
                    setInitial(parseQuantityInput(event.target.value, allowFraction))
                  }
                />
              </div>
            )}
            <div className="grid content-start gap-2">
              <Label htmlFor="item-minimum">
                {t('warehouse.itemForm.minimum')} {optional}
              </Label>
              <Input
                id="item-minimum"
                inputMode={allowFraction ? 'decimal' : 'numeric'}
                className="tabular"
                placeholder="0"
                value={minimum.replace('.', ',')}
                onChange={(event) =>
                  setMinimum(parseQuantityInput(event.target.value, allowFraction))
                }
              />
              <p className="text-xs text-muted-foreground">{t('warehouse.itemForm.minimumHint')}</p>
            </div>
          </div>

          <div className="grid content-start gap-2">
            <Label htmlFor="item-note">
              {t('warehouse.itemForm.note')} {optional}
            </Label>
            <Input
              id="item-note"
              value={note}
              maxLength={300}
              placeholder={t('warehouse.itemForm.notePlaceholder')}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t(item ? 'common.save' : 'common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
