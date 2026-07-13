// Optional modules: hidden from the menu by default, toggled on in Settings.
// The core flow (Today, Where to buy, Requirements, People, Market & news) is
// always visible. Trucks was removed entirely.
import { all } from './db';

export const OPTIONAL_MODULES = [
  { key: 'bookings', label: 'Bookings' },
  { key: 'money', label: 'Money' },
  { key: 'profit', label: 'Profit' },
  { key: 'reports', label: 'Reports' },
] as const;

export function enabledModules(): string[] {
  return all<{ key: string }>(`SELECT key FROM settings WHERE key LIKE 'module:%' AND value='on'`).map((r) => r.key.slice(7));
}
