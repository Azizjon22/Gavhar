import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { inputClasses } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { clientKeys, clientsApi } from '@/features/clients/api/clients.api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';

export interface ClientOption {
  id: string;
  fullName: string;
  phone: string;
}

interface ClientComboboxProps {
  value: ClientOption | null;
  onChange: (client: ClientOption) => void;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Mijozni ism yoki telefon bo'yicha qidirib tanlash. */
export function ClientCombobox({ value, onChange, ...trigger }: ClientComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 250);

  const params = { limit: 8, ...(debounced && { search: debounced }) };
  const query = useQuery({
    queryKey: clientKeys.list(params),
    queryFn: () => clientsApi.list(params),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const options = query.data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        role="combobox"
        aria-expanded={open}
        className={cn(inputClasses, 'cursor-pointer items-center justify-between gap-2 text-left')}
        {...trigger}
      >
        {value ? (
          <span className="truncate">
            {value.fullName}{' '}
            <span className="tabular text-muted-foreground">· {formatPhone(value.phone)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground/70">{t('events.form.clientPlaceholder')}</span>
        )}
        <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent>
        <div className="relative mb-1.5">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('clients.searchPlaceholder')}
            aria-label={t('clients.searchPlaceholder')}
            className="h-9 w-full rounded-lg bg-muted/60 pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
        <ul role="listbox" className="max-h-60 overflow-y-auto">
          {options.map((client) => (
            <li key={client.id} role="option" aria-selected={client.id === value?.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({ id: client.id, fullName: client.fullName, phone: client.phone });
                  setOpen(false);
                  setSearch('');
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{client.fullName}</span>
                  <span className="tabular block text-xs text-muted-foreground">
                    {formatPhone(client.phone)}
                  </span>
                </span>
                {client.id === value?.id && (
                  <Check className="size-4 text-gold-dark dark:text-gold" />
                )}
              </button>
            </li>
          ))}
          {query.isSuccess && options.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">
              {t('events.form.clientNotFound')}
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
