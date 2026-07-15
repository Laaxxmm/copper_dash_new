// Per-client feature flags. Shared by server (control DB, route guard) and
// client components (nav gating), so it stays dependency-free. A feature absent
// from a client's client_flags rows (or enabled=1) is ON; enabled=0 is OFF.

export type Feature = { key: string; label: string; desc: string };

export const FEATURES: Feature[] = [
  { key: 'sales', label: 'Sales', desc: 'Sell-side — customers, PIs, margins, sell orders' },
  { key: 'finance', label: 'Finance', desc: 'Expenses and true profitability' },
  { key: 'market', label: 'Market & news', desc: 'Live LME price and copper headlines' },
  { key: 'inbox', label: 'Email inbox', desc: 'PI / PO capture from the mailbox' },
];
export const FEATURE_KEYS = FEATURES.map((f) => f.key);

// Which feature a route belongs to (for the central route guard). Longest match wins.
const ROUTE_FEATURE: [string, string][] = [
  ['/sales', 'sales'],
  ['/finance', 'finance'],
  ['/news', 'market'],
  ['/inbox', 'inbox'],
];
export function featureForPath(path: string): string | null {
  for (const [prefix, key] of ROUTE_FEATURE) if (path === prefix || path.startsWith(prefix + '/')) return key;
  return null;
}

export const PRICE_SOURCES = ['LME', 'COMEX', 'MCX', 'MANUAL'] as const;
export const ACCENTS = ['copper', 'green', 'blue', 'plum'] as const;
