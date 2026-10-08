import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
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
import { errorMessage } from '@/lib/error-message';
import { menuApi, menuKeys } from '../api/menu.api';
import type { MenuCategory } from '../types/menu.types';

type DialogState =
  { type: 'form'; category?: MenuCategory } | { type: 'delete'; category: MenuCategory } | null;

interface Props {
  categories: MenuCategory[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

/** Menyu bo'limlari: nomi (ikki tilda), tartibi, qo'shish va o'chirish. */
export function CategoryManager({ categories, canCreate, canUpdate, canDelete }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [nameUz, setNameUz] = useState('');
  const [nameRu, setNameRu] = useState('');

  const editing = dialog?.type === 'form' ? dialog.category : undefined;
  useEffect(() => {
    if (dialog?.type !== 'form') return;
    setNameUz(dialog.category?.nameUz ?? '');
    setNameRu(dialog.category?.nameRu ?? '');
  }, [dialog]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: menuKeys.all });
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { nameUz: nameUz.trim(), nameRu: nameRu.trim() };
      return editing ? menuApi.updateCategory(editing.id, body) : menuApi.createCategory(body);
    },
    onSuccess: async () => {
      await refresh();
      toast.success(t('menu.toast.categorySaved'));
      setDialog(null);
    },
    onError,
  });
  const reorderMutation = useMutation({
    mutationFn: menuApi.reorderCategories,
    onSuccess: refresh,
    onError,
  });
  const deleteMutation = useMutation({
    mutationFn: (category: MenuCategory) => menuApi.removeCategory(category.id),
    onSuccess: async () => {
      await refresh();
      toast.success(t('menu.toast.categoryDeleted'));
      setDialog(null);
    },
    onError,
  });

  const move = (index: number, direction: -1 | 1) => {
    const ids = categories.map((category) => category.id);
    const target = index + direction;
    const [moved] = ids.splice(index, 1);
    if (!moved || target < 0 || target > ids.length) return;
    ids.splice(target, 0, moved);
    reorderMutation.mutate(ids);
  };

  const valid = nameUz.trim().length >= 2 && nameRu.trim().length >= 2;
  const deleting = dialog?.type === 'delete' ? dialog.category : null;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          {t('menu.categories.description')}
        </p>
        {canCreate && (
          <Button
            variant="outline"
            onClick={() => setDialog({ type: 'form' })}
            className="shrink-0"
          >
            <Plus />
            {t('menu.categories.new')}
          </Button>
        )}
      </div>

      <ol className="grid gap-2">
        {categories.map((category, index) => (
          <li
            key={category.id}
            className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-soft"
          >
            <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-bold text-gold-dark dark:text-gold-light">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{category.nameUz}</p>
              <p className="truncate text-xs text-muted-foreground">{category.nameRu}</p>
            </div>
            {canUpdate && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('menu.categories.moveUp', { name: category.nameUz })}
                  disabled={index === 0 || reorderMutation.isPending}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('menu.categories.moveDown', { name: category.nameUz })}
                  disabled={index === categories.length - 1 || reorderMutation.isPending}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${t('common.edit')}: ${category.nameUz}`}
                  onClick={() => setDialog({ type: 'form', category })}
                >
                  <Pencil />
                </Button>
              </>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t('common.delete')}: ${category.nameUz}`}
                onClick={() => setDialog({ type: 'delete', category })}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ol>

      <Dialog
        open={dialog?.type === 'form'}
        onOpenChange={(open) => !open && !saveMutation.isPending && setDialog(null)}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {t(editing ? 'menu.categories.editTitle' : 'menu.categories.createTitle')}
            </DialogTitle>
            <DialogDescription>{t('menu.categories.formDescription')}</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) saveMutation.mutate();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="category-uz">{t('menu.categories.nameUz')}</Label>
              <Input
                id="category-uz"
                value={nameUz}
                maxLength={60}
                placeholder="Salatlar"
                onChange={(event) => setNameUz(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category-ru">{t('menu.categories.nameRu')}</Label>
              <Input
                id="category-ru"
                value={nameRu}
                maxLength={60}
                placeholder="Салаты"
                onChange={(event) => setNameRu(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialog(null)}
                disabled={saveMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={saveMutation.isPending} disabled={!valid}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('menu.categories.deleteTitle')}
        description={t('menu.categories.deleteText', { name: deleting?.nameUz ?? '' })}
        confirmLabel={t('common.delete')}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
      />
    </>
  );
}
