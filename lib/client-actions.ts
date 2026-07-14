'use server';
// Control-plane actions: the super-admin provisions and manages clients. These
// operate on the control DB (and create per-tenant business DB files directly),
// so they are deliberately NOT tenant-scoped.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from './current-user';
import {
  createClient, createUser, clientBySlug, clientById, userByUsername,
  setClientStatus, deleteClientRow, auditLog, tenantDbPath,
} from './control-db';
import { openBusinessDb } from './db';

function kebab(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'client';
}
function uniqueSlug(name: string): string {
  const base = kebab(name);
  let slug = base, n = 2;
  while (clientBySlug(slug)) slug = `${base}-${n++}`;
  return slug;
}
const err = (msg: string) => redirect('/admin?err=' + encodeURIComponent(msg));

export async function createClientAction(fd: FormData) {
  const me = await requireSuperAdmin();
  const name = String(fd.get('name') || '').trim();
  const username = String(fd.get('admin_user') || '').trim();
  const password = String(fd.get('admin_pass') || '');
  const email = String(fd.get('admin_email') || '').trim() || null;
  const seed = fd.get('seed') === 'on';

  if (!name || !username || password.length < 6) err('Client name, an admin username and a 6+ character password are all required.');
  if (userByUsername(username)) err(`The username “${username}” is already taken — pick another.`);

  const id = createClient({ name, slug: uniqueSlug(name) });
  try {
    openBusinessDb(tenantDbPath(id), seed).close(); // create schema + migrate (+ optional sample data)
    createUser({ clientId: id, username, email, password, role: 'CLIENT_ADMIN' });
  } catch {
    deleteClientRow(id); // roll back the half-made client
    err('Could not finish provisioning that client. Nothing was saved.');
  }
  auditLog(me.id, id, 'client.create', `${name} · admin ${username}${seed ? ' · seeded' : ''}`);
  revalidatePath('/admin');
  redirect('/admin?done=' + encodeURIComponent(`Created “${name}”. The admin can sign in as ${username}.`));
}

export async function suspendClient(fd: FormData) {
  const me = await requireSuperAdmin();
  const id = Number(fd.get('id'));
  setClientStatus(id, 'suspended');
  auditLog(me.id, id, 'client.suspend');
  revalidatePath('/admin');
  redirect('/admin?done=Client+suspended');
}

export async function enableClient(fd: FormData) {
  const me = await requireSuperAdmin();
  const id = Number(fd.get('id'));
  setClientStatus(id, 'active');
  auditLog(me.id, id, 'client.enable');
  revalidatePath('/admin');
  redirect('/admin?done=Client+re-enabled');
}

export async function deleteClientAction(fd: FormData) {
  const me = await requireSuperAdmin();
  const id = Number(fd.get('id'));
  const c = clientById(id);
  if (!c) err('That client no longer exists.');
  if (c!.slug === 'default') err('The default workspace can’t be deleted.');
  deleteClientRow(id);
  auditLog(me.id, id, 'client.delete', c!.name);
  revalidatePath('/admin');
  redirect('/admin?done=' + encodeURIComponent(`Deleted “${c!.name}”. Its data file was kept on disk.`));
}
