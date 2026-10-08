import { useMutation } from '@tanstack/react-query';
import { ImagePlus, LoaderCircle, Star, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { errorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';
import { hallsApi } from '../api/halls.api';
import {
  ACCEPTED_IMAGE_TYPES,
  type Hall,
  type HallImage,
  MAX_HALL_IMAGES,
  MAX_IMAGE_BYTES,
} from '../types/hall.types';

interface HallImageManagerProps {
  hallId: string;
  images: HallImage[];
  /** Har bir o'zgarishdan keyin serverdan qaytgan yangi holat. */
  onChange: (hall: Hall) => void;
}

const tileButton =
  'flex size-8 cursor-pointer items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur transition-colors outline-none hover:bg-black/75 focus-visible:ring-[3px] focus-visible:ring-gold/60 disabled:opacity-50';

/** Zal rasmlari: yuklash, o'chirish va muqovani tanlash. Birinchi rasm — muqova. */
export function HallImageManager({ hallId, images, onChange }: HallImageManagerProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  const onError = (error: unknown) => toast.error(errorMessage(error));

  const removeMutation = useMutation({
    mutationFn: (imageId: string) => hallsApi.removeImage(hallId, imageId),
    onSuccess: onChange,
    onError,
  });

  const coverMutation = useMutation({
    mutationFn: (imageId: string) =>
      hallsApi.reorderImages(hallId, [
        imageId,
        ...images.filter((image) => image.id !== imageId).map((image) => image.id),
      ]),
    onSuccess: onChange,
    onError,
  });

  const busy = uploading > 0 || removeMutation.isPending || coverMutation.isPending;
  const slotsLeft = MAX_HALL_IMAGES - images.length - uploading;

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (inputRef.current) inputRef.current.value = '';

    const valid = files.filter((file) => {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        toast.error(t('halls.images.wrongType', { name: file.name }));
        return false;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(t('halls.images.tooLarge', { name: file.name }));
        return false;
      }
      return true;
    });
    if (valid.length > slotsLeft) {
      toast.error(t('halls.images.limit', { limit: MAX_HALL_IMAGES }));
    }

    const queue = valid.slice(0, Math.max(0, slotsLeft));
    setUploading(queue.length);
    // Ketma-ket: tartib saqlanadi va server bir vaqtda bitta rasmni qayta ishlaydi.
    for (const file of queue) {
      try {
        onChange(await hallsApi.uploadImage(hallId, file));
      } catch (error) {
        onError(error);
      } finally {
        setUploading((count) => count - 1);
      }
    }
  };

  return (
    <div className="grid gap-3">
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {images.map((image, index) => (
          <li
            key={image.id}
            className="group relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted"
          >
            <img
              src={image.thumbUrl}
              alt={t('halls.images.alt', { number: index + 1 })}
              loading="lazy"
              className="size-full object-cover"
            />
            {index === 0 && (
              <Badge
                variant="gold"
                className="absolute bottom-1.5 left-1.5 bg-card/90 backdrop-blur"
              >
                <Star />
                {t('halls.images.cover')}
              </Badge>
            )}
            <div className="absolute top-1.5 right-1.5 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              {index > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => coverMutation.mutate(image.id)}
                  aria-label={t('halls.images.makeCover')}
                  title={t('halls.images.makeCover')}
                  className={tileButton}
                >
                  <Star className="size-4" />
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => removeMutation.mutate(image.id)}
                aria-label={t('halls.images.remove')}
                title={t('halls.images.remove')}
                className={cn(tileButton, 'hover:bg-destructive')}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}

        {Array.from({ length: uploading }, (_, index) => (
          <li
            key={`uploading-${index}`}
            role="status"
            aria-label={t('halls.images.uploading')}
            className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed bg-muted/50"
          >
            <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
          </li>
        ))}

        {slotsLeft > 0 && (
          <li>
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-input text-xs font-medium text-muted-foreground transition-colors outline-none hover:border-gold hover:bg-gold/5 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus className="size-6" />
              {t('halls.images.add')}
            </button>
          </li>
        )}
      </ul>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        multiple
        hidden
        onChange={(event) => void handleFiles(event.target.files)}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('halls.images.hint', { limit: MAX_HALL_IMAGES })}
      </p>
    </div>
  );
}
