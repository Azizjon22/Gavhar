import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { errorMessage } from '@/lib/error-message';
import { financeApi, financeKeys } from '../api/finance.api';
import type { ExpenseCategory } from '../types/finance.types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ExpenseCategory[];
}

/** Xarajat turlari: qo'shish, qayta nomlash, o'chirish. Tizim turlari o'chirilmaydi. */
export function CategoryManagerDialog({ open, onOpenChange, categories }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setNewName('');
    setEditing(null);
  }, [open]);

  const options = {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financeKeys.all });
      setNewName('');
      setEditing(null);
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  };
  const createMutation = useMutation({ mutationFn: financeApi.createCategory, ...options });
  const renameMutation = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      financeApi.updateCategory(input.id, input.name),
    ...options,
  });
  const deleteMutation = useMutation({ mutationFn: financeApi.removeCategory, ...options });
  const busy = createMutation.isPending || renameMutation.isPending || deleteMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('finance.categories.title')}</DialogTitle>
          <DialogDescription>{t('finance.categories.description')}</DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (newName.trim().length >= 2) createMutation.mutate(newName.trim());
          }}
        >
          <Input
            value={newName}
            maxLength={60}
            aria-label={t('finance.categories.newPlaceholder')}
            placeholder={t('finance.categories.newPlaceholder')}
            onChange={(event) => setNewName(event.target.value)}
          />
          <Button
            type="submit"
            loading={createMutation.isPending}
            disabled={newName.trim().length < 2}
          >
            <Plus />
            {t('common.create')}
          </Button>
        </form>

        <ul className="grid max-h-[50dvh] gap-1 overflow-y-auto rounded-xl border p-1.5">
          {categories.map((category) =>
            editing?.id === category.id ? (
              <li key={category.id}>
                <form
                  className="flex items-center gap-1.5 p-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (editing.name.trim().length >= 2) {
                      renameMutation.mutate({ id: editing.id, name: editing.name.trim() });
                    }
                  }}
                >
                  <Input
                    autoFocus
                    value={editing.name}
                    maxLength={60}
                    aria-label={t('finance.categories.rename', { name: category.name })}
                    className="h-9"
                    onChange={(event) => setEditing({ id: editing.id, name: event.target.value })}
                  />
                  <Button
                    type="submit"
                    size="icon-sm"
                    aria-label={t('common.save')}
                    loading={renameMutation.isPending}
                    disabled={editing.name.trim().length < 2}
                  >
                    <Check />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('common.cancel')}
                    onClick={() => setEditing(null)}
                  >
                    <X />
                  </Button>
                </form>
              </li>
            ) : (
              <li
                key={category.id}
                className="flex items-center gap-1.5 rounded-lg py-1 pr-1 pl-3 hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('finance.categories.rename', { name: category.name })}
                  onClick={() => setEditing({ id: category.id, name: category.name })}
                >
                  <Pencil />
                </Button>
                {category.isSystem ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        tabIndex={0}
                        aria-label={t('finance.categories.system')}
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        <Lock className="size-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56">
                      {t('finance.categories.system')}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('finance.categories.remove', { name: category.name })}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busy}
                    onClick={() => deleteMutation.mutate(category.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ),
          )}
          {categories.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">
              {t('finance.categories.empty')}
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
