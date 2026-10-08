import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageOff, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SpinningGem } from '@/components/shared/SpinningGem';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/error-message';
import { type Brand, brandApi, brandKeys, useBrand } from '../api/brand.api';

/** Brend sozlamalari: to'yxona nomi va logotipi. Faqat SUPER_ADMIN o'zgartiradi. */
export function BrandCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const brand = useBrand();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(brand.name);

  useEffect(() => setName(brand.name), [brand.name]);

  const options = (message: string) => ({
    onSuccess: (saved: Brand) => {
      queryClient.setQueryData(brandKeys.current, saved);
      toast.success(message);
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });
  const renameMutation = useMutation({
    mutationFn: () => brandApi.rename(name.trim()),
    ...options(t('brand.toast.saved')),
  });
  const logoMutation = useMutation({
    mutationFn: (file: File | null) => (file ? brandApi.uploadLogo(file) : brandApi.removeLogo()),
    ...options(t('brand.toast.logoSaved')),
  });

  const trimmed = name.trim();
  const canSave = trimmed.length >= 2 && trimmed !== brand.name;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t('brand.title')}</CardTitle>
        <CardDescription>{t('brand.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) renameMutation.mutate();
          }}
        >
          <Label htmlFor="brand-name">{t('brand.name')}</Label>
          <div className="flex gap-2">
            <Input
              id="brand-name"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" loading={renameMutation.isPending} disabled={!canSave}>
              {t('common.save')}
            </Button>
          </div>
        </form>

        <div className="grid gap-2">
          <p className="text-sm font-medium">{t('brand.logo')}</p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="bg-sidebar-gradient flex size-20 items-center justify-center rounded-2xl border border-sidebar-border">
              {brand.logo ? (
                <img src={brand.logo.thumbUrl} alt="" className="size-14 object-contain" />
              ) : (
                <SpinningGem className="size-12" />
              )}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                loading={logoMutation.isPending}
                onClick={() => fileInput.current?.click()}
              >
                <Upload />
                {t(brand.logo ? 'brand.replaceLogo' : 'brand.uploadLogo')}
              </Button>
              {brand.logo && (
                <Button
                  variant="ghost"
                  disabled={logoMutation.isPending}
                  onClick={() => logoMutation.mutate(null)}
                >
                  <ImageOff />
                  {t('brand.removeLogo')}
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('brand.logoHint')}</p>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp,image/avif"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) logoMutation.mutate(file);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
