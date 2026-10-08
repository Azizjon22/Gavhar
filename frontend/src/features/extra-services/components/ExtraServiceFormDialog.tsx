import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { MoneyInput } from '@/components/shared/MoneyInput';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toApiError } from '@/lib/api-error';
import { errorMessage } from '@/lib/error-message';
import { amountToInput } from '@/lib/money';
import { extraServiceKeys, extraServicesApi } from '../api/extra-services.api';
import type { ExtraService } from '../types/extra-service.types';

const schema = z.object({
  name: z.string().trim().min(2, 'validation.serviceName').max(80, 'validation.serviceName'),
  price: z.string().regex(/^(0|[1-9]\d{0,12})$/, 'validation.amount'),
  unit: z.enum(['PER_EVENT', 'PER_GUEST']),
});
type Values = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: ExtraService;
}

const EMPTY: Values = { name: '', price: '', unit: 'PER_EVENT' };

export function ExtraServiceFormDialog({ open, onOpenChange, service }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = service !== undefined;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    form.reset(
      service
        ? { name: service.name, price: amountToInput(service.price), unit: service.unit }
        : EMPTY,
    );
  }, [open, service, form]);

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      service
        ? extraServicesApi.update(service.id, values)
        : extraServicesApi.create({ ...values, isActive: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: extraServiceKeys.all });
      toast.success(t(isEdit ? 'services.toast.updated' : 'services.toast.created'));
      onOpenChange(false);
    },
    onError: (error) => {
      if (toApiError(error).code === 'EXTRA_SERVICE_NAME_TAKEN') {
        form.setError(
          'name',
          { message: 'errors.codes.EXTRA_SERVICE_NAME_TAKEN' },
          { shouldFocus: true },
        );
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {t(isEdit ? 'services.form.editTitle' : 'services.form.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('services.form.description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="grid gap-5"
            noValidate
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('services.form.name')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('services.form.namePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('services.form.unit')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger ref={field.ref} onBlur={field.onBlur}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="PER_EVENT">{t('services.unit.PER_EVENT')}</SelectItem>
                      <SelectItem value="PER_GUEST">{t('services.unit.PER_GUEST')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('services.form.price')}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} />
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
                {t('common.cancel')}
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
