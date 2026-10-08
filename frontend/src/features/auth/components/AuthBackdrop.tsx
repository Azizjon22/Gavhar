import { motion } from 'framer-motion';
import { type ReactNode, useId } from 'react';

/** Sharq naqshi (sakkiz qirrali yulduz panjarasi) — fonda juda xira ko'rinadi. */
function OrnamentPattern() {
  const patternId = useId();

  return (
    <svg
      className="absolute inset-0 size-full opacity-[0.07] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
      aria-hidden="true"
    >
      <defs>
        <pattern id={patternId} width="88" height="88" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#E6C77A" strokeWidth="1">
            <path d="M22 22h44v44H22z" />
            <path d="M44 13l31 31-31 31-31-31z" />
            <path d="M44 0v13M44 75v13M0 44h13M75 44h13" />
            <circle cx="44" cy="44" r="7" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

const FLOATING_GEMS = [
  { top: '14%', left: '7%', size: 54, rotate: -14, duration: 11, delay: 0 },
  { top: '70%', left: '4%', size: 34, rotate: 18, duration: 13, delay: 1.2 },
  { top: '30%', left: '44%', size: 24, rotate: 8, duration: 9, delay: 0.6 },
  { top: '82%', left: '38%', size: 42, rotate: -20, duration: 12, delay: 2 },
  { top: '9%', left: '86%', size: 36, rotate: 14, duration: 10, delay: 0.3 },
  { top: '80%', left: '90%', size: 58, rotate: -6, duration: 14, delay: 1.6 },
] as const;

const SPARKLES = [
  { top: '18%', left: '22%', size: 3, delay: 0.2, duration: 3.4 },
  { top: '36%', left: '12%', size: 2, delay: 1.4, duration: 4.2 },
  { top: '58%', left: '26%', size: 3, delay: 0.8, duration: 3.8 },
  { top: '74%', left: '16%', size: 2, delay: 2.1, duration: 4.6 },
  { top: '12%', left: '58%', size: 2, delay: 1.1, duration: 3.6 },
  { top: '26%', left: '72%', size: 3, delay: 0.5, duration: 4.4 },
  { top: '46%', left: '94%', size: 2, delay: 1.8, duration: 3.2 },
  { top: '64%', left: '66%', size: 2, delay: 2.6, duration: 4.8 },
  { top: '88%', left: '58%', size: 3, delay: 0.9, duration: 3.9 },
  { top: '48%', left: '36%', size: 2, delay: 3.1, duration: 4.1 },
  { top: '6%', left: '34%', size: 2, delay: 2.4, duration: 3.7 },
  { top: '92%', left: '78%', size: 2, delay: 1.6, duration: 4.3 },
] as const;

function OutlineGem({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <g stroke="#E6C77A" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M20 12h24l12 15-24 27L8 27z" />
        <path d="M8 27h48M27 12l-6 15 11 27 11-27-6-15" />
      </g>
    </svg>
  );
}

/**
 * Login va majburiy sozlash sahifalari uchun to'liq ekranli fon: chuqur zumrad,
 * oltin shu'la, sharq naqshi va sekin suzib yuruvchi gavharlar. Har doim to'q —
 * tanlangan temadan qat'i nazar brend lahzasi bir xil ko'rinadi.
 */
export function AuthBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#061a14] text-white">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(110%_80%_at_12%_0%,#17624b_0%,transparent_58%),radial-gradient(90%_70%_at_100%_100%,#0f4c3a_0%,transparent_62%)]" />
        <motion.div
          className="absolute -top-44 -right-36 size-[36rem] rounded-full bg-gold/25 blur-[130px]"
          animate={{ opacity: [0.45, 0.8, 0.45], scale: [1, 1.1, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-52 -left-28 size-[32rem] rounded-full bg-emerald-300/12 blur-[120px]"
          animate={{ opacity: [0.5, 0.9, 0.5], scale: [1.05, 1, 1.05] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <OrnamentPattern />

        {FLOATING_GEMS.map((gem) => (
          <motion.div
            key={`${gem.top}-${gem.left}`}
            className="absolute opacity-20"
            style={{ top: gem.top, left: gem.left }}
            initial={{ rotate: gem.rotate }}
            animate={{ y: [0, -20, 0], rotate: [gem.rotate, gem.rotate + 7, gem.rotate] }}
            transition={{
              duration: gem.duration,
              delay: gem.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <OutlineGem size={gem.size} />
          </motion.div>
        ))}

        {SPARKLES.map((sparkle) => (
          <motion.span
            key={`${sparkle.top}-${sparkle.left}`}
            className="absolute rounded-full bg-gold-light shadow-[0_0_10px_2px_rgba(230,199,122,0.7)]"
            style={{
              top: sparkle.top,
              left: sparkle.left,
              width: sparkle.size,
              height: sparkle.size,
            }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1.3, 0.4] }}
            transition={{
              duration: sparkle.duration,
              delay: sparkle.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}

        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(2,10,7,0.7)_100%)]" />
      </div>

      {children}
    </div>
  );
}
