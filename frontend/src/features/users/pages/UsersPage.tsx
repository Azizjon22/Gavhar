import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ellipsis,
  KeyRound,
  Lock,
  LockOpen,
  MonitorSmartphone,
  Pencil,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { type Column, DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Pagination } from '@/components/shared/Pagination';
import { SearchInput } from '@/components/shared/SearchInput';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { roleKeys, rolesApi } from '@/features/roles/api/roles.api';
import { SUPER_ADMIN_KEY } from '@/features/roles/types/role.types';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { errorMessage } from '@/lib/error-message';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';
import { userKeys, usersApi } from '../api/users.api';
import { ResetPasswordDialog } from '../components/ResetPasswordDialog';
import { UserFormDialog } from '../components/UserFormDialog';
import { UserSessionsDialog } from '../components/UserSessionsDialog';
import type { ListUsersParams, User, UserStatus } from '../types/user.types';

const PAGE_SIZE = 10;
const ALL = 'all';

type ConfirmAction = 'block' | 'unblock' | 'delete' | 'resetTwoFactor';

const CONFIRM_ACTIONS: Record<
  ConfirmAction,
  { run: (id: string) => Promise<unknown>; variant: 'default' | 'destructive' }
> = {
  block: { run: usersApi.block, variant: 'destructive' },
  unblock: { run: usersApi.unblock, variant: 'default' },
  delete: { run: usersApi.remove, variant: 'destructive' },
  resetTwoFactor: { run: usersApi.resetTwoFactor, variant: 'destructive' },
};

type DialogState =
  | { type: 'form'; user?: User }
  | { type: 'resetPassword'; user: User }
  | { type: 'sessions'; user: User }
  | { type: 'confirm'; action: ConfirmAction; user: User }
  | null;

