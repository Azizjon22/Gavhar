import { Phone } from 'lucide-react';
import { formatPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';

/** Wedding Studio Gavhar, Чиланзар 19-й квартал (2ГИС). */
const PHONES = ['+998954111001'];

/** Taqdimot pastidagi qo'ng'iroq raqamlari. */
export function ShowcaseContacts({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-x-6 gap-y-2', className)}>
      {PHONES.map((phone) => (
        <a
          key={phone}
          href={`tel:${phone}`}
          className="inline-flex items-center gap-2 rounded-full text-base font-medium text-gold-light outline-none hover:text-white focus-visible:ring-[3px] focus-visible:ring-gold/50"
        >
          <Phone className="size-4" />
          <span className="tabular">{formatPhone(phone)}</span>
        </a>
      ))}
    </div>
  );
}
