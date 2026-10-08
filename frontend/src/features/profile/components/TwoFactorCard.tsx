import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { PasswordInput } from '@/components/ui/password-input';
import { Skeleton } from '@/components/ui/skeleton';
import { authApi, authKeys } from '@/features/auth/api/auth.api';
import { BackupCodesPanel } from '@/features/auth/components/BackupCodesPanel';
import { TwoFactorSetupFlow } from '@/features/auth/components/TwoFactorSetupFlow';
import {
  type DisableTwoFactorValues,
  type TotpCodeValues,
  disableTwoFactorSchema,
  totpCodeSchema,
} from '@/features/auth/schemas/auth.schemas';
import type { AuthProfile } from '@/features/auth/types/auth.types';
import { toApiError } from '@/lib/api-error';
import { syncProfile } from '@/lib/auth-session';
import { errorMessage } from '@/lib/error-message';

type DialogName = 'setup' | 'disable' | 'regenerate' | null;

/** Server xatosini tegishli forma maydoniga bog'laydi; boshqa xatolar toast bo'lib chiqadi. */
const FIELD_ERRORS: Record<string, 'password' | 'code'> = {
  INVALID_PASSWORD: 'password',
  INVALID_2FA_CODE: 'code',
};

export function TwoFactorCard({ user }: { user: AuthProfile }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogName>(null);

  const statusQuery = useQuery({
    queryKey: authKeys.twoFactorStatus,
    queryFn: authApi.twoFactorStatus,
  });

  const refresh = async () => {
    await syncProfile();
    await queryClient.invalidateQueries({ queryKey: authKeys.twoFactorStatus });
    await queryClient.invalidateQueries({ queryKey: authKeys.sessions });
  };

  const enabled = user.twoFactorEnabled;
  const required = user.twoFactorRequired;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          {t('profile.twoFactor.title')}
          <Badge variant={enabled ? 'success' : 'warning'}>
            {enabled ? <ShieldCheck /> : <ShieldAlert />}
            {t(enabled ? 'profile.twoFactor.enabled' : 'profile.twoFactor.disabled')}
          </Badge>
        </CardTitle>
        <CardDescription>
          {t(enabled ? 'profile.twoFactor.enabledText' : 'profile.twoFactor.disabledText')}
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-5">
        {enabled ? (
          <>
            <div className="rounded-xl border bg-muted/50 p-4 text-sm">
              {statusQuery.data ? (
                <p>
                  {t('profile.twoFactor.backupRemaining', {
                    count: statusQuery.data.backupCodesRemaining,
                  })}
                </p>
              ) : (
                <Skeleton className="h-5 w-48" />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setDialog('regenerate')}>
                <RefreshCw />
                {t('profile.twoFactor.regenerate')}
              </Button>
              {!required && (
                <Button
                  variant="ghost"
                  onClick={() => setDialog('disable')}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <ShieldOff />
                  {t('profile.twoFactor.disable')}
                </Button>
              )}
            </div>
            {required && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('profile.twoFactor.requiredForRole')}
              </p>
            )}
          </>
        ) : (
          <Button onClick={() => setDialog('setup')} className="justify-self-start">
            <ShieldCheck />
            {t('profile.twoFactor.enable')}
          </Button>
        )}
      </CardContent>

      <Dialog open={dialog === 'setup'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{t('profile.twoFactor.setupTitle')}</DialogTitle>
            <DialogDescription>{t('profile.twoFactor.setupDescription')}</DialogDescription>
          </DialogHeader>
          <TwoFactorSetupFlow
            onComplete={async () => {
              await refresh();
              toast.success(t('profile.twoFactor.enabledToast'));
              setDialog(null);
            }}
          />
        </DialogContent>
      </Dialog>

      <DisableDialog
        open={dialog === 'disable'}
        onClose={() => setDialog(null)}
        onDisabled={refresh}
      />
      <RegenerateDialog
        open={dialog === 'regenerate'}
        onClose={() => setDialog(null)}
        onRegenerated={() => queryClient.invalidateQueries({ queryKey: authKeys.twoFactorStatus })}
      />
    </Card>
  );
}

interface DisableDialogProps {
  open: boolean;
  onClose: () => void;
  onDisabled: () => Promise<void>;
}

function DisableDialog({ open, onClose, onDisabled }: DisableDialogProps) {
  const { t } = useTranslation();
  const form = useForm<DisableTwoFactorValues>({
    resolver: zodResolver(disableTwoFactorSchema),
    defaultValues: { password: '', code: '' },
  });

  const mutation = useMutation({
    mutationFn: authApi.twoFactorDisable,
    onSuccess: async () => {
      await onDisabled();
      toast.success(t('profile.twoFactor.disabledToast'));
      close();
    },
    onError: (error) => {
      const { code } = toApiError(error);
      const field = FIELD_ERRORS[code];
      if (field) {
        form.setError(field, { message: `errors.codes.${code}` }, { shouldFocus: true });
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  const close = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !mutation.isPending && close()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('profile.twoFactor.disableTitle')}</DialogTitle>
          <DialogDescription>{t('profile.twoFactor.disableText')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="grid gap-5"
            noValidate
          >
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('profile.twoFactor.password')}</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('profile.twoFactor.code')}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="one-time-code"
                      maxLength={20}
                      placeholder="000000"
                      className="font-mono tracking-widest"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={mutation.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="destructive" loading={mutation.isPending}>
                {t('profile.twoFactor.disable')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface RegenerateDialogProps {
  open: boolean;
  onClose: () => void;
  onRegenerated: () => Promise<void>;
}

function RegenerateDialog({ open, onClose, onRegenerated }: RegenerateDialogProps) {
  const { t } = useTranslation();
  const [codes, setCodes] = useState<string[] | null>(null);
  const form = useForm<TotpCodeValues>({
    resolver: zodResolver(totpCodeSchema),
    defaultValues: { code: '' },
  });

  const mutation = useMutation({
    mutationFn: ({ code }: TotpCodeValues) => authApi.regenerateBackupCodes(code),
    onSuccess: async ({ backupCodes }) => {
      setCodes(backupCodes);
      await onRegenerated();
    },
    onError: (error) => {
      if (toApiError(error).code === 'INVALID_2FA_CODE') {
        form.setError('code', { message: 'errors.codes.INVALID_2FA_CODE' }, { shouldFocus: true });
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  const close = () => {
    form.reset();
    setCodes(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !mutation.isPending && close()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {t(codes ? 'profile.twoFactor.newCodesTitle' : 'profile.twoFactor.regenerateTitle')}
          </DialogTitle>
          <DialogDescription>
            {t(codes ? 'profile.twoFactor.newCodesText' : 'profile.twoFactor.regenerateText')}
          </DialogDescription>
        </DialogHeader>

        {codes ? (
          <>
            <BackupCodesPanel codes={codes} />
            <DialogFooter>
              <Button onClick={close}>{t('common.close')}</Button>
            </DialogFooter>
          </>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
              className="grid gap-5"
              noValidate
            >
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('twoFactor.codeLabel')}</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="000000"
                        className="font-mono tracking-widest"
                        {...field}
                        onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ''))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button variant="outline" onClick={close} disabled={mutation.isPending}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={mutation.isPending}>
                  {t('profile.twoFactor.regenerate')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
