import { describe, expect, it } from 'vitest';
import { describeUserAgent } from './user-agent';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const EDGE_WINDOWS = `${CHROME_WINDOWS} Edg/140.0.0.0`;
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0';

describe('describeUserAgent', () => {
  it.each([
    [CHROME_WINDOWS, { browser: 'Chrome', os: 'Windows', isMobile: false }],
    [EDGE_WINDOWS, { browser: 'Edge', os: 'Windows', isMobile: false }],
    [SAFARI_IPHONE, { browser: 'Safari', os: 'iOS', isMobile: true }],
    [CHROME_ANDROID, { browser: 'Chrome', os: 'Android', isMobile: true }],
    [FIREFOX_LINUX, { browser: 'Firefox', os: 'Linux', isMobile: false }],
  ])('%s', (userAgent, expected) => {
    expect(describeUserAgent(userAgent)).toEqual(expected);
  });

  it("bo'sh yoki tanilmagan qiymat uchun null", () => {
    expect(describeUserAgent(null)).toBeNull();
    expect(describeUserAgent('')).toBeNull();
    expect(describeUserAgent('nimadir/1.0')).toBeNull();
  });
});
