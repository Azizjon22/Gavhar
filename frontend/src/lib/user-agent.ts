export interface DeviceInfo {
  browser: string;
  os: string;
  isMobile: boolean;
}

const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/YaBrowser\//, 'Yandex'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
  [/PostmanRuntime/, 'Postman'],
  [/curl\//, 'curl'],
];

const SYSTEMS: ReadonlyArray<[RegExp, string]> = [
  [/Windows NT/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

const match = (userAgent: string, table: ReadonlyArray<[RegExp, string]>): string | undefined =>
  table.find(([pattern]) => pattern.test(userAgent))?.[1];

/**
 * Sessiyalar ro'yxatida "Chrome · Windows" ko'rinishida ko'rsatish uchun.
 * Aniqlab bo'lmasa `null` — interfeys "Noma'lum qurilma" deb yozadi.
 */
export function describeUserAgent(userAgent: string | null | undefined): DeviceInfo | null {
  if (!userAgent) return null;

  const browser = match(userAgent, BROWSERS);
  const os = match(userAgent, SYSTEMS);
  if (!browser && !os) return null;

  return {
    browser: browser ?? '',
    os: os ?? '',
    isMobile: /Mobi|Android|iPhone|iPad|iPod/.test(userAgent),
  };
}
