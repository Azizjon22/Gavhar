import type * as Axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '@/features/auth/types/auth.types';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof Axios>();
  return { ...actual, default: { ...actual.default, create: () => http } };
});

const session: AuthSession = {
  accessToken: 'access-1',
  expiresIn: 900,
  csrfToken: 'csrf-1',
  user: {
    id: 'u1',
    email: 'admin@gavhar.uz',
    fullName: 'Gavhar Admin',
    phone: null,
    role: { id: 'r0', key: 'SUPER_ADMIN', name: 'Super admin' },
    permissions: [],
    mustChangePassword: false,
    twoFactorEnabled: true,
    twoFactorRequired: false,
    mustSetupTwoFactor: false,
  },
};

const loadModules = async () => {
  vi.resetModules();
  const [{ useAuthStore }, authSession] = await Promise.all([
    import('@/stores/auth.store'),
    import('./auth-session'),
  ]);
  return { useAuthStore, ...authSession };
};

describe('auth-session', () => {
  beforeEach(() => {
    http.get.mockReset().mockResolvedValue({ data: { data: { csrfToken: 'csrf-1' } } });
    http.post.mockReset().mockResolvedValue({ data: { data: session } });
  });

  it("refresh: CSRF tokenini olib, sarlavhada yuboradi va sessiyani store'ga yozadi", async () => {
    const { refreshSession, useAuthStore } = await loadModules();

    await refreshSession();

    expect(http.get).toHaveBeenCalledWith('/auth/csrf');
    expect(http.post).toHaveBeenCalledWith('/auth/refresh', undefined, {
      headers: { 'X-CSRF-Token': 'csrf-1' },
    });
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'access-1',
    });
  });

  it("parallel chaqiruvlar bitta so'rovga birlashadi — refresh token ikki marta ishlatilmaydi", async () => {
    const { refreshSession } = await loadModules();

    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result.accessToken === 'access-1')).toBe(true);
  });

  it('tugagan refreshdan keyingi chaqiruv yangi so‘rov yuboradi', async () => {
    const { refreshSession } = await loadModules();

    await refreshSession();
    await refreshSession();

    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it("bootstrap: sessiya bo'lmasa foydalanuvchi 'unauthenticated' bo'ladi, xato tashlanmaydi", async () => {
    http.post.mockRejectedValue(new Error('401'));
    const { bootstrapSession, useAuthStore } = await loadModules();

    await expect(bootstrapSession()).resolves.toBeUndefined();

    expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', accessToken: null });
  });

  it('bootstrap bir marta bajariladi (React StrictMode ikki marta chaqirsa ham)', async () => {
    const { bootstrapSession } = await loadModules();

    await Promise.all([bootstrapSession(), bootstrapSession()]);
    await bootstrapSession();

    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('logout: server javob bermasa ham mahalliy sessiya tozalanadi', async () => {
    const { logoutSession, refreshSession, useAuthStore } = await loadModules();
    await refreshSession();
    http.post.mockRejectedValue(new Error('network'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await logoutSession();

    expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', user: null });
  });
});
