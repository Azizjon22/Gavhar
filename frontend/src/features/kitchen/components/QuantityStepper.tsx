import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WarehouseUnit } from '@/features/warehouse/types/warehouse.types';
import { cn } from '@/lib/utils';
import { type KgMode, addStep, fromInput, toInput } from '../lib/kitchen';

interface Props {
  name: string;
  unit: WarehouseUnit;
  value: number;
  mode: KgMode;
  onChange: (value: number) => void;
  /** Berilsa — bundan ko'p yozib bo'lmaydi (ombordagi qoldiq). */
  max?: number;
  onModeChange?: (mode: KgMode) => void;
}

/** "− [miqdor] +" va kg mahsulot uchun "kg | gramm" almashtirgich. */
export function QuantityStepper({ name, unit, value, mode, onChange, max, onModeChange }: Props) {
  const { t } = useTranslation();
  const clamp = (next: number) => (max !== undefined ? Math.min(next, max) : next);
  const atMax = max !== undefined && value >= max;

  return (
    <div>
      <div className="flex items-center gap-1 p-2">
        <button
          type="button"
          disabled={value <= 0}
          aria-label={t('kitchen.builder.decrease', { name })}
          onClick={() => onChange(addStep(unit, mode, value, -1))}
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-95 disabled:cursor-default disabled:opacity-30"
        >
          <Minus className="size-4" />
        </button>
        <input
          value={toInput(value, unit, mode)}
          inputMode={unit === 'LITER' || (unit === 'KG' && mode === 'kg') ? 'decimal' : 'numeric'}
          placeholder="0"
          aria-label={t('kitchen.builder.amount', { name })}
          onChange={(event) => onChange(clamp(fromInput(event.target.value, unit, mode)))}
          className="tabular h-10 w-full min-w-0 rounded-lg border border-input bg-transparent text-center text-sm font-bold outline-none focus:ring-2 focus:ring-ring/40"
        />
        <button
          type="button"
          disabled={atMax}
          aria-label={t('kitchen.builder.increase', { name })}
          onClick={() => onChange(clamp(addStep(unit, mode, value, 1)))}
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground transition outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-95 disabled:cursor-default disabled:opacity-30"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {unit === 'KG' && onModeChange && (
        <div
          role="radiogroup"
          aria-label={t('kitchen.builder.measure', { name })}
          className="grid grid-cols-2 gap-1 px-2 pb-2"
        >
          {(['kg', 'g'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={mode === option}
              onClick={() => mode !== option && onModeChange(option)}
              className={cn(
                'h-7 cursor-pointer rounded-md text-xs font-semibold transition',
                mode === option
                  ? 'bg-primary/12 text-primary ring-1 ring-primary/40 dark:text-gold-light'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t(option === 'kg' ? 'kitchen.builder.kg' : 'kitchen.builder.gram')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
