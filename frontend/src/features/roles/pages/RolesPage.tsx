import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { errorMessage } from '@/lib/error-message';
import { roleKeys, rolesApi } from '../api/roles.api';
import { RoleFormDialog } from '../components/RoleFormDialog';
import { type Role, SUPER_ADMIN_KEY } from '../types/role.types';

type DialogState = { type: 'form'; role?: Role } | { type: 'delete'; role: Role } | null;

export function RolesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogState>(null);

  const rolesQuery = useQuery({ queryKey: roleKeys.list, queryFn: rolesApi.list });

  const deleteMutation = useMutation({
    mutationFn: (role: Role) => rolesApi.remove(role.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: roleKeys.all });
      toast.success(t('roles.toast.deleted'));
      setDialog(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const deleting = dialog?.type === 'delete' ? dialog.role : null;

  return (
    <>
      <PageHeader
        title={t('roles.title')}
        description={t('roles.description')}
        actions={
          <Button onClick={() => setDialog({ type: 'form' })}>
            <Plus />
            {t('roles.new')}
          </Button>
        }
      />

      {rolesQuery.isError ? (
        <Card>
          <ErrorState error={rolesQuery.error} onRetry={() => void rolesQuery.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {rolesQuery.data
            ? rolesQuery.data.map((role) => (
                <RoleCard
                  key={role.id}
                  role={role}
                  onEdit={() => setDialog({ type: 'form', role })}
                  onDelete={() => setDialog({ type: 'delete', role })}
                />
              ))
            : [0, 1, 2].map((index) => <Skeleton key={index} className="h-52 rounded-2xl" />)}
        </div>
      )}

      <RoleFormDialog
        open={dialog?.type === 'form'}
        onOpenChange={(open) => !open && setDialog(null)}
        role={dialog?.type === 'form' ? dialog.role : undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('roles.confirm.deleteTitle')}
        description={t('roles.confirm.deleteText', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
      />
    </>
  );
}

interface RoleCardProps {
  role: Role;
  onEdit: () => void;
  onDelete: () => void;
}

function RoleCard({ role, onEdit, onDelete }: RoleCardProps) {
  const { t } = useTranslation();
  const isSuperAdmin = role.key === SUPER_ADMIN_KEY;
  const inUse = role.usersCount > 0;

  return (
    <Card className="flex flex-col p-6 transition-shadow hover:shadow-lifted">
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 truncate font-display text-xl font-semibold tracking-tight">
          {role.name}
        </h2>
        <Badge variant={isSuperAdmin ? 'gold' : role.isSystem ? 'default' : 'secondary'}>
          {t(role.isSystem ? 'roles.system' : 'roles.custom')}
        </Badge>
      </div>

      <p className="mt-2 line-clamp-2 min-h-[46px] text-sm leading-relaxed text-muted-foreground">
        {role.description ?? t('roles.noDescription')}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/60 p-3">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Users className="size-3.5" />
            {t('roles.users')}
          </dt>
          <dd className="tabular mt-1 text-xl font-bold">{role.usersCount}</dd>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <KeyRound className="size-3.5" />
            {t('roles.permissions')}
          </dt>
          <dd className="tabular mt-1 text-xl font-bold">
            {isSuperAdmin ? t('roles.allPermissions') : role.permissions.length}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex items-center gap-2 border-t pt-4">
        {isSuperAdmin ? (
          <p className="flex items-center gap-2 text-xs leading-relaxed text-muted-foreground">
            <Lock className="size-3.5 shrink-0" />
            {t('roles.superAdminLocked')}
          </p>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil />
              {t('common.edit')}
            </Button>
            {!role.isSystem && (
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* O'chirib qo'yilgan tugma tooltip ko'rsatmaydi — shuning uchun o'ram. */}
                  <span className="ml-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={inUse}
                      onClick={onDelete}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 />
                      {t('common.delete')}
                    </Button>
                  </span>
                </TooltipTrigger>
                {inUse && <TooltipContent>{t('roles.inUseHint')}</TooltipContent>}
              </Tooltip>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
