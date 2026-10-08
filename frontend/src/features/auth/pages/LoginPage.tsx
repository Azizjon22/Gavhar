import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  KeyRound,
  Lock,
  Mail,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { useCountdown } from '@/hooks/use-countdown';
import { type ApiError, toApiError } from '@/lib/api-error';
import { errorMessage, formatDuration } from '@/lib/error-message';
import { cn } from '@/lib/utils';
import { useBrand } from '@/features/settings/api/brand.api';
import { useAuthStore } from '@/stores/auth.store';
import { authApi } from '../api/auth.api';
import { AnimatedGem } from '../components/AnimatedGem';
import { AuthBackdrop } from '../components/AuthBackdrop';
import { AuthHeader } from '../components/AuthHeader';
import {
  type LoginCodeValues,
  type LoginValues,
  loginCodeSchema,
  loginSchema,
} from '../schemas/auth.schemas';

/** Vaqtincha bloklash kodlari: xabar o'rniga qolgan vaqt sanab ko'rsatiladi. */
const LOCK_CODES = new Set(['ACCOUNT_LOCKED', 'RATE_LIMITED']);
const TOTP_PATTERN = /^\d{6}$/;
const EASE = [0.22, 1, 0.36, 1] as const;

const glassInput = cn(
  'h-12 rounded-xl border-white/15 bg-white/[0.07] pl-11 text-[15px] text-white shadow-none',
  'placeholder:text-white/35 focus-visible:border-gold-light focus-visible:ring-gold/25',
  'aria-invalid:border-red-400/70 aria-invalid:focus-visible:ring-red-400/20',
  // Brauzer avtoto'ldirishi oq fon qo'yib yubormasligi uchun.
  'autofill:shadow-[inset_0_0_0_1000px_#123b2f] autofill:[-webkit-text-fill-color:#fff]',
);

const iconClasses =
  'pointer-events-none absolute top-1/2 left-3.5 z-10 size-[18px] -translate-y-1/2 text-white/45';

/** Xato va bloklash holatini boshqaradi: bloklangan bo'lsa, qolgan vaqtni sanaydi. */
function useAuthFailure() {
  const { t } = useTranslation();
  const [error, setError] = useState<ApiError | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const lockRemaining = useCountdown(lockedUntil);

  const capture = useCallback((raw: unknown) => {
    const apiError = toApiError(raw);
    const retryAfter = apiError.retryAfterSeconds;
    setError(apiError);
    setLockedUntil(
      retryAfter && LOCK_CODES.has(apiError.code) ? Date.now() + retryAfter * 1000 : null,
    );
  }, []);

  const clear = useCallback(() => setError(null), []);
  /**
   * Mahalliy sanoqni to'xtatadi. Foydalanuvchi boshqa parol yoki email terganda
   * chaqiriladi: administrator parolni tiklab, blokni olib tashlagan bo'lishi mumkin.
   * Blok hali turgan bo'lsa, server qolgan vaqtni qaytaradi va sanoq davom etadi.
   */
  const unlock = useCallback(() => {
    setError(null);
    setLockedUntil(null);
  }, []);

  let message: string | null = null;
  if (lockRemaining > 0) {
    message = t('auth.lockedCountdown', { time: formatDuration(lockRemaining) });
  } else if (error && !LOCK_CODES.has(error.code)) {
    message = errorMessage(error);
  }

  return { message, locked: lockRemaining > 0, capture, clear, unlock };
}

