// Key/value settings reads + the company (PO "buyer") profile.
// Defaults are seeded from the Athivinayakar PI so the PO header works out of the box;
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
  name: 'ATHIVINAYAKAR WIRES (P) LTD',
  address: 'SF No 385/2B, Kattampatti Village, S.S. Kulam Via',
  city: 'Coimbatore 641107', state: 'Tamil Nadu', state_code: '33',
  gstin: '33AACCA2293G1Z0', pan: 'AACCA2293G', cin: 'U31300TZ2019PTC001566',
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
