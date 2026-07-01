/** Customer-app information architecture (grouped, product-oriented). */
export interface NavItem {
  href: string;
  label: string;
  icon: string;
}
export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const APP_NAV: NavSection[] = [
  { items: [{ href: '/', label: 'Dashboard', icon: '◑' }] },
  {
    title: 'KI-Assistent',
    items: [
      { href: '/assistant/personality', label: 'Persönlichkeit', icon: '🧑‍💼' },
      { href: '/assistant/knowledge', label: 'Wissen', icon: '📚' },
      { href: '/assistant/questionnaire', label: 'Fragebogen', icon: '📝' },
      { href: '/assistant/behavior', label: 'Verhalten', icon: '⚙' },
    ],
  },
  {
    title: 'Telefonie',
    items: [
      { href: '/phone', label: 'Telefonnummern', icon: '📞' },
      { href: '/phone/forwarding', label: 'Rufumleitung', icon: '↪' },
      { href: '/testcall', label: 'Testanruf', icon: '🎧' },
      { href: '/calls', label: 'Gespräche', icon: '💬' },
      { href: '/analytics', label: 'Analytics', icon: '📊' },
    ],
  },
  {
    title: 'Unternehmen',
    items: [
      { href: '/company/team', label: 'Team', icon: '👥' },
      { href: '/company/general', label: 'Allgemein', icon: '🏢' },
      { href: '/company/privacy', label: 'Datenschutz', icon: '🔒' },
      { href: '/company/notifications', label: 'Benachrichtigungen', icon: '🔔' },
      { href: '/company/billing', label: 'Abrechnung', icon: '💳' },
      { href: '/company/integrations', label: 'Integrationen', icon: '🔗' },
      { href: '/company/api', label: 'API & Webhooks', icon: '🔌' },
    ],
  },
];
