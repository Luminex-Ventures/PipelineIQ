/**
 * SaaS: Tenant (subdomain) resolution from Host header or /t/<subdomain> fallback.
 * Production: https://<subdomain>.luma-iq.ai
 * Local dev: http://localhost:3000/t/<subdomain>
 */

const SUBDOMAIN_SUFFIX = '.luma-iq.ai';
const LOCAL_T_PREFIX = '/t/';

export function getSubdomainFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const { hostname, pathname } = window.location;

  if (hostname.endsWith(SUBDOMAIN_SUFFIX)) {
    const sub = hostname.slice(0, -SUBDOMAIN_SUFFIX.length);
    return sub && sub !== 'www' ? sub : null;
  }

  if (pathname.startsWith(LOCAL_T_PREFIX)) {
    const segment = pathname.slice(LOCAL_T_PREFIX.length).split('/')[0];
    return segment || null;
  }

  return null;
}

export function getTenantAppUrl(subdomain: string): string {
  if (typeof window !== 'undefined' && window.location.hostname.includes('localhost')) {
    return `${window.location.origin}${LOCAL_T_PREFIX}${subdomain}`;
  }
  return `https://${subdomain}${SUBDOMAIN_SUFFIX}`;
}

const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
export function isValidSubdomainFormat(subdomain: string): boolean {
  const norm = subdomain.toLowerCase().trim();
  return norm.length >= 3 && norm.length <= 30 && SUBDOMAIN_REGEX.test(norm);
}
