'use client';

// Guards the destructive erase: the button stays disabled until the user types
// ERASE, so a wipe can't happen on a stray click.
import { useState } from 'react';
import { eraseAllData } from '@/lib/settings-actions';

export default function EraseForm() {
  const [text, setText] = useState('');
  const armed = text.trim().toUpperCase() === 'ERASE';
  return (
    <form action={eraseAllData} className="erase-form">
      <label className="login-label" style={{ maxWidth: 320 }}>
        Type <b>ERASE</b> to confirm
        <input name="confirm" value={text} onChange={(e) => setText(e.target.value)} placeholder="ERASE" autoComplete="off" />
      </label>
      <button type="submit" className="btn btn-danger" disabled={!armed} style={{ opacity: armed ? 1 : 0.5, cursor: armed ? 'pointer' : 'not-allowed' }}>
        Erase everything
      </button>
    </form>
  );
}
