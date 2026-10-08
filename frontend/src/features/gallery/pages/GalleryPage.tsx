import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ellipsis,
  FolderPlus,
  Pencil,
  Presentation,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Lightbox } from '@/components/shared/Lightbox';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { menuApi, menuKeys } from '@/features/menu/api/menu.api';
import { usePermissions } from '@/hooks/use-permissions';
import { errorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';
import { galleryApi, galleryKeys } from '../api/gallery.api';
import { MediaTile } from '../components/MediaTile';
import {
  type GalleryAlbum,
  type GalleryItem,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_TYPES,
} from '../types/gallery.types';

interface UploadTask {
  id: string;
  name: string;
  progress: number;
}

const ALL_PACKAGES = 'all';

type DialogState =
  | { type: 'album'; album?: GalleryAlbum }
  | { type: 'deleteAlbum'; album: GalleryAlbum }
  | { type: 'deleteItem'; item: GalleryItem }
  | null;

export function GalleryPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canUpload = can('media:upload');
  const canDelete = can('media:delete');
  const canLinkPackage = can('menu:read');
  const fileInput = useRef<HTMLInputElement>(null);

  const [albumId, setAlbumId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [packageId, setPackageId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const query = useQuery({
    queryKey: galleryKeys.albums,
    queryFn: galleryApi.albums,
    // Video fonda qayta ishlanayotgan bo'lsa, tugaganini bilish uchun so'rab turiladi.
    refetchInterval: ({ state }) =>
      state.data?.some((item) =>
        item.items.some((media) => media.processingStatus === 'PROCESSING'),
      )
        ? 5_000
        : false,
  });
  const albums = query.data;
  const packagesQuery = useQuery({
    queryKey: menuKeys.packages,
    queryFn: menuApi.packages,
    enabled: canLinkPackage,
  });
  const packages = packagesQuery.data ?? [];
  const packageName = (id: string | null) => packages.find((pkg) => pkg.id === id)?.name;
  const album = albums?.find((item) => item.id === albumId) ?? albums?.[0];

  const setAlbums = (updated: GalleryAlbum) =>
    queryClient.setQueryData<GalleryAlbum[]>(galleryKeys.albums, (current) =>
      current?.map((item) => (item.id === updated.id ? updated : item)),
    );
  const refresh = () => queryClient.invalidateQueries({ queryKey: galleryKeys.all });
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const editingAlbum = dialog?.type === 'album' ? dialog.album : undefined;
  useEffect(() => {
    if (dialog?.type !== 'album') return;
    setTitle(dialog.album?.title ?? '');
    setDescription(dialog.album?.description ?? '');
    setPackageId(dialog.album?.menuPackageId ?? null);
  }, [dialog]);

  const albumMutation = useMutation({
    mutationFn: () => {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        // Paketlarni ko'ra olmaydigan xodim bog'lanishni o'zgartira olmaydi.
        ...(canLinkPackage && { menuPackageId: packageId }),
      };
      return editingAlbum
        ? galleryApi.updateAlbum(editingAlbum.id, body)
        : galleryApi.createAlbum(body);
    },
    onSuccess: async (saved) => {
      await refresh();
      setAlbumId(saved.id);
      toast.success(t('gallery.toast.albumSaved'));
      setDialog(null);
    },
    onError,
  });
  const deleteAlbumMutation = useMutation({
    mutationFn: (target: GalleryAlbum) => galleryApi.removeAlbum(target.id),
    onSuccess: async () => {
      await refresh();
      setAlbumId(null);
      toast.success(t('gallery.toast.albumDeleted'));
      setDialog(null);
    },
    onError,
  });
  const deleteItemMutation = useMutation({
    mutationFn: (item: GalleryItem) => galleryApi.removeItem(album?.id ?? '', item.id),
    onSuccess: (updated) => {
      setAlbums(updated);
      toast.success(t('gallery.toast.itemDeleted'));
      setDialog(null);
    },
    onError,
  });

  const reprocessMutation = useMutation({
    mutationFn: (item: GalleryItem) => galleryApi.reprocessVideo(album?.id ?? '', item.id),
    onSuccess: (updated) => {
      setAlbums(updated);
      toast.success(t('gallery.toast.reprocess'));
    },
    onError,
  });

  const handleFiles = async (fileList: FileList | null) => {
    const target = album;
    const files = Array.from(fileList ?? []);
    if (fileInput.current) fileInput.current.value = '';
    if (!target) return;

    const accepted = files.filter((file) => {
      const isImage = IMAGE_TYPES.includes(file.type);
      const isVideo = VIDEO_TYPES.includes(file.type);
      if (!isImage && !isVideo) {
        toast.error(t('gallery.errors.type', { name: file.name }));
        return false;
      }
      if (file.size > (isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) {
        toast.error(
          t(isImage ? 'gallery.errors.imageSize' : 'gallery.errors.videoSize', { name: file.name }),
        );
        return false;
      }
      return true;
    });

    const tasks = accepted.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      progress: 0,
    }));
    setUploads((current) => [...current, ...tasks]);

    // Ketma-ket: tartib saqlanadi va tarmoq bir vaqtda bitta fayl bilan band bo'ladi.
    for (const [index, file] of accepted.entries()) {
      const taskId = tasks[index]?.id;
      const onProgress = (progress: number) =>
        setUploads((current) =>
          current.map((task) => (task.id === taskId ? { ...task, progress } : task)),
        );
      try {
        const upload = VIDEO_TYPES.includes(file.type)
          ? galleryApi.uploadVideo
          : galleryApi.uploadImage;
        setAlbums(await upload(target.id, file, onProgress));
      } catch (error) {
        toast.error(`${file.name}: ${errorMessage(error)}`);
      } finally {
        setUploads((current) => current.filter((task) => task.id !== taskId));
      }
    }
  };

  const deletingItem = dialog?.type === 'deleteItem' ? dialog.item : null;
  const deletingAlbum = dialog?.type === 'deleteAlbum' ? dialog.album : null;
  const uploading = uploads.length > 0;

  return (
    <>
      <PageHeader
        title={t('gallery.title')}
        description={t('gallery.description')}
        actions={
          canUpload && (
            <>
              <Button variant="outline" onClick={() => setDialog({ type: 'album' })}>
                <FolderPlus />
                {t('gallery.newAlbum')}
              </Button>
              {album && (
                <Button loading={uploading} onClick={() => fileInput.current?.click()}>
                  <Upload />
                  {t('gallery.upload')}
                </Button>
              )}
            </>
          )
        }
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(',')}
        onChange={(event) => void handleFiles(event.target.files)}
      />

      {query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : !albums ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : !album ? (
        <Card>
          <EmptyState
            title={t('gallery.empty.albumsTitle')}
            description={t('gallery.empty.albumsText')}
          />
        </Card>
      ) : (
        <>
          <div
            role="tablist"
            aria-label={t('gallery.albums')}
            className="mb-5 flex gap-2 overflow-x-auto pb-1"
          >
            {albums.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === album.id}
                onClick={() => setAlbumId(item.id)}
                className={cn(
                  'shrink-0 cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  item.id === album.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-accent',
                )}
              >
                {item.title}
                <span className="tabular ml-2 opacity-70">{item.items.length}</span>
              </button>
            ))}
          </div>

          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-display text-2xl font-semibold tracking-tight">
                  {album.title}
                </h2>
                {album.description && (
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {album.description}
                  </p>
                )}
                {canLinkPackage && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Presentation className="size-3.5" />
                    {packageName(album.menuPackageId)
                      ? t('gallery.shownIn', { name: packageName(album.menuPackageId) })
                      : t('gallery.shownInAll')}
                  </p>
                )}
              </div>
              {(canUpload || canDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={t('gallery.albumActions')}>
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canUpload && (
                      <DropdownMenuItem onSelect={() => setDialog({ type: 'album', album })}>
                        <Pencil />
                        {t('common.edit')}
                      </DropdownMenuItem>
                    )}
                    {canDelete && (
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ type: 'deleteAlbum', album })}
                      >
                        <Trash2 />
                        {t('gallery.deleteAlbum')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {uploading && (
              <ul className="mb-5 grid gap-2" aria-label={t('gallery.uploading')}>
                {uploads.map((task) => (
                  <li key={task.id} className="rounded-xl border bg-muted/40 p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="truncate font-medium">{task.name}</span>
                      <span className="tabular text-muted-foreground">
                        {task.progress >= 1
                          ? t('gallery.processing')
                          : `${Math.round(task.progress * 100)}%`}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'bg-gold-gradient h-full rounded-full transition-[width]',
                          task.progress >= 1 && 'animate-pulse',
                        )}
                        style={{ width: `${Math.max(3, task.progress * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {album.items.length === 0 && !uploading ? (
              <EmptyState
                title={t('gallery.empty.itemsTitle')}
                description={t('gallery.empty.itemsText')}
                action={
                  canUpload && (
                    <Button onClick={() => fileInput.current?.click()}>
                      <Upload />
                      {t('gallery.upload')}
                    </Button>
                  )
                }
              />
            ) : (
              <div className="columns-2 gap-3 md:columns-3 xl:columns-4 [&>*]:mb-3 [&>*]:break-inside-avoid">
                {album.items.map((item, index) => (
                  <MediaTile
                    key={item.id}
                    item={item}
                    label={t('gallery.openItem', { number: index + 1 })}
                    onOpen={() => setLightbox(index)}
                    showStatus
                    actions={
                      (canDelete || (canUpload && item.processingStatus === 'FAILED')) && (
                        <>
                          {canUpload && item.processingStatus === 'FAILED' && (
                            <button
                              type="button"
                              aria-label={t('gallery.video.retry')}
                              title={t('gallery.video.retry')}
                              disabled={reprocessMutation.isPending}
                              onClick={() => reprocessMutation.mutate(item)}
                              className="flex size-8 cursor-pointer items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur transition-colors outline-none hover:bg-emerald-brand focus-visible:ring-[3px] focus-visible:ring-gold/60 disabled:opacity-60"
                            >
                              <RefreshCw className="size-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              aria-label={t('gallery.deleteItem')}
                              onClick={() => setDialog({ type: 'deleteItem', item })}
                              className="flex size-8 cursor-pointer items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur transition-colors outline-none hover:bg-destructive focus-visible:ring-[3px] focus-visible:ring-gold/60"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </>
                      )
                    }
                  />
                ))}
              </div>
            )}
          </Card>

          <Lightbox
            items={album.items}
            index={lightbox}
            onIndexChange={setLightbox}
            title={album.title}
          />
        </>
      )}

      <Dialog
        open={dialog?.type === 'album'}
        onOpenChange={(open) => !open && !albumMutation.isPending && setDialog(null)}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {t(editingAlbum ? 'gallery.albumForm.editTitle' : 'gallery.albumForm.createTitle')}
            </DialogTitle>
            <DialogDescription>{t('gallery.albumForm.description')}</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim().length >= 2) albumMutation.mutate();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="album-title">{t('gallery.albumForm.title')}</Label>
              <Input
                id="album-title"
                value={title}
                maxLength={80}
                placeholder={t('gallery.albumForm.titlePlaceholder')}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="album-description">
                {t('gallery.albumForm.descriptionLabel')}{' '}
                <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
              </Label>
              <Input
                id="album-description"
                value={description}
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            {canLinkPackage && (
              <div className="grid gap-2">
                <Label htmlFor="album-package">{t('gallery.albumForm.package')}</Label>
                <Select
                  value={packageId ?? ALL_PACKAGES}
                  onValueChange={(value) => setPackageId(value === ALL_PACKAGES ? null : value)}
                >
                  <SelectTrigger id="album-package">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_PACKAGES}>
                      {t('gallery.albumForm.allPackages')}
                    </SelectItem>
                    {packages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('gallery.albumForm.packageHint')}
                </p>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialog(null)}
                disabled={albumMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                loading={albumMutation.isPending}
                disabled={title.trim().length < 2}
              >
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deletingAlbum !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('gallery.confirm.albumTitle')}
        description={t('gallery.confirm.albumText', {
          name: deletingAlbum?.title ?? '',
          count: deletingAlbum?.items.length ?? 0,
        })}
        confirmLabel={t('common.delete')}
        variant="destructive"
        loading={deleteAlbumMutation.isPending}
        onConfirm={() => deletingAlbum && deleteAlbumMutation.mutate(deletingAlbum)}
      />
      <ConfirmDialog
        open={deletingItem !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('gallery.confirm.itemTitle')}
        description={t('gallery.confirm.itemText')}
        confirmLabel={t('common.delete')}
        variant="destructive"
        loading={deleteItemMutation.isPending}
        onConfirm={() => deletingItem && deleteItemMutation.mutate(deletingItem)}
      />
    </>
  );
}
