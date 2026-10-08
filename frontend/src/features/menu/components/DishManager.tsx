import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageOff, Pencil, Upload, UtensilsCrossed } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-message';
import { type Dish, dishKeys, dishesApi } from '../api/dishes.api';

/**
 * Taomlar: paketlarda yozilgan har bir taomga rasm va qisqa tavsif. Rasm mijozga
 * taqdimotda ko'rinadi. Yangi taom paket tarkibiga nom yozilganda shu yerda paydo bo'ladi.
 */
export function DishManager({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);
  const [editing, setEditing] = useState<Dish | null>(null);
  const [description, setDescription] = useState('');

  const query = useQuery({ queryKey: dishKeys.list, queryFn: dishesApi.list });
  const options = (message: string) => ({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dishKeys.list });
      toast.success(message);
      setEditing(null);
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });
  const photoMutation = useMutation({
    mutationFn: ({ name, file }: { name: string; file?: File }) =>
      file ? dishesApi.uploadPhoto(name, file) : dishesApi.removePhoto(name),
    ...options(t('menu.dishes.photoSaved')),
  });
  const saveMutation = useMutation({
    mutationFn: (dish: Dish) => dishesApi.save(dish.name, description.trim() || null),
    ...options(t('menu.dishes.saved')),
  });

  if (query.isError) {
    return (
      <Card>
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Card>
    );
  }
  if (!query.data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-64 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (query.data.length === 0) {
    return (
      <Card>
        <EmptyState title={t('menu.dishes.emptyTitle')} description={t('menu.dishes.emptyText')} />
      </Card>
    );
  }

  return (
    <>
      <p className="mb-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {t('menu.dishes.description')}
      </p>
      <input
        ref={fileInput}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const name = target.current;
          event.target.value = '';
          if (file && name) photoMutation.mutate({ name, file });
        }}
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {query.data.map((dish) => (
          <li key={dish.name}>
            <Card className="flex h-full flex-col overflow-hidden">
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                {dish.photo ? (
                  <img
                    src={dish.photo.thumbUrl}
                    alt={dish.name}
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-muted-foreground/50">
                    <UtensilsCrossed className="size-10" />
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-4">
                <h3 className="font-semibold">{dish.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {dish.packages
                    ? t('menu.dishes.inPackages', { count: dish.packages })
                    : t('menu.dishes.unused')}
                </p>
                {dish.description && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {dish.description}
                  </p>
                )}
                {canEdit && (
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={photoMutation.isPending}
                      onClick={() => {
                        target.current = dish.name;
                        fileInput.current?.click();
                      }}
                    >
                      <Upload />
                      {t(dish.photo ? 'menu.dishes.replacePhoto' : 'menu.dishes.uploadPhoto')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('menu.dishes.editDescription', { name: dish.name })}
                      onClick={() => {
                        setDescription(dish.description ?? '');
                        setEditing(dish);
                      }}
                    >
                      <Pencil />
                    </Button>
                    {dish.photo && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('menu.dishes.removePhoto', { name: dish.name })}
                        disabled={photoMutation.isPending}
                        onClick={() => photoMutation.mutate({ name: dish.name })}
                      >
                        <ImageOff />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && !saveMutation.isPending && setEditing(null)}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{editing?.name}</DialogTitle>
            <DialogDescription>{t('menu.dishes.descriptionHint')}</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (editing) saveMutation.mutate(editing);
            }}
          >
            <Textarea
              rows={3}
              maxLength={300}
              value={description}
              aria-label={t('menu.dishes.descriptionLabel')}
              placeholder={t('menu.dishes.descriptionPlaceholder')}
              onChange={(event) => setDescription(event.target.value)}
            />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditing(null)}
                disabled={saveMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={saveMutation.isPending}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