function AuthAlert({ message }: { message: string | null }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden"
        >
          <div className="flex items-start gap-2.5 rounded-xl border border-red-400/30 bg-red-500/10 px-3.5 py-3 text-sm leading-relaxed text-red-100">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-300" />
            <span className="tabular">{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SubmitButton({ children, loading, disabled }: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      variant="gold"
      size="lg"
      loading={loading}
      disabled={disabled}
      className="group relative w-full overflow-hidden"
    >
      <span
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        aria-hidden="true"
      />
      <span className="relative flex items-center gap-2">{children}</span>
    </Button>
  );
}

interface SubmitButtonProps {
  children: ReactNode;
  loading: boolean;
  disabled: boolean;
}

function CredentialsStep({ onChallenge }: { onChallenge: (challengeToken: string) => void }) {
  const { t } = useTranslation();
  const failure = useAuthFailure();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (result) => {
      if (result.requiresTwoFactor) {
        onChallenge(result.challengeToken);
        return;
      }
      // Router `GuestOnly` orqali foydalanuvchini ichkariga o'tkazadi.
      useAuthStore.getState().setSession(result);
    },
    onError: failure.capture,
  });

  const submit = form.handleSubmit((values) => {
    failure.clear();
    mutation.mutate(values);
  });

  return (
    <div className="grid gap-7">
      <div className="flex flex-col items-center gap-4 text-center">
        <AnimatedGem />
        <div className="space-y-1.5">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">
            {t('auth.login.title')}
          </h1>
          <p className="text-sm text-white/60">{t('auth.login.subtitle')}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white/80">{t('auth.login.email')}</FormLabel>
                <div className="relative">
                  <Mail className={iconClasses} aria-hidden="true" />
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="username"
                      autoFocus
                      placeholder="admin@gavhar.uz"
                      className={glassInput}
                      {...field}
                      onChange={(event) => {
                        if (failure.locked) failure.unlock();
                        field.onChange(event);
                      }}
                    />
                  </FormControl>
                </div>
                <FormMessage className="text-red-300" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white/80">{t('auth.login.password')}</FormLabel>
                <div className="relative">
                  <Lock className={iconClasses} aria-hidden="true" />
                  <FormControl>
                    <PasswordInput
                      autoComplete="current-password"
                      placeholder="••••••••••••"
                      className={glassInput}
                      toggleClassName="text-white/50 hover:text-white focus-visible:ring-gold/40"
                      {...field}
                      onChange={(event) => {
                        if (failure.locked) failure.unlock();
                        field.onChange(event);
                      }}
                    />
                  </FormControl>
                </div>
                <FormMessage className="text-red-300" />
              </FormItem>
            )}
          />

          <AuthAlert message={failure.message} />

          <SubmitButton loading={mutation.isPending} disabled={failure.locked}>
            {t('auth.login.submit')}
            <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </SubmitButton>
        </form>
      </Form>

      <p className="flex items-center justify-center gap-2 text-xs text-white/45">
        <ShieldCheck className="size-3.5" />
        {t('auth.login.secureNote')}
      </p>
    </div>
  );
}

interface TwoFactorStepProps {
  challengeToken: string;
  onBack: () => void;
}

function TwoFactorStep({ challengeToken, onBack }: TwoFactorStepProps) {
  const { t } = useTranslation();
  const failure = useAuthFailure();
  const form = useForm<LoginCodeValues>({
    resolver: zodResolver(loginCodeSchema),
    defaultValues: { code: '' },
  });

  const mutation = useMutation({
    mutationFn: ({ code }: LoginCodeValues) => authApi.verifyTwoFactor({ challengeToken, code }),
    onSuccess: (session) => useAuthStore.getState().setSession(session),
    onError: (error) => {
      if (toApiError(error).code === 'TWO_FACTOR_CHALLENGE_EXPIRED') {
        toast.error(errorMessage(error));
        onBack();
        return;
      }
      failure.capture(error);
      form.setFocus('code', { shouldSelect: true });
    },
  });

  const { mutate, isPending } = mutation;
  const { clear: clearFailure } = failure;
  const code = form.watch('code');

  // 6 ta raqam kiritilishi bilan o'zi yuboriladi — "Tasdiqlash"ni bosish shart emas.
  useEffect(() => {
    if (TOTP_PATTERN.test(code) && !isPending) {
      clearFailure();
      mutate({ code });
    }
    // Faqat kod o'zgarganda: xatodan keyin o'sha kod qayta yuborilmasligi kerak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const submit = form.handleSubmit((values) => {
    failure.clear();
    mutation.mutate(values);
  });

  return (
    <div className="grid gap-7">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10">
          <KeyRound className="size-7 text-gold-light" />
        </span>
        <div className="space-y-1.5">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">
            {t('auth.twoFactor.title')}
          </h1>
          <p className="text-sm leading-relaxed text-white/60">{t('auth.twoFactor.subtitle')}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">{t('auth.twoFactor.code')}</FormLabel>
                <FormControl>
                  <Input
                    autoFocus
                    autoComplete="one-time-code"
                    inputMode="text"
                    maxLength={20}
                    placeholder="000000"
                    className={cn(
                      glassInput,
                      'h-14 pl-3 text-center font-mono text-2xl tracking-[0.35em] placeholder:tracking-[0.35em]',
                    )}
                    {...field}
                  />
                </FormControl>
                <p className="text-center text-xs text-white/45">
                  {t('auth.twoFactor.backupHint')}
                </p>
                <FormMessage className="text-center text-red-300" />
              </FormItem>
            )}
          />

          <AuthAlert message={failure.message} />

          <SubmitButton loading={mutation.isPending} disabled={failure.locked}>
            {t('auth.twoFactor.submit')}
          </SubmitButton>
        </form>
      </Form>

      <button
        type="button"
        onClick={onBack}
        className="mx-auto flex cursor-pointer items-center gap-1.5 rounded-md text-sm text-white/55 transition-colors outline-none hover:text-white focus-visible:ring-[3px] focus-visible:ring-gold/40"
      >
        <ArrowLeft className="size-4" />
        {t('auth.twoFactor.back')}
      </button>
    </div>
  );
}

