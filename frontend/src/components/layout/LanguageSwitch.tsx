import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { LANGUAGES, type Language, useLocaleStore } from '@/stores/locale.store';

interface LanguageSwitchProps {
  /** Login sahifasidagi to'q fon uchun. */
  onDark?: boolean;
}

export function LanguageSwitch({ onDark = false }: LanguageSwitchProps) {
  const { t } = useTranslation();
  const language = useLocaleStore((state) => state.language);
  const setLanguage = useLocaleStore((state) => state.setLanguage);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('language.label')}
          className={cn(
            'h-9 gap-1.5 px-2.5 font-bold tracking-wide uppercase',
            onDark && 'text-white/75 hover:bg-white/10 hover:text-white',
          )}
        >
          <Globe />
          {language}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(value) => setLanguage(value as Language)}
        >
          {LANGUAGES.map((code) => (
            <DropdownMenuRadioItem key={code} value={code}>
              {t(`language.${code}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
