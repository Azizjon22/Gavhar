import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { toApiError } from '@/lib/api-error';
import { errorMessage } from '@/lib/error-message';
import { amountToInput } from '@/lib/money';
import { useLocaleStore } from '@/stores/locale.store';
import { type Dish, dishKeys, dishesApi } from '../api/dishes.api';
import { menuApi, menuKeys } from '../api/menu.api';
import { type MenuCategory, type MenuPackage, localizedName } from '../types/menu.types';

interface SectionDraft {
  kindsCount: number;
  /** Vergul bilan ajratilgan taom nomlari. */
  items: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: MenuCategory[];
  /** Berilsa — tahrirlash. */
  pkg?: MenuPackage;
}

const splitItems = (value: string): string[] =>
  value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

/** Paket: nom, 1 kishilik narx va tarkib (qaysi bo'limdan necha xil). */
export function PackageFormDialog({ open, onOpenChange, categories, pkg }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const language = useLocaleStore((state) => state.language);
  const isEdit = pkg !== undefined;

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [badge, setBadge] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [sections, setSections] = useState<Record<string, SectionDraft>>({});
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoName = useRef<string | null>(null);

  const dishesQuery = useQuery({
    queryKey: dishKeys.list,
    queryFn: dishesApi.list,
    enabled: open,
  });
  const photoOf = (nameUz: string, nameRu: string): Dish['photo'] => {
    const key = (value: string) => value.trim().toLowerCase();
    return (
      dishesQuery.data?.find(
        (dish) => key(dish.name) === key(nameUz) || key(dish.name) === key(nameRu),
      )?.photo ?? null
    );
  };
  const photoMutation = useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) => dishesApi.uploadPhoto(name, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dishKeys.list });
      toast.success(t('menu.dishes.photoSaved'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  useEffect(() => {
    if (!open) return;
    setName(pkg?.name ?? '');
    setPrice(pkg ? amountToInput(pkg.pricePerGuest) : '');
    setBadge(pkg?.badge ?? '');
    setDescription(pkg?.description ?? '');
    setIsActive(pkg?.isActive ?? true);
    setSections(
      Object.fromEntries(
        (pkg?.sections ?? []).map((section) => [
          section.categoryId,
          { kindsCount: section.kindsCount, items: section.items.join(', ') },
        ]),
      ),
    );
    setNameError(null);
    setSubmitted(false);
  }, [open, pkg]);

  const nameValid = name.trim().length >= 2;
  const priceValid = /^(0|[1-9]\d{0,12})$/.test(price);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        pricePerGuest: price,
        badge: badge.trim() || null,
        isActive,
        // Bo'limlar ro'yxat tartibida yuboriladi.
        sections: categories
          .filter((category) => sections[category.id])
          .map((category) => ({
            categoryId: category.id,
            kindsCount: sections[category.id]?.kindsCount ?? 1,
            items: splitItems(sections[category.id]?.items ?? ''),
          })),
      };
      return pkg ? menuApi.updatePackage(pkg.id, payload) : menuApi.createPackage(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: menuKeys.all });
      toast.success(t(isEdit ? 'menu.toast.packageUpdated' : 'menu.toast.packageCreated'));
      onOpenChange(false);
    },
    onError: (error) => {
      if (toApiError(error).code === 'MENU_PACKAGE_NAME_TAKEN') {
        setNameError(errorMessage(error));
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  const toggle = (categoryId: string, included: boolean) =>
    setSections((current) => {
      const { [categoryId]: existing, ...rest } = current;
      return included ? { ...rest, [categoryId]: existing ?? { kindsCount: 1, items: '' } } : rest;
    });
  const patch = (categoryId: string, change: Partial<SectionDraft>) =>
    setSections((current) => ({
      ...current,
      [categoryId]: { kindsCount: 1, items: '', ...current[categoryId], ...change },
    }));

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent size="lg" className="flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {t(isEdit ? 'menu.packageForm.editTitle' : 'menu.packageForm.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('menu.packageForm.description')}</DialogDescription>
        </DialogHeader>

        <input
          ref={photoInput}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={(event) => {
            const file = event.target.files?.[0];
            const name = photoName.current;
            event.target.value = '';
            if (file && name) photoMutation.mutate({ name, file });
          }}
        />
        <form
          className="flex min-h-0 flex-1 flex-col gap-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            setNameError(null);
            if (nameValid && priceValid) mutation.mutate();
          }}
        >
          <div className="grid shrink-0 gap-5 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="package-name">{t('menu.packageForm.name')}</Label>
              <Input
                id="package-name"
                value={name}
                maxLength={60}
                placeholder="VIP"
                aria-invalid={(submitted && !nameValid) || nameError !== null}
                onChange={(event) => setName(event.target.value)}
              />
              {(nameError ?? (submitted && !nameValid)) && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {nameError ?? t('validation.packageName')}
                </p>
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="package-price">{t('menu.packageForm.price')}</Label>
              <MoneyInput
                id="package-price"
                value={price}
                onChange={setPrice}
                aria-invalid={submitted && !priceValid}
              />
              {submitted && !priceValid && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {t('validation.amount')}
                </p>
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="package-badge">
                {t('menu.packageForm.badge')}{' '}
                <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
              </Label>
              <Input
                id="package-badge"
                value={badge}
                maxLength={24}
                placeholder={t('menu.packageForm.badgePlaceholder')}
                onChange={(event) => setBadge(event.target.value)}
              />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="package-description">
                {t('menu.packageForm.descriptionLabel')}{' '}
                <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
              </Label>
              <Input
                id="package-description"
                value={description}
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <p className="shrink-0 text-sm font-medium">{t('menu.packageForm.sections')}</p>
            <ul className="grid max-h-[calc(100dvh-32rem)] min-h-0 flex-1 gap-1 overflow-y-auto rounded-xl border p-1.5">
              {categories.map((category) => {
                const draft = sections[category.id];
                const label = localizedName(category, language);
                return (
                  <li key={category.id} className="rounded-lg px-2.5 py-2 hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm font-medium">
                        <Checkbox
                          checked={draft !== undefined}
                          onCheckedChange={(checked) => toggle(category.id, checked === true)}
                        />
                        <span className="truncate">{label}</span>
                      </label>
                      {draft && !draft.items.trim() && (
                        <button
                          type="button"
                          aria-label={t('menu.dishes.uploadPhoto')}
                          onClick={() => {
                            photoName.current = category.nameUz;
                            photoInput.current?.click();
                          }}
                          className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
                        >
                          {photoOf(category.nameUz, category.nameRu) ? (
                            <img
                              src={photoOf(category.nameUz, category.nameRu)?.thumbUrl}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <ImagePlus className="size-4" />
                          )}
                        </button>
                      )}
                      {draft && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Input
                            inputMode="numeric"
                            aria-label={t('menu.packageForm.kindsLabel', { name: label })}
                            value={String(draft.kindsCount)}
                            onChange={(event) => {
                              const next = Number(
                                event.target.value.replace(/\D/g, '').slice(0, 2),
                              );
                              patch(category.id, { kindsCount: Math.max(1, next || 1) });
                            }}
                            className="tabular h-8 w-14 text-center"
                          />
                          {t('menu.packageForm.kindsUnit')}
                        </div>
                      )}
                    </div>
                    {draft && (
                      <Input
                        value={draft.items}
                        aria-label={t('menu.packageForm.itemsLabel', { name: label })}
                        placeholder={t('menu.packageForm.itemsPlaceholder')}
                        onChange={(event) => patch(category.id, { items: event.target.value })}
                        className="mt-2 ml-[30px] h-9 w-[calc(100%-30px)] text-sm"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <label className="flex shrink-0 cursor-pointer items-center gap-3 text-sm">
            <Checkbox
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
            />
            {t('menu.packageForm.active')}
          </label>

          <DialogFooter className="shrink-0">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t(isEdit ? 'common.save' : 'common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
