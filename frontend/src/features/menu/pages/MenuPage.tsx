import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutList, Pencil, Plus, Soup, Trash2, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/use-permissions';
import { errorMessage } from '@/lib/error-message';
import { menuApi, menuKeys } from '../api/menu.api';
import { CategoryManager } from '../components/CategoryManager';
import { DishManager } from '../components/DishManager';
import { PackageCard } from '../components/PackageCard';
import { PackageCoverEditor } from '../components/PackageCoverEditor';
import { PackageFormDialog } from '../components/PackageFormDialog';
import type { MenuPackage } from '../types/menu.types';

type DialogState =
  { type: 'form'; pkg?: MenuPackage } | { type: 'delete'; pkg: MenuPackage } | null;

export function MenuPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [dialog, setDialog] = useState<DialogState>(null);

  const packagesQuery = useQuery({ queryKey: menuKeys.packages, queryFn: menuApi.packages });
  const categoriesQuery = useQuery({ queryKey: menuKeys.categories, queryFn: menuApi.categories });
  const packages = packagesQuery.data;
  const categories = categoriesQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (pkg: MenuPackage) => menuApi.removePackage(pkg.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: menuKeys.all });
      toast.success(t('menu.toast.packageDeleted'));
      setDialog(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const deleting = dialog?.type === 'delete' ? dialog.pkg : null;
  const createButton = can('menu:create') && (
    <Button onClick={() => setDialog({ type: 'form' })}>
      <Plus />
      {t('menu.newPackage')}
    </Button>
  );
  const error = packagesQuery.error ?? categoriesQuery.error;

  return (
    <>
      <PageHeader
        title={t('menu.title')}
        description={t('menu.description')}
        actions={createButton}
      />

      {error ? (
        <Card>
          <ErrorState
            error={error}
            onRetry={() => {
              void packagesQuery.refetch();
              void categoriesQuery.refetch();
            }}
          />
        </Card>
      ) : (
        <Tabs defaultValue="packages">
          <TabsList>
            <TabsTrigger value="packages">
              <UtensilsCrossed />
              {t('menu.tabs.packages')}
            </TabsTrigger>
            <TabsTrigger value="categories">
              <LayoutList />
              {t('menu.tabs.categories')}
            </TabsTrigger>
            <TabsTrigger value="dishes">
              <Soup />
              {t('menu.tabs.dishes')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="packages">
            {!packages ? (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-[520px] rounded-2xl" />
                ))}
              </div>
            ) : packages.length === 0 ? (
              <Card>
                <EmptyState
                  title={t('menu.empty.title')}
                  description={t('menu.empty.text')}
                  action={createButton}
                />
              </Card>
            ) : (
              <div className="grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3">
                {packages.map((pkg) => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    header={<PackageCoverEditor pkg={pkg} canEdit={can('menu:update')} />}
                    footer={
                      (can('menu:update') || can('menu:delete')) && (
                        <>
                          {can('menu:update') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDialog({ type: 'form', pkg })}
                            >
                              <Pencil />
                              {t('common.edit')}
                            </Button>
                          )}
                          {can('menu:delete') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDialog({ type: 'delete', pkg })}
                              className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 />
                              {t('common.delete')}
                            </Button>
                          )}
                        </>
                      )
                    }
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="categories">
            <CategoryManager
              categories={categories}
              canCreate={can('menu:create')}
              canUpdate={can('menu:update')}
              canDelete={can('menu:delete')}
            />
          </TabsContent>

          <TabsContent value="dishes">
            <DishManager canEdit={can('menu:update')} />
          </TabsContent>
        </Tabs>
      )}

      <PackageFormDialog
        open={dialog?.type === 'form'}
        onOpenChange={(open) => !open && setDialog(null)}
        categories={categories}
        pkg={dialog?.type === 'form' ? dialog.pkg : undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('menu.confirm.deleteTitle')}
        description={t('menu.confirm.deleteText', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
      />
    </>
  );
}
