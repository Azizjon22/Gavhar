import { Toaster as Sonner } from 'sonner';
import { useThemeStore } from '@/stores/theme.store';

/** Toast xabarlar — tema va palitraga moslangan. */
export function Toaster() {
  const theme = useThemeStore((state) => state.theme);

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: '!rounded-xl !border !shadow-lifted !font-sans',
          title: '!font-semibold',
        },
      }}
    />
  );
}
