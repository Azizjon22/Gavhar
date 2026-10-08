import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ROUTES } from '@/app/router/paths';
import { Lightbox, type LightboxItem } from '@/components/shared/Lightbox';
import { AnimatedGem } from '@/features/auth/components/AnimatedGem';
import { AuthBackdrop } from '@/features/auth/components/AuthBackdrop';
import { galleryApi, galleryKeys } from '@/features/gallery/api/gallery.api';
import { MediaTile } from '@/features/gallery/components/MediaTile';
import { dishIndex, dishKeys, dishesApi } from '@/features/menu/api/dishes.api';
import { menuApi, menuKeys } from '@/features/menu/api/menu.api';
import { localizedName } from '@/features/menu/types/menu.types';
import { useBrand } from '@/features/settings/api/brand.api';
import { usePermissions } from '@/hooks/use-permissions';
import { formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useLocaleStore } from '@/stores/locale.store';
import {
  CornerFlourish,
  GemDivider,
  PackageCoverArt,
  Reveal,
  SectionHeading,
} from '../components/Ornaments';
import { ShowcaseHeader, ShowcaseNavLink } from '../components/ShowcaseHeader';
import {
  type ShowDish,
  dishCount,
  packageCover,
  packagePhotos,
  sectionDishes,
} from '../lib/package';

const EASE = [0.22, 1, 0.36, 1] as const;
const MENU_LIST = `${ROUTES.showcase}#menu`;
interface LightboxState {
  title: string;
  items: LightboxItem[];
  index: number | null;
}
const CLOSED: LightboxState = { title: '', items: [], index: null };

/** Menyu varag'idagi mayda yozuvlar uchun to'q oltin — och fonda yaxshi o'qiladi. */
const BRONZE = 'text-[#8a6420]';

/**
 * Rasmlar to'ri: beshtalik guruhlar — bitta katta (2×2) va yonida to'rtta kichik.
 * Oxirgi guruh to'liq bo'lmasa, kataklar kengayib, to'rda bo'sh joy qolmaydi.
 */
function tileSpans(count: number): string[] {
  const spans: string[] = [];
  for (let start = 0; start < count; start += 5) {
    const small = Math.min(4, count - start - 1);
    spans.push(small === 0 ? 'col-span-2 row-span-2 md:col-span-4' : 'col-span-2 row-span-2');
    if (small === 4) spans.push('', '', '', '');
    if (small === 3) spans.push('', '', 'col-span-2');
    if (small === 2) spans.push('col-span-2', 'col-span-2');
    if (small === 1) spans.push('col-span-2 row-span-2');
  }
  return spans;
}

/** Menyu varag'idagi bo'lim sarlavhasi: ikki yonida ingichka chiziq. */
function CourseTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#b8862f]/55" />
      <h3 className={cn('text-center text-xs font-bold tracking-[0.32em] uppercase', BRONZE)}>
        {children}
      </h3>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#b8862f]/55" />
    </div>
  );
}

