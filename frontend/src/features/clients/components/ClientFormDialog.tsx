import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PhoneInput } from '@/components/shared/PhoneInput';
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
import { Textarea } from '@/components/ui/textarea';
import { toApiError } from '@/lib/api-error';
import { errorMessage } from '@/lib/error-message';
import { clientKeys, clientsApi } from '../api/clients.api';
import { type ClientFormValues, clientFormSchema } from '../schemas/client.schemas';
import type { Client } from '../types/client.types';

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Berilsa — tahrirlash; berilmasa — yangi mijoz. */
  client?: Client;
  /** Saqlangach chaqiriladi (masalan bron formasida yangi mijozni darhol tanlash uchun). */
  onSaved?: (client: Client) => void;
}

const EMPTY: ClientFormValues = { fullName: '', phone: '', phoneExtra: '', note: '' };

export function ClientFormDialog({ open, onOpenChange, client, onSaved }: ClientFormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = client !== undefined;

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      client
        ? {
            fullName: client.fullName,
            phone: client.phone,
            phoneExtra: client.phoneExtra ?? '',
            note: client.note ?? '',
          }
        : EMPTY,
    );
  }, [open, client, form]);

  const mutation = useMutation({
    mutationFn: (values: ClientFormValues) => {
      const payload = {
        fullName: values.fullName,
        phone: values.phone,
        phoneExtra: values.phoneExtra || null,
        note: values.note || null,
      };
      return client ? clientsApi.update(client.id, payload) : clientsApi.create(payload);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: clientKeys.all });
      onSaved?.(saved);
      toast.success(t(isEdit ? 'clients.toast.updated' : 'clients.toast.created'));
      onOpenChange(false);
    },
    onError: (error) => {
      if (toApiError(error).code === 'CLIENT_PHONE_TAKEN') {
        // Xabarda shu raqam egasining ismi ko'rsatiladi.
        form.setError('phone', { message: errorMessage(error) }, { shouldFocus: true });
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  const optional = (
    <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(isEdit ? 'clients.form.editTitle' : 'clients.form.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('clients.form.description')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="grid gap-5"
            noValidate
          >
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('clients.form.fullName')}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" placeholder="Karimov Anvar" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('clients.form.phone')}</FormLabel>
                    <FormControl>
                      <PhoneInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phoneExtra"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('clients.form.phoneExtra')} {optional}
                    </FormLabel>
                    <FormControl>
                      <PhoneInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('clients.form.note')} {optional}
                  </FormLabel>
                  <FormControl>
                    <Textarea placeholder={t('clients.form.notePlaceholder')} {...field} />
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
