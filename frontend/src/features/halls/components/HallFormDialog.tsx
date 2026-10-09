import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toApiError } from '@/lib/api-error';
import { errorMessage } from '@/lib/error-message';
import { hallKeys, hallsApi } from '../api/halls.api';
import { type HallFormValues, hallFormSchema } from '../schemas/hall.schemas';
import type { Hall, HallImage } from '../types/hall.types';
import { HallImageManager } from './HallImageManager';

interface HallFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Berilsa — tahrirlash; berilmasa — yangi zal. */
  hall?: Hall;
}

const EMPTY: HallFormValues = {
  name: '',
  capacity: '',
  description: '',
  status: 'ACTIVE',
};

export function HallFormDialog({ open, onOpenChange, hall }: HallFormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = hall !== undefined;
  const [images, setImages] = useState<HallImage[]>([]);

  const form = useForm<HallFormValues>({
    resolver: zodResolver(hallFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    setImages(hall?.images ?? []);
    form.reset(
      hall
        ? {
            name: hall.name,
            capacity: String(hall.capacity),
            description: hall.description ?? '',
            status: hall.status,
          }
        : EMPTY,
    );
    // Faqat dialog ochilganda yoki boshqa zal tanlanganda — rasm o'zgarganda forma tozalanmasin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hall?.id]);

  const refreshList = () => queryClient.invalidateQueries({ queryKey: hallKeys.all });

  const mutation = useMutation({
    mutationFn: (values: HallFormValues) => {
      const payload = {
        name: values.name,
        capacity: Number(values.capacity),
        description: values.description || null,
        status: values.status,
      };
      return hall ? hallsApi.update(hall.id, payload) : hallsApi.create(payload);
    },
    onSuccess: async () => {
      await refreshList();
      toast.success(t(isEdit ? 'halls.toast.updated' : 'halls.toast.created'));
      onOpenChange(false);
    },
    onError: (error) => {
      if (toApiError(error).code === 'HALL_NAME_TAKEN') {
        form.setError('name', { message: 'errors.codes.HALL_NAME_TAKEN' }, { shouldFocus: true });
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t(isEdit ? 'halls.form.editTitle' : 'halls.form.createTitle')}</DialogTitle>
          <DialogDescription>
            {t(isEdit ? 'halls.form.editDescription' : 'halls.form.createDescription')}
          </DialogDescription>
        </DialogHeader>

        {hall && (
          <div className="grid gap-2">
            <Label asChild>
              <p>{t('halls.form.images')}</p>
            </Label>
            <HallImageManager
              hallId={hall.id}
              images={images}
              onChange={(updated) => {
                setImages(updated.images);
                void refreshList();
              }}
            />
          </div>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="grid gap-5"
            noValidate
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t('halls.form.name')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('halls.form.namePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('halls.form.status')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger ref={field.ref} onBlur={field.onBlur}>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTIVE">{t('halls.status.ACTIVE')}</SelectItem>
                        <SelectItem value="MAINTENANCE">{t('halls.status.MAINTENANCE')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('halls.form.capacity')}</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="400"
                        maxLength={5}
                        className="tabular"
                        {...field}
                        onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ''))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('halls.form.description')}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({t('common.optional')})
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder={t('halls.form.descriptionPlaceholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                {t(isEdit ? 'common.close' : 'common.cancel')}
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                {t(isEdit ? 'common.save' : 'common.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
