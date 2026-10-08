import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useLocaleStore } from '@/stores/locale.store';
import { type MenuPackage, localizedName } from '../types/menu.types';

interface PackageCardProps {
  pkg: MenuPackage;
  /** Kartaning tepasi (muqova rasmi). */
  header?: ReactNode;
  /** Kartaning pastki qismi (tahrirlash tugmalari va h.k.). */
  footer?: ReactNode;
  className?: string;
}

/** Menyu paketi kartasi: narx va tarkib. Boshqaruv sahifasida ishlatiladi. */
export function PackageCard({ pkg, header, footer, className }: PackageCardProps) {
  const { t } = useTranslation();
  const language = useLocaleStore((state) => state.language);

  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl border bg-card p-6 shadow-soft transition-shadow hover:shadow-lifted',
        pkg.badge && 'border-gold/60',
        !pkg.isActive && 'opacity-60',
        className,
      )}
    >
      {header}
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate font-display text-2xl font-semibold tracking-tight">
          {pkg.name}
        </h3>
        <div className="flex shrink-0 gap-1.5">
          {pkg.badge && <Badge variant="gold">{pkg.badge}</Badge>}
          {!pkg.isActive && <Badge variant="secondary">{t('menu.inactive')}</Badge>}
        </div>
      </div>
      {pkg.description && (
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{pkg.description}</p>
      )}

      <p className="mt-4 flex items-baseline gap-2">
        <span className="tabular font-display text-4xl font-semibold text-gold-dark dark:text-gold-light">
          {formatAmount(pkg.pricePerGuest)}
        </span>
        <span className="text-sm text-muted-foreground">{t('menu.perGuest')}</span>
      </p>

      <ul className="mt-5 grid flex-1 content-start gap-2.5 border-t pt-5 text-sm">
        {pkg.sections.map((section) => (
          <li key={section.categoryId} className="flex gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-gold-dark dark:text-gold" />
            <span className="min-w-0">
              <span className="font-medium">{localizedName(section, language)}</span>
              {section.kindsCount > 1 && (
                <span className="text-muted-foreground">
                  {' '}
                  · {t('menu.kinds', { count: section.kindsCount })}
                </span>
              )}
              {section.items.length > 0 && (
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  {section.items.join(', ')}
                </span>
              )}
            </span>
          </li>
        ))}
        {pkg.sections.length === 0 && (
          <li className="text-muted-foreground">{t('menu.noSections')}</li>
        )}
      </ul>

      {footer && <div className="mt-5 flex items-center gap-2 border-t pt-4">{footer}</div>}
    </article>
  );
}
