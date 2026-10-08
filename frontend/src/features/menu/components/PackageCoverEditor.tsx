import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, ImageUp, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-message';
import { menuApi, menuKeys } from '../api/menu.api';
import type { MenuPackage } from '../types/menu.types';

interface PackageCoverEditorProps {
  pkg: MenuPackage;
  canEdit: boolean;
}

/**
 * Paket muqovasi: mijozga taqdimotda paket kartasi va sahifasining foni bo'ladigan rasm.
 * Ko'rish huquqi borlarga rasm ko'rinadi, o'zgartirish — faqat `canEdit` bo'lsa.
 */
export function PackageCoverEditor({ pkg, canEdit }: PackageCoverEditorProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: (file: File | null) =>
      file ? menuApi.uploadCover(pkg.id, file) : menuApi.removeCover(pkg.id),
    onSuccess: (updated, file) => {
      queryClient.setQueryData<MenuPackage[]>(menuKeys.packages, (current) =>
        current?.map((item) => (item.id === updated.id ? updated : item)),
      );
      toast.success(t(file ? 'menu.cover.saved' : 'menu.cover.removed'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!pkg.cover && !canEdit) return null;

  return (
    <div className="relative -mx-6 -mt-6 mb-5 aspect-[16/9] overflow-hidden rounded-t-2xl bg-muted">
      {pkg.cover ? (
        <img
          src={pkg.cover.thumbUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 px-6 text-center">
          <ImagePlus className="size-7 text-muted-foreground/60" strokeWidth={1.5} />
          <p className="text-sm font-medium text-muted-foreground">{t('menu.cover.empty')}</p>
          <p className="text-xs text-muted-foreground/80">{t('menu.cover.hint')}</p>
        </div>
      )}
      {canEdit && (
        <>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp,image/avif"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) mutation.mutate(file);
            }}
          />
          <div className="absolute right-3 bottom-3 flex gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              loading={mutation.isPending}
              onClick={() => fileInput.current?.click()}
              className="shadow-soft"
            >
              <ImageUp />
              {t(pkg.cover ? 'menu.cover.replace' : 'menu.cover.upload')}
            </Button>
            {pkg.cover && (
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label={t('menu.cover.remove')}
                title={t('menu.cover.remove')}
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(null)}
                className="text-destructive shadow-soft"
              >
                <Trash2 />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