const HERO_FEATURES = [
  { icon: ShieldCheck, key: 'security' },
  { icon: Users, key: 'roles' },
  { icon: ScrollText, key: 'audit' },
] as const;

function Hero() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } }}
      className="hidden max-w-xl lg:block"
    >
      <motion.p
        variants={heroItem}
        className="mb-6 flex items-center gap-3 text-xs font-bold tracking-[0.32em] text-gold-light/90 uppercase"
      >
        <span className="h-px w-10 bg-gradient-to-r from-transparent to-gold-light/80" />
        {t('auth.hero.eyebrow')}
      </motion.p>
      <motion.h2
        variants={heroItem}
        className="font-display text-5xl leading-[1.08] font-semibold tracking-tight text-white xl:text-6xl"
      >
        {t('auth.hero.headline')}
        <span className="text-gold-gradient block pb-2 italic">
          {t('auth.hero.headlineAccent')}
        </span>
      </motion.h2>
      <motion.p variants={heroItem} className="mt-6 max-w-md text-lg leading-relaxed text-white/65">
        {t('auth.hero.text')}
      </motion.p>
      <motion.ul variants={heroItem} className="mt-10 grid gap-4">
        {HERO_FEATURES.map(({ icon: Icon, key }) => (
          <li key={key} className="flex items-center gap-3.5 text-sm font-medium text-white/80">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-gold/25 bg-gold/10">
              <Icon className="size-[18px] text-gold-light" />
            </span>
            {t(`auth.hero.features.${key}`)}
          </li>
        ))}
      </motion.ul>
    </motion.section>
  );
}

const heroItem = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

const stepTransition = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.3, ease: EASE },
};

export function LoginPage() {
  const brand = useBrand();
  const { t } = useTranslation();
  const [challengeToken, setChallengeToken] = useState<string | null>(null);

  return (
    <AuthBackdrop>
      <AuthHeader />

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 pt-2 pb-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-16 lg:px-12">
        <Hero />

        <motion.section
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}
          className="relative mx-auto w-full max-w-[440px]"
        >
          <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-white/[0.06] p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.65)] backdrop-blur-2xl sm:p-9">
            <span
              className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-gold-light/90 to-transparent"
              aria-hidden="true"
            />
            <AnimatePresence mode="wait" initial={false}>
              {challengeToken ? (
                <motion.div key="two-factor" {...stepTransition}>
                  <TwoFactorStep
                    challengeToken={challengeToken}
                    onBack={() => setChallengeToken(null)}
                  />
                </motion.div>
              ) : (
                <motion.div key="credentials" {...stepTransition}>
                  <CredentialsStep onChallenge={setChallengeToken} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.section>
      </main>

      <footer className="px-6 pb-6 text-center text-xs text-white/35">
        © {new Date().getFullYear()} {brand.name} · {t('auth.footer')}
      </footer>
    </AuthBackdrop>
  );
}
