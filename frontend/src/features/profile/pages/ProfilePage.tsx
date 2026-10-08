import { CircleUser, MonitorSmartphone, ShieldCheck, Palette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isSuperAdmin, useAuthStore } from '@/stores/auth.store';
import { AccountCard } from '../components/AccountCard';
import { BrandCard } from '@/features/settings/components/BrandCard';
import { PasswordCard } from '../components/PasswordCard';
import { SessionsCard } from '../components/SessionsCard';
import { TwoFactorCard } from '../components/TwoFactorCard';

const TABS = [
  { value: 'account', icon: CircleUser },
  { value: 'security', icon: ShieldCheck },
  { value: 'sessions', icon: MonitorSmartphone },
  // Faqat SUPER_ADMIN ko'radi.
  { value: 'brand', icon: Palette },
] as const;

type TabValue = (typeof TABS)[number]['value'];

export function ProfilePage() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  if (!user) return null;

  // Tanlangan bo'lim manzilda saqlanadi — havolani ulashish va "orqaga" ishlaydi.
  const requested = searchParams.get('tab');
  const tabs = TABS.filter((item) => item.value !== 'brand' || isSuperAdmin(user));
  const tab: TabValue = tabs.find((item) => item.value === requested)?.value ?? 'account';

  return (
    <>
      <PageHeader title={t('profile.title')} description={t('profile.description')} />

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
      >
        <TabsList>
          {tabs.map(({ value, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon />
              {t(`profile.tabs.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="account">
          <AccountCard user={user} />
        </TabsContent>
        <TabsContent value="security">
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <PasswordCard />
            <TwoFactorCard user={user} />
          </div>
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsCard />
        </TabsContent>
        {isSuperAdmin(user) && (
          <TabsContent value="brand">
            <BrandCard />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