/** Rasmi yo'q taom o'rnidagi belgi: kichik gavhar. */
function DishMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
      <path
        d="M7 4h10l5 6-10 11L2 10zM2 10h20M9.5 4 7.5 10 12 21l4.5-11-2-6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DishRow({
  dish,
  onOpen,
  openLabel,
}: {
  dish: ShowDish;
  onOpen: () => void;
  openLabel: string;
}) {
  const text = (
    <span className="min-w-0">
      <span className="block font-display text-2xl leading-tight font-semibold [overflow-wrap:anywhere]">
        {dish.name}
      </span>
      {dish.description && (
        <span className="mt-1 block text-sm leading-relaxed text-[#1d2b25]/60 italic">
          {dish.description}
        </span>
      )}
    </span>
  );
  const frame =
    'relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-offset-2 ring-offset-[#fbf6ea] sm:size-[4.5rem]';

  if (!dish.photo) {
    return (
      <div className="flex items-center gap-4 p-2">
        <span className={cn(frame, BRONZE, 'bg-[#b8862f]/8 ring-[#b8862f]/30')}>
          <DishMark />
        </span>
        {text}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={openLabel}
      className="group flex w-full cursor-zoom-in items-center gap-4 rounded-2xl p-2 text-left transition-colors outline-none hover:bg-[#1d2b25]/[0.05] focus-visible:ring-[3px] focus-visible:ring-[#b8862f]/60"
    >
      <span className={cn(frame, 'ring-[#b8862f]/45 transition group-hover:ring-[#b8862f]')}>
        <img
          src={dish.photo.thumbUrl}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
      </span>
      {text}
    </button>
  );
}

/**
 * Bitta menyu paketining taqdimot sahifasi: to'liq ekranli muqova va narx,
 * restoran menyusi ko'rinishidagi taomlar varag'i, taomlar rasmlari va shu paketga
 * tegishli galereya (albomlar).
 */
export function ShowcasePackagePage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const brand = useBrand();
  const { can } = usePermissions();
  const language = useLocaleStore((state) => state.language);
  const [lightbox, setLightbox] = useState<LightboxState>(CLOSED);
  const [albumId, setAlbumId] = useState<string | null>(null);
  const allowed = can('menu:read');

  const packagesQuery = useQuery({
    queryKey: menuKeys.packages,
    queryFn: menuApi.packages,
    enabled: allowed,
  });
  const dishesQuery = useQuery({
    queryKey: dishKeys.list,
    queryFn: dishesApi.list,
    enabled: allowed,
  });
  const albumsQuery = useQuery({
    queryKey: galleryKeys.albums,
    queryFn: galleryApi.albums,
    enabled: allowed && can('media:read'),
  });

  // Boshqa paketga o'tilganda sahifa boshidan ochiladi; ichki bildirishnomalar mijozga ko'rinmaydi.
  useEffect(() => {
    toast.dismiss();
    window.scrollTo({ top: 0 });
    setLightbox(CLOSED);
    setAlbumId(null);
  }, [id]);

  const packages = (packagesQuery.data ?? []).filter((item) => item.isActive);
  const pkg = packages.find((item) => item.id === id);

  if (!allowed || packagesQuery.isError || (packagesQuery.data && !pkg)) {
    return <Navigate to={ROUTES.showcase} replace />;
  }
  if (!pkg) {
    return (
      <AuthBackdrop>
        <div className="flex min-h-dvh items-center justify-center">
          <AnimatedGem className="size-24" />
        </div>
      </AuthBackdrop>
    );
  }

  const dishes = dishIndex(dishesQuery.data);
  const photos = packagePhotos(pkg, dishes);
  const spans = tileSpans(photos.length);
  const others = packages.filter((item) => item.id !== pkg.id);
  const named = pkg.sections.filter((section) => section.items.length > 0);
  const unnamed = pkg.sections.filter((section) => section.items.length === 0);
  const openDish = (name: string) => {
    const index = photos.findIndex((photo) => photo.id === name);
    if (index >= 0) setLightbox({ title: pkg.name, items: photos, index });
  };
  // Shu paketga biriktirilgan va umumiy (hech bir paketga biriktirilmagan) albomlar.
  const albums = (albumsQuery.data ?? []).filter(
    (item) =>
      item.items.length > 0 && (item.menuPackageId === null || item.menuPackageId === pkg.id),
  );
  const album = albums.find((item) => item.id === albumId) ?? albums[0];

  return (
    <AuthBackdrop>
      <ShowcaseHeader
        home={ROUTES.showcase}
        back={{ to: MENU_LIST, label: t('showcase.package.all') }}
      >
        <ShowcaseNavLink href="#card">{t('showcase.nav.menu')}</ShowcaseNavLink>
        {album && <ShowcaseNavLink href="#gallery">{t('showcase.nav.gallery')}</ShowcaseNavLink>}
      </ShowcaseHeader>

      <main className="showcase-root relative">
        {/* ── Muqova ─────────────────────────────────────────────────────── */}
        <section className="relative isolate flex min-h-dvh items-end overflow-hidden">
          <PackageCoverArt
            key={pkg.id}
            src={packageCover(pkg, dishes)}
            alt=""
            className="-z-20"
            imageClassName="animate-ken-burns"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#061a14] via-[#061a14]/70 to-[#061a14]/45" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_55%_at_50%_100%,rgba(3,17,13,0.6),transparent)]" />

          <div className="mx-auto w-full max-w-5xl px-5 pt-40 pb-14 text-center sm:px-8 sm:pb-20">
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE }}
              className="text-[11px] font-bold tracking-[0.4em] text-gold-light uppercase sm:text-xs"
            >
              {brand.name} · {t('showcase.package.eyebrow')}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
              className="mt-5 font-display text-[clamp(3rem,min(10vw,13svh),8.5rem)] leading-[0.95] font-semibold tracking-tight text-white [overflow-wrap:anywhere]"
            >
              {pkg.name}
            </motion.h1>
            {pkg.badge && (
              <span className="mt-6 inline-flex rounded-full border border-gold-light/55 bg-gold/15 px-5 py-1.5 text-xs font-bold tracking-[0.3em] text-gold-light uppercase backdrop-blur">
                {pkg.badge}
              </span>
            )}
            <GemDivider className="mt-7 text-gold" />
            <motion.p
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}
              className="mt-6"
            >
              <span className="text-gilded tabular block pb-1 font-display text-[clamp(3.25rem,min(9vw,11svh),7.5rem)] leading-none font-semibold">
                {formatAmount(pkg.pricePerGuest)}
              </span>
              <span className="mt-2 block text-sm font-medium tracking-[0.3em] text-white/70 uppercase">
                {t('showcase.menu.perGuest')}
              </span>
            </motion.p>
            {pkg.description && (
              <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
                {pkg.description}
              </p>
            )}
            <p className="mt-7 flex flex-wrap items-center justify-center gap-2 text-sm text-white/85">
              <span className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 backdrop-blur">
                {t('showcase.menu.dishCount', { count: dishCount(pkg) })}
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 backdrop-blur">
                {t('showcase.package.sections', { count: pkg.sections.length })}
              </span>
            </p>
            <a
              href="#card"
              className="mx-auto mt-10 flex w-fit flex-col items-center gap-1.5 rounded-lg text-xs font-semibold tracking-[0.3em] text-white/60 uppercase outline-none hover:text-white focus-visible:ring-[3px] focus-visible:ring-gold/50"
            >
              {t('showcase.menu.view')}
              <motion.span
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <ChevronDown className="size-5" />
              </motion.span>
            </a>
          </div>
        </section>

        {/* ── Menyu varag'i ──────────────────────────────────────────────── */}
        {pkg.sections.length > 0 && (
          <section id="card" className="scroll-mt-28 px-4 py-16 sm:px-8 sm:py-24 md:scroll-mt-20">
            <Reveal className="mx-auto max-w-4xl">
              <div className="relative rounded-[30px] bg-[linear-gradient(160deg,#fffaf0_0%,#fbf6ea_45%,#f3ead6_100%)] px-5 py-14 text-[#1d2b25] shadow-[0_50px_120px_-50px_rgba(0,0,0,0.9)] ring-1 ring-gold/50 sm:px-14 sm:py-16">
                <div className="pointer-events-none absolute inset-2.5 rounded-[23px] border border-[#b8862f]/30" />
                <CornerFlourish className="top-4 left-4 text-[#b8862f]" />
                <CornerFlourish className="top-4 right-4 rotate-90 text-[#b8862f]" />
                <CornerFlourish className="right-4 bottom-4 rotate-180 text-[#b8862f]" />
                <CornerFlourish className="bottom-4 left-4 -rotate-90 text-[#b8862f]" />

                <div className="relative text-center">
                  <p className={cn('text-xs font-bold tracking-[0.36em] uppercase', BRONZE)}>
                    {pkg.name}
                  </p>
                  <h2 className="mt-3 font-display text-[clamp(2.75rem,7vw,4.5rem)] leading-none font-semibold tracking-tight text-emerald-brand">
                    {t('showcase.package.cardTitle')}
                  </h2>
                  <p className="mt-3 text-sm text-[#1d2b25]/60">
                    {t('showcase.package.cardSubtitle')}
                  </p>
                  <GemDivider className="mt-6 text-[#b8862f]" />
                </div>

                <div className="relative mt-12 grid gap-12">
                  {named.map((section, sectionIndex) => {
                    const list = sectionDishes(section, dishes);
                    const withPhotos = list.some((dish) => dish.photo);
                    return (
                      <Reveal key={section.categoryId} delay={Math.min(sectionIndex, 4) * 0.05}>
                        <CourseTitle>
                          {localizedName(section, language)}
                          {section.kindsCount > 1 && (
                            <span className="font-medium tracking-[0.2em] text-[#1d2b25]/45">
                              {' '}
                              · {t('menu.kinds', { count: section.kindsCount })}
                            </span>
                          )}
                        </CourseTitle>
                        {withPhotos ? (
                          <ul
                            className={cn(
                              'grid gap-x-10 gap-y-4',
                              list.length > 1 ? 'sm:grid-cols-2' : 'mx-auto max-w-sm',
                            )}
                          >
                            {list.map((dish) => (
                              <li key={dish.name}>
                                <DishRow
                                  dish={dish}
                                  onOpen={() => openDish(dish.name)}
                                  openLabel={t('showcase.package.openDish', { name: dish.name })}
                                />
                              </li>
                            ))}
                          </ul>
                        ) : (
                          // Rasmsiz bo'lim — klassik menyu: nomlar markazda, tavsifi ostida.
                          <ul className="mx-auto grid max-w-2xl gap-x-10 gap-y-5 text-center sm:grid-cols-2">
                            {list.map((dish, index) => (
                              <li
                                key={dish.name}
                                className={cn(
                                  list.length % 2 === 1 &&
                                    index === list.length - 1 &&
                                    'sm:col-span-2',
                                )}
                              >
                                <span className="block font-display text-2xl leading-tight font-semibold [overflow-wrap:anywhere]">
                                  {dish.name}
                                </span>
                                {dish.description && (
                                  <span className="mt-1 block text-sm leading-relaxed text-[#1d2b25]/60 italic">
                                    {dish.description}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </Reveal>
                    );
                  })}

                  {/* Taom nomlari yozilmagan bo'limlar — bitta ixcham ro'yxatda. */}
                  {unnamed.length > 0 && (
                    <Reveal>
                      {named.length > 0 && (
                        <CourseTitle>{t('showcase.package.alsoTitle')}</CourseTitle>
                      )}
                      <ul className="mx-auto flex max-w-2xl flex-wrap justify-center gap-x-10 gap-y-5 text-center">
                        {unnamed.map((section) => (
                          <li key={section.categoryId} className="w-full sm:w-[calc(50%-1.25rem)]">
                            <span className="block font-display text-2xl leading-tight font-semibold [overflow-wrap:anywhere]">
                              {localizedName(section, language)}
                            </span>
                            {section.kindsCount > 1 && (
                              <span className="mt-1 block text-sm text-[#1d2b25]/60 italic">
                                {t('menu.kinds', { count: section.kindsCount })}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </Reveal>
                  )}
                </div>
              </div>
            </Reveal>
          </section>
        )}

        {/* ── Taomlar rasmlari ───────────────────────────────────────────── */}
        {photos.length > 1 && (
          <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <SectionHeading
              eyebrow={t('showcase.package.photosEyebrow')}
              title={t('showcase.package.photosTitle')}
            />
            <div className="grid grid-flow-dense auto-rows-[clamp(130px,38vw,190px)] grid-cols-2 gap-3 md:auto-rows-[clamp(170px,15vw,300px)] md:grid-cols-4">
              {photos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setLightbox({ title: pkg.name, items: photos, index })}
                  aria-label={t('showcase.package.openDish', { name: photo.caption })}
                  className={cn(
                    'group relative cursor-zoom-in overflow-hidden rounded-2xl bg-white/5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-gold/70',
                    spans[index],
                  )}
                >
                  <img
                    src={spans[index] ? photo.url : (photo.thumbUrl ?? photo.url)}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/0 to-black/0" />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 p-4 font-display text-lg leading-tight font-semibold text-white sm:text-xl">
                    {photo.caption}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Galereya ───────────────────────────────────────────────────── */}
        {album && (
          <section
            id="gallery"
            className="mx-auto max-w-6xl scroll-mt-28 px-5 py-16 sm:px-8 sm:py-20 md:scroll-mt-20"
          >
            <SectionHeading
              eyebrow={t('showcase.gallery.eyebrow')}
              title={t('showcase.gallery.title')}
            />
            {albums.length > 1 && (
              <div
                role="tablist"
                className="mb-8 flex justify-start gap-2 overflow-x-auto pb-1 md:justify-center"
              >
                {albums.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={item.id === album.id}
                    onClick={() => setAlbumId(item.id)}
                    className={cn(
                      'shrink-0 cursor-pointer rounded-full border px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-gold/50',
                      item.id === album.id
                        ? 'bg-gold-gradient border-transparent text-[#1b1407]'
                        : 'border-white/15 text-white/70 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            )}
            {albums.length === 1 && (
              <p className="mb-6 text-center font-display text-2xl font-semibold text-white">
                {album.title}
              </p>
            )}
            {album.description && (
              <p className="mx-auto mb-8 max-w-2xl text-center text-base leading-relaxed text-white/60">
                {album.description}
              </p>
            )}
            <div
              key={album.id}
              className="columns-2 gap-4 animate-in duration-500 fade-in-0 md:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid"
            >
              {album.items.map((item, index) => (
                <MediaTile
                  key={item.id}
                  item={item}
                  label={t('gallery.openItem', { number: index + 1 })}
                  onOpen={() => setLightbox({ title: album.title, items: album.items, index })}
                  className="rounded-2xl bg-white/5"
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Boshqa paketlar ────────────────────────────────────────────── */}
        {others.length > 0 && (
          <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <SectionHeading
              eyebrow={t('showcase.package.othersEyebrow')}
              title={t('showcase.package.othersTitle')}
            />
            <div className="flex flex-wrap justify-center gap-4">
              {others.map((item) => (
                <Link
                  key={item.id}
                  to={`${ROUTES.showcaseMenu}/${item.id}`}
                  className="group relative flex min-h-36 w-full items-end overflow-hidden rounded-3xl p-5 ring-1 ring-white/12 transition-all duration-300 outline-none hover:ring-gold/60 focus-visible:ring-[3px] focus-visible:ring-gold/70 sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.7rem)]"
                >
                  <PackageCoverArt
                    src={packageCover(item, dishes)}
                    alt=""
                    imageClassName="transition-transform duration-[1200ms] group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#03110d] via-[#03110d]/80 to-[#03110d]/30" />
                  <div className="relative flex w-full items-end justify-between gap-4">
                    <p className="min-w-0">
                      <span className="block truncate font-display text-2xl font-semibold text-white">
                        {item.name}
                      </span>
                      <span className="text-gilded tabular mt-1 block font-display text-3xl leading-none font-semibold">
                        {formatAmount(item.pricePerGuest)}
                      </span>
                      <span className="mt-1.5 block text-[10px] font-medium tracking-[0.2em] text-white/55 uppercase">
                        {t('showcase.menu.perGuest')}
                      </span>
                    </p>
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/25 text-white transition-colors group-hover:border-transparent group-hover:bg-gold-light group-hover:text-[#1b1407]"
                    >
                      <ArrowRight className="size-5" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Yakun ──────────────────────────────────────────────────────── */}
        <section className="px-6 pt-16 pb-20 text-center sm:pt-24 sm:pb-28">
          <Reveal className="mx-auto max-w-2xl">
            <GemDivider className="text-gold" />
            <h2 className="mt-7 font-display text-[clamp(2rem,5vw,3.75rem)] leading-tight font-semibold text-white">
              {t('showcase.closing.title')}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/60">
              {t('showcase.closing.text')}
            </p>
            <Link
              to={MENU_LIST}
              className="bg-gold-gradient mt-9 inline-flex items-center gap-2.5 rounded-full px-8 py-4 text-base font-bold text-[#1b1407] shadow-gold transition-transform outline-none hover:scale-[1.03] focus-visible:ring-[3px] focus-visible:ring-white/70"
            >
              {t('showcase.package.all')}
              <ArrowRight className="size-5" />
            </Link>
            <p className="text-gold-gradient mt-14 font-display text-3xl font-semibold">
              {brand.name}
            </p>
            <p className="mt-2 text-xs tracking-[0.3em] text-white/40 uppercase">
              {t('showcase.hero.eyebrow')}
            </p>
          </Reveal>
        </section>
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
