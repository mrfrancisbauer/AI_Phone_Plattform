import { PLATFORM_CAPS } from '@ai-phone/shared';

/** Admin-console sections. `cap` gates visibility (mirrors backend guards). */
export interface AdminNavItem {
  href: string;
  label: string;
  cap: string;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin', label: 'Dashboard', cap: PLATFORM_CAPS.DASHBOARD },
  { href: '/admin/tenants', label: 'Mandanten', cap: PLATFORM_CAPS.TENANTS_READ },
  { href: '/admin/users', label: 'Benutzer', cap: PLATFORM_CAPS.TENANTS_READ },
  { href: '/admin/phone-numbers', label: 'Telefonnummern', cap: PLATFORM_CAPS.TENANTS_READ },
  { href: '/admin/providers', label: 'Provider', cap: PLATFORM_CAPS.PROVIDERS_READ },
  { href: '/admin/ai', label: 'KI', cap: PLATFORM_CAPS.PROVIDERS_READ },
  { href: '/admin/billing', label: 'Abrechnung', cap: PLATFORM_CAPS.BILLING_READ },
  { href: '/admin/monitoring', label: 'Monitoring', cap: PLATFORM_CAPS.MONITORING },
  { href: '/admin/logs', label: 'Logs', cap: PLATFORM_CAPS.LOGS },
  { href: '/admin/audit', label: 'Audit Log', cap: PLATFORM_CAPS.AUDIT },
  { href: '/admin/system', label: 'System', cap: PLATFORM_CAPS.SYSTEM },
  { href: '/admin/backups', label: 'Backups', cap: PLATFORM_CAPS.BACKUPS },
];
