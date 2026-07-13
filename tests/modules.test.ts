import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { destroyTestDb, useTestDb } from './helpers';

class Redirected extends Error { constructor(public url: string) { super(url); } }
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Redirected(u); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { saveModules } from '@/lib/settings-actions';
import { enabledModules } from '@/lib/modules';

beforeAll(useTestDb);
afterAll(destroyTestDb);

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe('module toggle', () => {
  it('hides all optional modules by default', () => {
    expect(enabledModules()).toEqual([]);
  });

  it('saves the chosen modules and leaves the rest off', async () => {
    try { await saveModules(fd({ m_money: 'on', m_reports: 'on' })); } catch (e) { if (!(e instanceof Redirected)) throw e; }
    expect(enabledModules().sort()).toEqual(['money', 'reports']);
  });

  it('turning one off removes just that one', async () => {
    try { await saveModules(fd({ m_money: 'on' })); } catch (e) { if (!(e instanceof Redirected)) throw e; }
    expect(enabledModules()).toEqual(['money']);
  });
});
