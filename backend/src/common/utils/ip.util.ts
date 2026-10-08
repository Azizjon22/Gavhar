const IPV4_MAPPED_PREFIX = '::ffff:';

/**
 * Node IPv4 manzilni ba'zan IPv6 ko'rinishida beradi (`::ffff:192.168.1.5`).
 * Audit log va sessiyalar ro'yxatida oddiy IPv4 ko'rinishi saqlanadi.
 */
export const normalizeIp = (ip: string | undefined): string | undefined => {
  if (!ip) return undefined;
  const lower = ip.toLowerCase();
  if (lower.startsWith(IPV4_MAPPED_PREFIX) && lower.includes('.')) {
    return ip.slice(IPV4_MAPPED_PREFIX.length);
  }
  return ip === '::1' ? '127.0.0.1' : ip;
};
