'use server';
// Control-plane actions: the super-admin provisions and manages clients. These
// operate on the control DB (and create per-tenant business DB files directly),
// so they are deliberately NOT tenant-scoped.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from './current-user';
import {
  createClient, createUser, clientBySlug, clientById, userByUsername, userById,
  setClientStatus, deleteClientRow, auditLog, tenantDbPath,
  usersByClient, setUserStatus, setUserRole, updateUserPassword, deleteUser,
  seatLimit, setClientConfig,
} from './control-db';
import { openBusinessDb } from './db';

const backErr = (clientId: number, msg: string) => redirect(`/admin/clients/${clientId}?err=` + encodeURIComponent(msg));
const backDone = (clientId: number, msg: string) => redirect(`/admin/clients/${clientId}?done=` + encodeURIComponent(msg));
const ROLES = ['CLIENT_ADMIN', 'STAFF'];

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

// ---------- per-client user management (G3) ----------
export async function addClientUser(fd: FormData) {
  const me = await requireSuperAdmin();
  const clientId = Number(fd.get('client_id'));
  const username = String(fd.get('username') || '').trim();
  const email = String(fd.get('email') || '').trim() || null;
  const password = String(fd.get('password') || '');
  const role = String(fd.get('role') || 'STAFF');

  if (!clientById(clientId)) backErr(clientId, 'That client no longer exists.');
  if (!username || password.length < 6) backErr(clientId, 'A username and a 6+ character password are required.');
  if (!ROLES.includes(role)) backErr(clientId, 'Pick a valid role.');
  if (usersByClient(clientId).length >= seatLimit(clientId)) backErr(clientId, `All ${seatLimit(clientId)} seats are in use — raise the seat limit first.`);
  if (userByUsername(username)) backErr(clientId, `The username “${username}” is already taken.`);

  createUser({ clientId, username, email, password, role });
  auditLog(me.id, clientId, 'user.create', `${username} (${role})`);
  revalidatePath(`/admin/clients/${clientId}`);
  backDone(clientId, `Added ${username}.`);
}

/** Guarded fetch: a valid non-super-admin user in this client. */
function targetUser(clientId: number, id: number, verb: string) {
  const u = userById(id);
  if (!u || u.client_id !== clientId) backErr(clientId, 'That user is not in this client.');
  if (u!.role === 'SUPER_ADMIN') backErr(clientId, `The super-admin can’t be ${verb}.`);
  return u!;
}

export async function lockUser(fd: FormData) {
  const me = await requireSuperAdmin();
  const clientId = Number(fd.get('client_id')), id = Number(fd.get('id'));
  const u = targetUser(clientId, id, 'locked');
  setUserStatus(id, 'locked');
  auditLog(me.id, clientId, 'user.lock', u.username);
  revalidatePath(`/admin/clients/${clientId}`);
  backDone(clientId, `${u.username} is locked out.`);
}

export async function unlockUser(fd: FormData) {
  const me = await requireSuperAdmin();
  const clientId = Number(fd.get('client_id')), id = Number(fd.get('id'));
  const u = targetUser(clientId, id, 'unlocked');
  setUserStatus(id, 'active');
  auditLog(me.id, clientId, 'user.unlock', u.username);
  revalidatePath(`/admin/clients/${clientId}`);
  backDone(clientId, `${u.username} can sign in again.`);
}

export async function resetUserPassword(fd: FormData) {
  const me = await requireSuperAdmin();
  const clientId = Number(fd.get('client_id')), id = Number(fd.get('id'));
  const password = String(fd.get('password') || '');
  const u = targetUser(clientId, id, 'reset');
  if (password.length < 6) backErr(clientId, 'New password must be at least 6 characters.');
  updateUserPassword(id, password);
  auditLog(me.id, clientId, 'user.reset_pw', u.username);
  revalidatePath(`/admin/clients/${clientId}`);
  backDone(clientId, `Password reset for ${u.username}.`);
}

export async function changeUserRole(fd: FormData) {
  const me = await requireSuperAdmin();
  const clientId = Number(fd.get('client_id')), id = Number(fd.get('id'));
  const role = String(fd.get('role') || '');
  const u = targetUser(clientId, id, 'changed');
  if (!ROLES.includes(role)) backErr(clientId, 'Pick a valid role.');
  setUserRole(id, role);
  auditLog(me.id, clientId, 'user.role', `${u.username} → ${role}`);
  revalidatePath(`/admin/clients/${clientId}`);
  backDone(clientId, `${u.username} is now ${role === 'CLIENT_ADMIN' ? 'a client admin' : 'staff'}.`);
}

export async function removeUser(fd: FormData) {
  const me = await requireSuperAdmin();
  const clientId = Number(fd.get('client_id')), id = Number(fd.get('id'));
  const u = targetUser(clientId, id, 'removed');
  deleteUser(id);
  auditLog(me.id, clientId, 'user.delete', u.username);
  revalidatePath(`/admin/clients/${clientId}`);
  backDone(clientId, `Removed ${u.username}.`);
}

export async function setSeats(fd: FormData) {
  const me = await requireSuperAdmin();
  const clientId = Number(fd.get('client_id'));
  const seats = Math.max(1, Math.min(100, Number(fd.get('seats')) || 5));
  if (!clientById(clientId)) backErr(clientId, 'That client no longer exists.');
  if (seats < usersByClient(clientId).length) backErr(clientId, `There are already ${usersByClient(clientId).length} users — set the limit at or above that.`);
  setClientConfig(clientId, 'seats', String(seats));
  auditLog(me.id, clientId, 'client.seats', String(seats));
  revalidatePath(`/admin/clients/${clientId}`);
  backDone(clientId, `Seat limit set to ${seats}.`);
}
