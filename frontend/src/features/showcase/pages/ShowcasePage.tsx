import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronDown, Images, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { ROUTES } from '@/app/router/paths';
import { Lightbox, type LightboxItem } from '@/components/shared/Lightbox';
import { GemMark } from '@/components/shared/Logo';
import { AnimatedGem } from '@/features/auth/components/AnimatedGem';
import { AuthBackdrop } from '@/features/auth/components/AuthBackdrop';
import { hallKeys, hallsApi } from '@/features/halls/api/halls.api';
import { dishIndex, dishKeys, dishesApi } from '@/features/menu/api/dishes.api';
import { menuApi, menuKeys } from '@/features/menu/api/menu.api';
import { useBrand } from '@/features/settings/api/brand.api';
import { usePermissions } from '@/hooks/use-permissions';
import { cn } from '@/lib/utils';
import { GuestStepper } from '../components/GuestStepper';
import { Reveal, SectionHeading } from '../components/Ornaments';
import { PackageShowCard } from '../components/PackageShowCard';
import { ShowcaseHeader, ShowcaseNavLink } from '../components/ShowcaseHeader';
import { cardsPerRow } from '../lib/package';

const EASE = [0.22, 1, 0.36, 1] as const;
const glass = 'rounded-3xl border border-white/12 bg-white/[0.05] backdrop-blur-xl';

interface LightboxState {
  title: string;
  items: LightboxItem[];
  index: number | null;
}

/**
 * Mijozga ko'rsatish uchun to'liq ekranli taqdimot: zallar, menyu paketlari va
 * galereya. Faqat ko'rish — boshqaruv tugmalari yo'q; planshet yoki televizorda
 * ko'rsatishga mo'ljallangan.
 */
