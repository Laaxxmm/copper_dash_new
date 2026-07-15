'use server';
// Control-plane actions: the super-admin provisions and manages clients. These
// operate on the control DB (and create per-tenant business DB files directly),
// so they are deliberately NOT tenant-scoped.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from './current-user';
import { IMPERSONATE_COOKIE, SESSION_MAX_AGE, signSession } from './auth';
import {
  createClient, createUser, clientBySlug, clientById, userByUsername, userById,
  setClientStatus, deleteClientRow, auditLog, tenantDbPath,
  usersByClient, setUserStatus, setUserRole, updateUserPassword, deleteUser,
  seatLimit, setClientConfig, setFeature,
  createAnnouncement, setAnnouncementActive,
  createPlan, deletePlan, assignPlan, planById,
} from './control-db';
import { FEATURE_KEYS, PRICE_SOURCES, ACCENTS } from './features';
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

// ---------- per-client features + data sources + branding (G4) ----------
export async function saveFeatures(fd: FormData) {
  const me = await requireSuperAdmin();
  const clientId = Number(fd.get('client_id'));
  if (!clientById(clientId)) backErr(clientId, 'That client no longer exists.');
  const off: string[] = [];
  for (const key of FEATURE_KEYS) {
    const on = fd.get(`feat_${key}`) === 'on';
    setFeature(clientId, key, on);
    if (!on) off.push(key);
  }
  auditLog(me.id, clientId, 'client.features', off.length ? `off: ${off.join(', ')}` : 'all on');
  revalidatePath(`/admin/clients/${clientId}`);
  backDone(clientId, 'Features updated.');
}

export async function saveClientData(fd: FormData) {
  const me = await requireSuperAdmin();
  const clientId = Number(fd.get('client_id'));
  if (!clientById(clientId)) backErr(clientId, 'That client no longer exists.');
  const priceSource = String(fd.get('price_source') || 'LME');
  const accent = String(fd.get('brand_accent') || '');
  setClientConfig(clientId, 'price_source', (PRICE_SOURCES as readonly string[]).includes(priceSource) ? priceSource : 'LME');
  setClientConfig(clientId, 'news_keywords', String(fd.get('news_keywords') || '').trim());
  setClientConfig(clientId, 'brand_name', String(fd.get('brand_name') || '').trim());
  setClientConfig(clientId, 'brand_accent', (ACCENTS as readonly string[]).includes(accent) ? accent : '');
  auditLog(me.id, clientId, 'client.data', priceSource);
  revalidatePath(`/admin/clients/${clientId}`);
  backDone(clientId, 'Data sources & branding saved.');
}

// ---------- impersonation + announcements (G5) ----------
export async function impersonateClient(fd: FormData) {
  const me = await requireSuperAdmin();
  const clientId = Number(fd.get('client_id'));
  const c = clientById(clientId);
  if (!c) redirect('/admin?err=' + encodeURIComponent('That client no longer exists.'));
  (await cookies()).set(IMPERSONATE_COOKIE, await signSession(String(clientId)), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_MAX_AGE,
  });
  auditLog(me.id, clientId, 'client.impersonate.start', c!.name);
  redirect('/');
}

export async function stopImpersonating() {
  const me = await requireSuperAdmin(); // resolved from the real session, not the impersonation
  (await cookies()).delete(IMPERSONATE_COOKIE);
  auditLog(me.id, null, 'client.impersonate.stop');
  redirect('/admin');
}

export async function postAnnouncement(fd: FormData) {
  const me = await requireSuperAdmin();
  const message = String(fd.get('message') || '').trim();
  const target = String(fd.get('target') || 'all'); // 'all' or a client id
  if (!message) redirect('/admin?err=' + encodeURIComponent('Write a message first.'));
  const clientId = target === 'all' ? null : Number(target) || null;
  if (target !== 'all' && (!clientId || !clientById(clientId))) redirect('/admin?err=' + encodeURIComponent('Pick a valid audience.'));
  createAnnouncement(clientId ? 'client' : 'all', clientId, message);
  auditLog(me.id, clientId, 'announcement.post', `${clientId ? 'client' : 'all'}: ${message.slice(0, 60)}`);
  revalidatePath('/admin');
  redirect('/admin?done=' + encodeURIComponent('Announcement posted.'));
}

export async function removeAnnouncement(fd: FormData) {
  const me = await requireSuperAdmin();
  const id = Number(fd.get('id'));
  setAnnouncementActive(id, false);
  auditLog(me.id, null, 'announcement.remove', String(id));
  revalidatePath('/admin');
  redirect('/admin?done=' + encodeURIComponent('Announcement removed.'));
}

// ---------- plans (G6) ----------
export async function createPlanAction(fd: FormData) {
  const me = await requireSuperAdmin();
  const name = String(fd.get('name') || '').trim();
  const features = FEATURE_KEYS.filter((k) => fd.get(`feat_${k}`) === 'on');
  const seatLimit = Math.max(1, Math.min(1000, Number(fd.get('seat_limit')) || 5));
  const recordLimit = Math.max(0, Number(fd.get('record_limit')) || 0);
  if (!name) redirect('/admin?err=' + encodeURIComponent('Give the plan a name.'));
  try {
    createPlan(name, features, seatLimit, recordLimit);
  } catch {
    redirect('/admin?err=' + encodeURIComponent(`A plan called “${name}” already exists.`));
  }
  auditLog(me.id, null, 'plan.create', name);
  revalidatePath('/admin');
  redirect('/admin?done=' + encodeURIComponent(`Plan “${name}” created.`));
}

export async function deletePlanAction(fd: FormData) {
  const me = await requireSuperAdmin();
  const id = Number(fd.get('id'));
  deletePlan(id);
  auditLog(me.id, null, 'plan.delete', String(id));
  revalidatePath('/admin');
  redirect('/admin?done=' + encodeURIComponent('Plan deleted.'));
}

export async function assignPlanAction(fd: FormData) {
  const me = await requireSuperAdmin();
  const clientId = Number(fd.get('client_id'));
  const planId = Number(fd.get('plan_id'));
  const plan = planById(planId);
  if (!clientById(clientId) || !plan) backErr(clientId, 'Pick a client and a plan.');
  assignPlan(clientId, planId);
  auditLog(me.id, clientId, 'plan.assign', plan!.name);
  revalidatePath(`/admin/clients/${clientId}`);
  backDone(clientId, `Applied the “${plan!.name}” plan — features, seats and record limit updated.`);
}
