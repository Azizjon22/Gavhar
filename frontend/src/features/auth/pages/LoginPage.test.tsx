import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api-error';
import { useAuthStore } from '@/stores/auth.store';
import { authApi } from '../api/auth.api';
import type { AuthSession } from '../types/auth.types';
import { LoginPage } from './LoginPage';

vi.mock('../api/auth.api', () => ({
  authApi: { login: vi.fn(), verifyTwoFactor: vi.fn() },
}));

const login = vi.mocked(authApi.login);
const verifyTwoFactor = vi.mocked(authApi.verifyTwoFactor);

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

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LoginPage />
      </TooltipProvider>
    </QueryClientProvider>,
  );
};

const fillCredentials = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('Email'), 'admin@gavhar.uz');
  await user.type(screen.getByLabelText('Parol'), 'Togri!Parol2026');
  await user.click(screen.getByRole('button', { name: 'Kirish' }));
};

describe('LoginPage', () => {
  beforeEach(() => {
    login.mockReset();
    verifyTwoFactor.mockReset();
    useAuthStore.getState().clear();
  });

  it("bo'sh forma yuborilmaydi va maydon xatolari ko'rsatiladi", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Kirish' }));

    expect(await screen.findAllByText('Bu maydonni to‘ldiring')).toHaveLength(2);
    expect(login).not.toHaveBeenCalled();
  });

  it("noto'g'ri email formatini ushlaydi", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Email'), 'email-emas');
    await user.type(screen.getByLabelText('Parol'), 'x');
    await user.click(screen.getByRole('button', { name: 'Kirish' }));

    expect(await screen.findByText('Email manzilni to‘g‘ri kiriting')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("to'g'ri ma'lumot bilan sessiya ochiladi", async () => {
    login.mockResolvedValue({ requiresTwoFactor: false, ...session });
    const user = userEvent.setup();
    renderPage();

    await fillCredentials(user);

    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(login.mock.calls[0]?.[0]).toEqual({
      email: 'admin@gavhar.uz',
      password: 'Togri!Parol2026',
    });
    expect(useAuthStore.getState().accessToken).toBe('access-1');
  });

  it("server xatosi foydalanuvchi tilida ko'rsatiladi", async () => {
    login.mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'x'));
    const user = userEvent.setup();
    renderPage();

    await fillCredentials(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Email yoki parol noto‘g‘ri.');
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it("hisob bloklanganda qolgan vaqt ko'rsatiladi va tugma o'chadi", async () => {
    login.mockRejectedValue(new ApiError(429, 'ACCOUNT_LOCKED', 'x', { retryAfterSeconds: 60 }));
    const user = userEvent.setup();
    renderPage();

    await fillCredentials(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/1 daqiqa dan keyin/);
    expect(screen.getByRole('button', { name: 'Kirish' })).toBeDisabled();
  });

  it('2FA yoqilgan hisobda kod bosqichi ochiladi va 6 raqam kiritilishi bilan yuboriladi', async () => {
    login.mockResolvedValue({ requiresTwoFactor: true, challengeToken: 'challenge-1' });
    verifyTwoFactor.mockResolvedValue(session);
    const user = userEvent.setup();
    renderPage();

    await fillCredentials(user);

    const codeInput = await screen.findByLabelText('Tasdiqlash kodi');
    expect(useAuthStore.getState().status).toBe('unauthenticated');

    await user.type(codeInput, '123456');

    await waitFor(() =>
      expect(verifyTwoFactor.mock.calls[0]?.[0]).toEqual({
        challengeToken: 'challenge-1',
        code: '123456',
      }),
    );
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
  });

  it("2FA kodi noto'g'ri bo'lsa xato ko'rsatiladi va sessiya ochilmaydi", async () => {
    login.mockResolvedValue({ requiresTwoFactor: true, challengeToken: 'challenge-1' });
    verifyTwoFactor.mockRejectedValue(new ApiError(401, 'INVALID_2FA_CODE', 'x'));
    const user = userEvent.setup();
    renderPage();

    await fillCredentials(user);
    await user.type(await screen.findByLabelText('Tasdiqlash kodi'), '000000');

    expect(await screen.findByRole('alert')).toHaveTextContent(/noto‘g‘ri yoki allaqachon/);
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });
});