export function UsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);

  const [search, setSearch] = useState('');
  const [roleId, setRoleId] = useState(ALL);
  const [status, setStatus] = useState<UserStatus | typeof ALL>(ALL);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<DialogState>(null);
  const debouncedSearch = useDebouncedValue(search.trim());

  const params: ListUsersParams = {
    page,
    limit: PAGE_SIZE,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(roleId !== ALL && { roleId }),
    ...(status !== ALL && { status }),
  };

  const usersQuery = useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => usersApi.list(params),
    placeholderData: keepPreviousData,
  });
  const rolesQuery = useQuery({ queryKey: roleKeys.list, queryFn: rolesApi.list });

  const confirmMutation = useMutation({
    mutationFn: ({ action, user }: { action: ConfirmAction; user: User }) =>
      CONFIRM_ACTIONS[action].run(user.id),
    onSuccess: async (_result, { action }) => {
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
      await queryClient.invalidateQueries({ queryKey: roleKeys.all });
      toast.success(t(`users.toast.${action}`));
      setDialog(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Filtr o'zgarsa, birinchi sahifadan boshlanadi.
  const updateFilter = <T,>(setter: (value: T) => void) => {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  };

  const columns = useMemo<Column<User>[]>(
    () => [
      {
        id: 'user',
        header: t('users.columns.user'),
        cell: (user) => (
          <div className="flex min-w-44 items-center gap-3 sm:min-w-56">
            <Avatar name={user.fullName} />
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-semibold">
                <span className="truncate">{user.fullName}</span>
                {user.id === currentUserId && <Badge variant="outline">{t('users.you')}</Badge>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              {user.mustChangePassword && (
                <p className="mt-0.5 text-xs font-medium text-warning">
                  {t('users.mustChangePassword')}
                </p>
              )}
              {/* Telefonda "Rol" va "Holat" ustunlari yashirin — ular shu yerda ko'rinadi. */}
              <div className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
                <Badge variant={user.role.key === SUPER_ADMIN_KEY ? 'gold' : 'secondary'}>
                  {user.role.name}
                </Badge>
                {user.status === 'BLOCKED' && (
                  <Badge variant="destructive">{t('users.status.BLOCKED')}</Badge>
                )}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'role',
        header: t('users.columns.role'),
        className: 'hidden sm:table-cell',
        cell: (user) => (
          <Badge variant={user.role.key === SUPER_ADMIN_KEY ? 'gold' : 'secondary'}>
            {user.role.name}
          </Badge>
        ),
      },
      {
        id: 'status',
        header: t('users.columns.status'),
        className: 'hidden sm:table-cell',
        cell: (user) => (
          <Badge variant={user.status === 'ACTIVE' ? 'success' : 'destructive'}>
            {t(`users.status.${user.status}`)}
          </Badge>
        ),
      },
      {
        id: 'twoFactor',
        header: t('users.columns.twoFactor'),
        className: 'hidden lg:table-cell',
        cell: (user) =>
          user.twoFactorEnabled ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-success">
              <ShieldCheck className="size-4" />
              {t('users.twoFactor.on')}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ShieldOff className="size-4" />
              {t('users.twoFactor.off')}
            </span>
          ),
      },
      {
        id: 'lastLogin',
        header: t('users.columns.lastLogin'),
        className: 'hidden md:table-cell',
        cell: (user) =>
          user.lastLoginAt ? (
            <span
              className="tabular text-sm whitespace-nowrap"
              title={formatDateTime(user.lastLoginAt)}
            >
              {formatRelative(user.lastLoginAt)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{t('users.neverLoggedIn')}</span>
          ),
      },
      {
        id: 'actions',
        header: <span className="sr-only">{t('common.actions')}</span>,
        className: 'w-12 text-right',
        cell: (user) => (
          <UserRowActions user={user} isSelf={user.id === currentUserId} onSelect={setDialog} />
        ),
      },
    ],
    [t, currentUserId],
  );

  const hasFilters = debouncedSearch !== '' || roleId !== ALL || status !== ALL;
  const confirm = dialog?.type === 'confirm' ? dialog : null;

  return (
    <>
      <PageHeader
        title={t('users.title')}
        description={t('users.description')}
        actions={
          <Button onClick={() => setDialog({ type: 'form' })}>
            <UserPlus />
            {t('users.new')}
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onChange={updateFilter(setSearch)}
            placeholder={t('users.searchPlaceholder')}
            className="lg:max-w-sm lg:flex-1"
          />
          <div className="flex flex-col gap-3 sm:flex-row lg:ml-auto">
            <Select value={roleId} onValueChange={updateFilter(setRoleId)}>
              <SelectTrigger aria-label={t('users.filters.role')} className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('users.filters.allRoles')}</SelectItem>
                {rolesQuery.data?.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={updateFilter((value: string) =>
                setStatus(value as UserStatus | typeof ALL),
              )}
            >
              <SelectTrigger aria-label={t('users.filters.status')} className="sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('users.filters.allStatuses')}</SelectItem>
                <SelectItem value="ACTIVE">{t('users.status.ACTIVE')}</SelectItem>
                <SelectItem value="BLOCKED">{t('users.status.BLOCKED')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {usersQuery.isError ? (
          <ErrorState error={usersQuery.error} onRetry={() => void usersQuery.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={usersQuery.data?.items}
              rowKey={(user) => user.id}
              loading={usersQuery.isLoading}
              skeletonRows={PAGE_SIZE / 2}
              empty={
                <EmptyState
                  title={t(hasFilters ? 'common.noResults.title' : 'users.empty.title')}
                  description={t(hasFilters ? 'common.noResults.text' : 'users.empty.text')}
                />
              }
            />
            <Pagination meta={usersQuery.data?.meta} onPageChange={setPage} />
          </>
        )}
      </Card>

      <UserFormDialog
        open={dialog?.type === 'form'}
        onOpenChange={(open) => !open && setDialog(null)}
        user={dialog?.type === 'form' ? dialog.user : undefined}
      />
      <ResetPasswordDialog
        user={dialog?.type === 'resetPassword' ? dialog.user : null}
        onClose={() => setDialog(null)}
      />
      <UserSessionsDialog
        user={dialog?.type === 'sessions' ? dialog.user : null}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={confirm ? t(`users.confirm.${confirm.action}.title`) : ''}
        description={
          confirm ? t(`users.confirm.${confirm.action}.text`, { name: confirm.user.fullName }) : ''
        }
        confirmLabel={confirm ? t(`users.confirm.${confirm.action}.confirm`) : ''}
        variant={confirm ? CONFIRM_ACTIONS[confirm.action].variant : 'default'}
        loading={confirmMutation.isPending}
        onConfirm={() => confirm && confirmMutation.mutate(confirm)}
      />
    </>
  );
}

interface UserRowActionsProps {
  user: User;
  /** O'z hisobini bloklash, o'chirish yoki tiklash mumkin emas. */
  isSelf: boolean;
  onSelect: (dialog: DialogState) => void;
}

function UserRowActions({ user, isSelf, onSelect }: UserRowActionsProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('users.actions.label', { name: user.fullName })}
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onSelect={() => onSelect({ type: 'form', user })}>
          <Pencil />
          {t('users.actions.edit')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect({ type: 'sessions', user })}>
          <MonitorSmartphone />
          {t('users.actions.sessions')}
        </DropdownMenuItem>
        {!isSelf && (
          <>
            <DropdownMenuItem onSelect={() => onSelect({ type: 'resetPassword', user })}>
              <KeyRound />
              {t('users.actions.resetPassword')}
            </DropdownMenuItem>
            {user.twoFactorEnabled && (
              <DropdownMenuItem
                onSelect={() => onSelect({ type: 'confirm', action: 'resetTwoFactor', user })}
              >
                <ShieldOff />
                {t('users.actions.resetTwoFactor')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {user.status === 'ACTIVE' ? (
              <DropdownMenuItem
                onSelect={() => onSelect({ type: 'confirm', action: 'block', user })}
              >
                <Lock />
                {t('users.actions.block')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onSelect={() => onSelect({ type: 'confirm', action: 'unblock', user })}
              >
                <LockOpen />
                {t('users.actions.unblock')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onSelect({ type: 'confirm', action: 'delete', user })}
            >
              <Trash2 />
              {t('users.actions.delete')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
