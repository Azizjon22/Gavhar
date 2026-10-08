import axios from 'axios';
import { http } from '@/lib/api-client';
import type { GalleryAlbum } from '../types/gallery.types';

type Progress = (fraction: number) => void;

interface AlbumPayload {
  title: string;
  description: string | null;
  /** Yuborilmasa — bog'lanish o'zgarmaydi. */
  menuPackageId?: string | null;
}

export const galleryApi = {
  albums: () => http.get<GalleryAlbum[]>('/gallery/albums'),
  createAlbum: (body: AlbumPayload) => http.post<GalleryAlbum>('/gallery/albums', body),
  updateAlbum: (id: string, body: AlbumPayload) =>
    http.patch<GalleryAlbum>(`/gallery/albums/${id}`, body),
  removeAlbum: (id: string) => http.delete(`/gallery/albums/${id}`),
  removeItem: (albumId: string, itemId: string) =>
    http.delete<GalleryAlbum>(`/gallery/albums/${albumId}/items/${itemId}`),
  reprocessVideo: (albumId: string, itemId: string) =>
    http.post<GalleryAlbum>(`/gallery/albums/${albumId}/items/${itemId}/reprocess`),

  uploadImage: (albumId: string, file: File, onProgress: Progress) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<GalleryAlbum>(`/gallery/albums/${albumId}/images`, form, {
      timeout: 0,
      onUploadProgress: (event) => onProgress(event.total ? event.loaded / event.total : 0),
    });
  },

  /**
   * Video API serveri orqali o'tmaydi: avval bir martalik havola olinadi, fayl
   * to'g'ridan-to'g'ri saqlash joyiga yuklanadi, so'ng server uni tekshirib qo'shadi.
   */
  uploadVideo: async (albumId: string, file: File, onProgress: Progress) => {
    const { key, uploadUrl } = await http.post<{ key: string; uploadUrl: string }>(
      `/gallery/albums/${albumId}/videos/init`,
      { contentType: file.type, size: file.size },
    );
    // Alohida, interceptorsiz so'rov: saqlash joyiga bizning token yuborilmasligi kerak.
    await axios.put(uploadUrl, file, {
      headers: { 'Content-Type': file.type },
      onUploadProgress: (event) => onProgress(event.total ? event.loaded / event.total : 0),
    });
    return http.post<GalleryAlbum>(
      `/gallery/albums/${albumId}/videos/complete`,
      { key },
      { timeout: 180_000 },
    );
  },
};

export const galleryKeys = {
  all: ['gallery'] as const,
  albums: ['gallery', 'albums'] as const,
};
