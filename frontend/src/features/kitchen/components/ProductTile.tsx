import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProductCategory, WarehouseUnit } from '@/features/warehouse/types/warehouse.types';
import { cn } from '@/lib/utils';
import { categoryCover } from '../lib/kitchen';

interface Props {
  name: string;
  unit: WarehouseUnit;
  category: ProductCategory | null;
  photo: { thumbUrl: string } | null;
  selected: boolean;
  /** Rasm ustida chap burchakda (masalan "jami 12 kg" yoki "omborda 30 kg"). */
  corner?: ReactNode;
  onPick: () => void;
  index: number;
  children: ReactNode;
}

/**
 * Mahsulot kartochkasi: rasm (bo'lmasa — turining muqovasi), nomi va birligi rasm
 * ustida; pastda miqdor tanlagich. Rasmni bosish birinchi miqdorni qo'yadi.
 */
export function ProductTile({
  name,
  unit,
  category,
  photo,
  selected,
  corner,
  onPick,
  index,
  children,
}: Props) {
  const { t } = useTranslation();
  return (
    <div
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
      className={cn(
        'group animate-in overflow-hidden rounded-2xl border bg-card shadow-soft transition duration-300 fill-mode-backwards fade-in slide-in-from-bottom-2 hover:-translate-y-0.5',
        selected ? 'border-primary ring-1 ring-primary' : 'hover:border-gold/60',
      )}
    >
      <button
        type="button"
        onClick={onPick}
        aria-label={t('kitchen.builder.pick', { name })}
        className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
      >
        <img
          src={photo?.thumbUrl ?? categoryCover(category)}
          alt=""
          loading="lazy"
          className="size-full object-cover transition duration-700 ease-out group-hover:scale-110"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        {selected && (
          <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Check className="size-3.5" />
          </span>
        )}
        {corner && (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            {corner}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1.5 p-2">
          <span className="min-w-0 truncate text-sm font-semibold text-white drop-shadow">
            {name}
          </span>
          <span className="shrink-0 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] text-white/90 backdrop-blur-sm">
            {t(`warehouse.unit.${unit}`)}
          </span>
        </span>
      </button>
      {children}
    </div>
  );
}

interface CoverProps {
  category: ProductCategory;
  count: number;
  picked: number;
  index: number;
  icon: ReactNode;
  onOpen: () => void;
}

/** Mahsulot turi muqovasi: oshpaz avval turni tanlaydi, keyin ichidan mahsulotni. */
export function CategoryCover({ category, count, picked, index, icon, onOpen }: CoverProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ animationDelay: `${index * 40}ms` }}
      className={cn(
        'group relative aspect-[4/3] animate-in cursor-pointer overflow-hidden rounded-2xl border text-left shadow-soft transition duration-300 outline-none fill-mode-backwards fade-in slide-in-from-bottom-2 hover:-translate-y-1 hover:border-gold/60 focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.98]',
        picked > 0 && 'border-primary ring-1 ring-primary',
      )}
    >
      <img
        src={categoryCover(category)}
        alt=""
        loading="lazy"
        className="absolute inset-0 size-full object-cover transition duration-700 ease-out group-hover:scale-110"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
      <span className="absolute top-2.5 left-2.5 flex size-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition group-hover:bg-primary">
        {icon}
      </span>
      {picked > 0 && (
        <span className="tabular absolute top-2.5 right-2.5 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
          <Check className="size-3" />
          {picked}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 p-3">
        <span className="line-clamp-2 text-sm leading-tight font-semibold text-white drop-shadow sm:text-base">
          {t(`warehouse.productCategory.${category}`)}
        </span>
        <span className="block text-[11px] text-white/75">
          {t('kitchen.builder.productsCount', { count })}
        </span>
      </span>
    </button>
  );
}
