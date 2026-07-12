import { login } from '@/lib/auth-actions';
import { CopperCoil } from '@/components/CopperArt';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string; next?: string }> }) {
  const { err, next = '/' } = await searchParams;
  return (
    <div className="login-wrap">
      <div className="login-art">
        <CopperCoil className="login-coil" />
        <div className="login-brand"><span className="cu">Copper</span>Book</div>
        <div className="login-tag">The whole copper trade — bookings, trucks, money and margin — in one calm register.</div>
      </div>

      <div className="login-panel">
        <form action={login} className="login-form">
          <h1 className="login-title">Sign in</h1>
          <p className="login-sub">Welcome back. Enter your details to open the trade register.</p>
          {err ? <div className="form-error">Wrong username or password. Try again.</div> : null}
          <input type="hidden" name="next" value={next} />
          <label className="login-label">
            Username
            <input name="user" type="text" autoComplete="username" required autoFocus defaultValue="" placeholder="admin" />
          </label>
          <label className="login-label">
            Password
            <input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
          </label>
          <button className="btn" type="submit" style={{ width: '100%', marginTop: 6 }}>Sign in</button>
          <p className="login-hint">Default login: <b>admin</b> / <b>admin123</b>. Set <span className="mono-sm">ADMIN_USER</span> / <span className="mono-sm">ADMIN_PASSWORD</span> in your hosting variables to change it.</p>
        </form>
      </div>
    </div>
  );
}
