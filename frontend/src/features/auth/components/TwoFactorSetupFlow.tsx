import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Copy, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { toApiError } from '@/lib/api-error';
import { copyToClipboard } from '@/lib/clipboard';
import { errorMessage } from '@/lib/error-message';
import { authApi } from '../api/auth.api';
import { type TotpCodeValues, totpCodeSchema } from '../schemas/auth.schemas';
import type { TwoFactorSetup } from '../types/auth.types';
import { BackupCodesPanel } from './BackupCodesPanel';

type Step =
  | { name: 'intro' }
  | { name: 'scan'; setup: TwoFactorSetup }
  | { name: 'codes'; backupCodes: string[] };

interface TwoFactorSetupFlowProps {
  /** Foydalanuvchi zaxira kodlarni saqlaganini tasdiqlagach chaqiriladi. */
  onComplete: () => void | Promise<void>;
}

const groupSecret = (secret: string): string => secret.match(/.{1,4}/g)?.join(' ') ?? secret;

/**
 * 2FA ulash: (1) tushuntirish → (2) QR kod va tasdiqlash → (3) zaxira kodlar.
 * Majburiy sozlash sahifasida ham, profilda ham shu komponent ishlatiladi.
 */
export function TwoFactorSetupFlow({ onComplete }: TwoFactorSetupFlowProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>({ name: 'intro' });
  const [saved, setSaved] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const form = useForm<TotpCodeValues>({
    resolver: zodResolver(totpCodeSchema),
    defaultValues: { code: '' },
  });

  const setupMutation = useMutation({
    mutationFn: authApi.twoFactorSetup,
    onSuccess: (setup) => setStep({ name: 'scan', setup }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const enableMutation = useMutation({
    mutationFn: ({ code }: TotpCodeValues) => authApi.twoFactorEnable(code),
    onSuccess: ({ backupCodes }) => setStep({ name: 'codes', backupCodes }),
    onError: (error) => {
      if (toApiError(error).code === 'INVALID_2FA_CODE') {
        form.setError('code', { message: 'errors.codes.INVALID_2FA_CODE' }, { shouldFocus: true });
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  if (step.name === 'intro') {
    return (
      <div className="grid gap-5">
        <ol className="grid gap-3 text-sm leading-relaxed text-muted-foreground">
          {(['install', 'scan', 'confirm'] as const).map((key, index) => (
            <li key={key} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-bold text-gold-dark dark:text-gold-light">
                {index + 1}
              </span>
              <span>{t(`twoFactor.intro.${key}`)}</span>
            </li>
          ))}
        </ol>
        <Button
          onClick={() => setupMutation.mutate()}
          loading={setupMutation.isPending}
          className="justify-self-start"
        >
          <ShieldCheck />
          {t('twoFactor.start')}
        </Button>
      </div>
    );
  }

  if (step.name === 'scan') {
    const { setup } = step;
    return (
      <div className="grid gap-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <img
            src={setup.qrCodeDataUrl}
            alt={t('twoFactor.qrAlt')}
            width={176}
            height={176}
            className="size-44 shrink-0 rounded-2xl border bg-white p-2"
          />
          <div className="grid min-w-0 gap-3 text-sm">
            <p className="leading-relaxed text-muted-foreground">{t('twoFactor.scanText')}</p>
            <div className="grid gap-1.5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('twoFactor.manualKey')}
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 rounded-lg border bg-muted/60 px-3 py-2 font-mono text-xs break-words">
                  {groupSecret(setup.secret)}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('common.copy')}
                  onClick={() => void copyToClipboard(setup.secret)}
                >
                  <Copy />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => enableMutation.mutate(values))}
            className="grid gap-4"
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
                      className="h-14 max-w-56 text-center font-mono text-2xl tracking-[0.4em]"
                      {...field}
                      onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ''))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" loading={enableMutation.isPending} className="justify-self-start">
              {t('twoFactor.verify')}
            </Button>
          </form>
        </Form>
      </div>
    );
  }

  const finish = async () => {
    setFinishing(true);
    try {
      await onComplete();
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
        <p className="leading-relaxed">{t('twoFactor.backup.text')}</p>
      </div>
      <BackupCodesPanel codes={step.backupCodes} />
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
        <Checkbox
          checked={saved}
          onCheckedChange={(checked) => setSaved(checked === true)}
          className="mt-0.5"
        />
        {t('twoFactor.backup.saved')}
      </label>
      <Button
        onClick={() => void finish()}
        disabled={!saved}
        loading={finishing}
        className="justify-self-start"
      >
        {t('common.continue')}
      </Button>
    </div>
  );
}
