import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { AuthBackdrop } from './AuthBackdrop';
import { AuthHeader } from './AuthHeader';

interface SetupShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

/** Majburiy sozlash sahifalari (parol, 2FA) uchun umumiy qobiq. */
export function SetupShell({ eyebrow, title, description, children }: SetupShellProps) {
  return (
    <AuthBackdrop>
      <AuthHeader showLogout />
      <main className="flex flex-1 items-center justify-center px-4 pt-2 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-xl rounded-3xl border bg-card p-6 text-card-foreground shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] sm:p-9"
        >
          <span
            className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent"
            aria-hidden="true"
          />
          <p className="text-xs font-bold tracking-[0.2em] text-gold-dark uppercase dark:text-gold-light">
            {eyebrow}
          </p>
          <h1 className="mt-2 font-display text-3xl leading-tight font-semibold tracking-tight">
            {title}
          </h1>
          <p className="mt-2 mb-7 text-sm leading-relaxed text-muted-foreground">{description}</p>
          {children}
        </motion.div>
      </main>
    </AuthBackdrop>
  );
}