export function ShowcasePage() {
  const { t } = useTranslation();
  const brand = useBrand();
  const { can } = usePermissions();
  const [lightbox, setLightbox] = useState<LightboxState>({ title: '', items: [], index: null });

  // Ichki bildirishnomalar (masalan, "Fayl o'chirildi") mijozga ko'rinmasin.
  useEffect(() => {
    toast.dismiss();
  }, []);

  const hallsQuery = useQuery({
    queryKey: hallKeys.list,
    queryFn: hallsApi.list,
    enabled: can('halls:read'),
  });
  const packagesQuery = useQuery({
    queryKey: menuKeys.packages,
    queryFn: menuApi.packages,
    enabled: can('menu:read'),
  });
  const dishesQuery = useQuery({
    queryKey: dishKeys.list,
    queryFn: dishesApi.list,
    enabled: can('menu:read'),
  });
  const dishes = dishIndex(dishesQuery.data);

  const halls = (hallsQuery.data ?? []).filter((hall) => hall.status === 'ACTIVE');
  const packages = (packagesQuery.data ?? []).filter((pkg) => pkg.isActive);
  const perRow = cardsPerRow(packages.length);

  // Paket sahifasidan "Barcha paketlar" bilan qaytilganda (#menu) o'sha bo'lim ochiladi;
  // brend bosilganda esa sahifa boshiga chiqadi.
  const location = useLocation();
  const anchor = location.hash.slice(1);
  const loaded = !hallsQuery.isLoading && !packagesQuery.isLoading;
  useEffect(() => {
    if (!anchor) window.scrollTo({ top: 0 });
    // Hamma bo'lim yuklangach — aks holda tepada paydo bo'lgan bo'lim sahifani surib yuboradi.
    else if (loaded) document.getElementById(anchor)?.scrollIntoView();
  }, [anchor, loaded, location.key]);

  const sections = [
    { id: 'halls', label: t('showcase.nav.halls'), visible: halls.length > 0 },
    { id: 'menu', label: t('showcase.nav.menu'), visible: packages.length > 0 },
  ].filter((section) => section.visible);

  return (
    <AuthBackdrop>
      <ShowcaseHeader home={ROUTES.showcase}>
        {sections.map((section) => (
          <ShowcaseNavLink key={section.id} href={`#${section.id}`}>
            {section.label}
          </ShowcaseNavLink>
        ))}
      </ShowcaseHeader>

      <main className="showcase-root relative">
        {/* ── Kirish ─────────────────────────────────────────────────────── */}
        <section className="flex min-h-dvh flex-col items-center justify-center px-6 pt-28 pb-10 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: EASE }}
          >
            <AnimatedGem className="size-28" />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: EASE, delay: 0.3 }}
            className="text-gold-gradient mt-8 pb-3 font-display text-7xl leading-none font-semibold tracking-tight sm:text-9xl"
          >
            {brand.name}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.7 }}
            className="mt-3 text-xs font-bold tracking-[0.4em] text-gold-light/90 uppercase sm:text-sm"
          >
            {t('showcase.hero.eyebrow')}
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.9 }}
            className="mt-8 max-w-xl font-display text-2xl leading-snug text-white/85 italic sm:text-3xl"
          >
            {t('showcase.hero.tagline')}
          </motion.p>
          {sections[0] && (
            <motion.a
              href={`#${sections[0].id}`}
              aria-label={sections[0].label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, y: [0, 8, 0] }}
              transition={{
                opacity: { delay: 1.6 },
                y: { duration: 2, repeat: Infinity, delay: 1.6 },
              }}
              className="mt-16 flex size-12 items-center justify-center rounded-full border border-white/20 text-white/70 outline-none hover:text-white focus-visible:ring-[3px] focus-visible:ring-gold/50"
            >
              <ChevronDown className="size-5" />
            </motion.a>
          )}
          {sections.length === 0 && loaded && (
            <p className="mt-10 max-w-md text-sm leading-relaxed text-white/55">
              {t('showcase.empty')}
            </p>
          )}
        </section>

        {/* ── Zallar ─────────────────────────────────────────────────────── */}
        {halls.length > 0 && (
          <section
            id="halls"
            className="mx-auto max-w-6xl scroll-mt-28 md:scroll-mt-20 px-5 py-20 sm:px-8"
          >
            <SectionHeading
              eyebrow={t('showcase.halls.eyebrow')}
              title={t('showcase.halls.title')}
            />
            <div className="grid gap-10">
              {halls.map((hall, hallIndex) => {
                const images: LightboxItem[] = hall.images.map((image) => ({
                  id: image.id,
                  kind: 'IMAGE',
                  url: image.url,
                  thumbUrl: image.thumbUrl,
                }));
                const open = (index: number) =>
                  setLightbox({ title: hall.name, items: images, index });
                const cover = hall.images[0];
                return (
                  <Reveal key={hall.id}>
                    <article className={cn(glass, 'grid overflow-hidden lg:grid-cols-2')}>
                      <div
                        className={cn(
                          'relative min-h-64 bg-black/30',
                          hallIndex % 2 === 1 && 'lg:order-2',
                        )}
                      >
                        {cover ? (
                          <button
                            type="button"
                            onClick={() => open(0)}
                            aria-label={t('showcase.halls.openPhotos', { name: hall.name })}
                            className="group block size-full cursor-zoom-in overflow-hidden outline-none focus-visible:ring-[3px] focus-visible:ring-gold/70 focus-visible:ring-inset"
                          >
                            <img
                              src={cover.url}
                              alt={hall.name}
                              loading="lazy"
                              className="size-full object-cover transition-transform duration-[1200ms] group-hover:scale-105"
                            />
                          </button>
                        ) : (
                          <div className="flex size-full min-h-64 items-center justify-center">
                            <GemMark className="size-24 opacity-30" />
                          </div>
                        )}
                        {hall.images.length > 1 && (
                          <span className="tabular pointer-events-none absolute right-4 bottom-4 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                            <Images className="size-3.5" />
                            {hall.images.length}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col justify-center p-8 sm:p-12">
                        <h3 className="font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                          {hall.name}
                        </h3>
                        {hall.description && (
                          <p className="mt-4 text-base leading-relaxed text-white/65">
                            {hall.description}
                          </p>
                        )}
                        <p className="mt-8 flex w-fit items-center gap-3 rounded-2xl border border-gold/30 bg-gold/10 px-5 py-3.5">
                          <Users className="size-5 text-gold-light" />
                          <span className="text-sm text-white/60">{t('halls.capacity')}</span>
                          <span className="tabular text-2xl font-bold text-white">
                            {t('halls.guests', { count: hall.capacity })}
                          </span>
                        </p>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Menyu ──────────────────────────────────────────────────────── */}
        {packages.length > 0 && (
          <section
            id="menu"
            className="mx-auto max-w-7xl scroll-mt-28 px-5 py-20 sm:px-8 md:scroll-mt-20"
          >
            <SectionHeading
              eyebrow={t('showcase.menu.eyebrow')}
              title={t('showcase.menu.title')}
              text={t('showcase.menu.text')}
            />
            <Reveal className="mb-10 flex justify-center">
              <GuestStepper />
            </Reveal>
            {/* Oxirgi qatorda kam karta qolsa, markazda turadi. */}
            <div className="flex flex-wrap justify-center gap-6">
              {packages.map((pkg, index) => (
                <Reveal
                  key={pkg.id}
                  delay={(index % perRow) * 0.1}
                  className={cn(
                    'w-full',
                    packages.length > 1 && 'sm:w-[calc((100%-1.5rem)/2)]',
                    perRow === 3 ? 'lg:w-[calc((100%-3rem)/3)]' : 'xl:w-[calc((100%-4.5rem)/4)]',
                  )}
                >
                  <PackageShowCard pkg={pkg} index={index} dishes={dishes} />
                </Reveal>
              ))}
            </div>
          </section>
        )}

        <footer className="flex flex-col items-center gap-3 px-6 pt-10 pb-12 text-center">
          <GemMark className="size-10 opacity-80" />
          <p className="text-gold-gradient font-display text-3xl font-semibold">{brand.name}</p>
          <p className="text-xs tracking-[0.3em] text-white/40 uppercase">
            {t('showcase.hero.eyebrow')}
          </p>
        </footer>
      </main>

      <Lightbox
        items={lightbox.items}
        index={lightbox.index}
        onIndexChange={(index) => setLightbox((current) => ({ ...current, index }))}
        title={lightbox.title}
      />
    </AuthBackdrop>
  );
}
