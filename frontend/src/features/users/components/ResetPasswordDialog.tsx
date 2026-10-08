import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CircleCheck, Copy } from 'lucide-react';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { copyToClipboard } from '@/lib/clipboard';
import { errorMessage } from '@/lib/error-message';
import { generatePassword } from '@/lib/password-policy';
import { usersApi } from '../api/users.api';
import { type ResetPasswordValues, resetPasswordSchema } from '../schemas/user.schemas';
import type { User } from '../types/user.types';
import { TempPasswordField } from './TempPasswordField';

interface ResetPasswordDialogProps {
  user: User | null;
  onClose: () => void;
}

/**
 * SUPER_ADMIN parolini unutgan xodimga yangi vaqtinchalik parol o'rnatadi.
 * O'rnatilgach parol yana bir marta ko'rsatiladi — nusxalab xodimga yetkazish uchun.
 */
export function ResetPasswordDialog({ user, onClose }: ResetPasswordDialogProps) {
  const { t } = useTranslation();
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '' },
  });

  // O'rnatilgan parol: oyna yopilguncha ko'rinib turadi, keyin boshqa ko'rsatilmaydi.
  const [issued, setIssued] = useState<string | null>(null);
  // Yopilish animatsiyasi paytida ham oxirgi foydalanuvchi ko'rinib turadi.
  const [last, setLast] = useState(user);
  const shown = user ?? last;

  useEffect(() => {
    if (!user) return;
    setLast(user);
    setIssued(null);
    form.reset({ newPassword: generatePassword() });
  }, [user, form]);

  const mutation = useMutation({
    mutationFn: ({ newPassword }: ResetPasswordValues) =>
      usersApi.resetPassword(user?.id ?? '', newPassword),
    onSuccess: (_, { newPassword }) => {
      toast.success(t('users.toast.passwordReset'));
      setIssued(newPassword);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('users.resetPassword.title')}</DialogTitle>
          <DialogDescription>
            {t('users.resetPassword.description', { name: shown?.fullName ?? '' })}
          </DialogDescription>
        </DialogHeader>
        {issued !== null ? (
          <div className="grid gap-5">
            <div className="rounded-xl border border-success/30 bg-success/10 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-success">
                <CircleCheck className="size-4" />
                {t('users.resetPassword.doneTitle')}
              </p>
              <dl className="mt-3 grid gap-2 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{t('users.resetPassword.login')}</dt>
                  <dd className="min-w-0 truncate font-medium">{shown?.email}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{t('users.resetPassword.newPassword')}</dt>
                  <dd className="font-mono text-base font-semibold break-all">{issued}</dd>
                </div>
              </dl>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t('users.resetPassword.doneText')}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => void copyToClipboard(issued)}>
                <Copy />
                {t('users.resetPassword.copy')}
              </Button>
              <Button onClick={onClose}>{t('users.resetPassword.done')}</Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
              className="grid gap-5"
              noValidate
            >
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.resetPassword.newPassword')}</FormLabel>
                    <FormControl>
                      <TempPasswordField {...field} />
                    </FormControl>
                    <FormDescription>{t('users.form.passwordHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={mutation.isPending}>
                  {t('users.resetPassword.submit')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
