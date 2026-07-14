// Key/value settings reads + the company (PO "buyer") profile.
// Defaults are a placeholder company so the PO header works out of the box;
// all of it is editable from Settings.
import { get } from './db';

export function getSetting(key: string, fallback = ''): string {
  return get<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, key)?.value ?? fallback;
}

export type Company = {
  name: string; address: string; city: string; state: string; state_code: string;
  gstin: string; pan: string; cin: string;
  bank: string; branch: string; ifsc: string; account: string;
  logo: string; // data URI, empty until uploaded
};

const DEFAULTS: Company = {
  name: 'AURALIS COPPER WORKS (P) LTD',
  address: 'Plot 14, SIDCO Industrial Estate, Kurichi',
  city: 'Coimbatore 641021', state: 'Tamil Nadu', state_code: '33',
  gstin: '33AAKCA7788M1Z4', pan: 'AAKCA7788M', cin: 'U27310TZ2020PTC009988',
  bank: '', branch: '', ifsc: '', account: '',
  logo: '',
};

export function companyProfile(): Company {
  const out = { ...DEFAULTS };
  for (const k of Object.keys(out) as (keyof Company)[]) {
    const v = getSetting(`company:${k}`);
    if (v) out[k] = v;
  }
  return out;
}
