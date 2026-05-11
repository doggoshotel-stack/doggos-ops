import { useState, useRef, useEffect } from 'react';

const C = {
  cream:    '#EAE8DD',
  ink:      '#21392C',
  amarillo: '#F5F53D',
  brick:    '#A23A2A',
};

/**
 * Management PIN gate.
 * PIN is read from VITE_MANAGEMENT_PIN, with a fallback for first-run.
 * Stored in localStorage after successful entry.
 *
 * Trade-off: this is a UX-level gate, not a security boundary. The PIN
 * ships in the JS bundle and the data fetched by the app is visible to
 * anyone past the outer PasswordGate. For a real boundary, the data
 * should move behind a serverless function that checks the PIN cookie.
 */
const PIN = import.meta.env.VITE_MANAGEMENT_PIN || '0CD5DB';
export const MGMT_STORAGE_KEY = 'doggos_mgmt_v1';

export function checkMgmtAuth() {
  try {
    return typeof window !== 'undefined' && localStorage.getItem(MGMT_STORAGE_KEY) === PIN;
  } catch {
    return false;
  }
}

export function clearMgmtAuth() {
  try { localStorage.removeItem(MGMT_STORAGE_KEY); } catch {}
}

export default function ManagementLogin({ onSuccess }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = (e) => {
    e.preventDefault();
    if (value === PIN) {
      try { localStorage.setItem(MGMT_STORAGE_KEY, PIN); } catch {}
      setError(false);
      onSuccess?.();
    } else {
      setError(true);
      setValue('');
      inputRef.current?.focus();
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: C.ink,
        color: C.cream,
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          padding: 40,
          border: `1.5px solid ${C.amarillo}`,
          borderRadius: 20,
          background: 'rgba(245,245,61,0.04)',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: 56, height: 56, borderRadius: 999,
            background: C.amarillo, color: C.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: `0 0 0 6px rgba(245,245,61,0.18)`,
          }}
          aria-hidden
        >
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <rect x="4" y="9" width="12" height="8" rx="1" />
            <path d="M7 9 V6 C7 4.5 8 3 10 3 C12 3 13 4.5 13 6 V9" />
          </svg>
        </div>

        <div
          className="eyebrow"
          style={{ color: C.amarillo, opacity: 0.9, fontSize: 11, letterSpacing: '0.28em', marginBottom: 8 }}
        >
          DOGGOS · MGMT
        </div>
        <h1
          className="display"
          style={{ color: C.cream, fontSize: 40, lineHeight: 1, marginBottom: 8 }}
        >
          Zona Management
        </h1>
        <p style={{ fontSize: 13, opacity: 0.65, marginBottom: 28, lineHeight: 1.55 }}>
          Acceso restringido — introduce el PIN para ver el P&amp;L y métricas internas.
        </p>

        <form onSubmit={submit}>
          <input
            ref={inputRef}
            type="password"
            inputMode="text"
            autoComplete="off"
            value={value}
            onChange={(e) => { setValue(e.target.value); if (error) setError(false); }}
            placeholder="••••••"
            style={{
              width: '100%',
              padding: '14px 16px',
              fontSize: 22,
              fontFamily: 'inherit',
              letterSpacing: '0.4em',
              textAlign: 'center',
              border: `1.5px solid ${error ? C.brick : 'rgba(234,232,221,0.3)'}`,
              borderRadius: 12,
              background: 'rgba(0,0,0,0.18)',
              color: C.cream,
              outline: 'none',
            }}
          />
          {error && (
            <div
              className="eyebrow eyebrow-sm"
              style={{ color: C.brick, marginTop: 10, fontSize: 11 }}
            >
              PIN INCORRECTO
            </div>
          )}
          <button
            type="submit"
            className="btn"
            style={{
              marginTop: 18, width: '100%',
              background: C.amarillo, color: C.ink, borderColor: C.amarillo,
            }}
          >
            Entrar
          </button>
        </form>

        <div
          className="eyebrow eyebrow-sm"
          style={{ marginTop: 24, color: C.cream, opacity: 0.45, fontSize: 10, letterSpacing: '0.18em' }}
        >
          CONECTADO A MEWS · GOOGLE SHEETS
        </div>

        <button
          onClick={() => { if (typeof window !== 'undefined') window.location.hash = '#/dashboard'; }}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'transparent', border: 'none', color: C.cream,
            opacity: 0.55, cursor: 'pointer', fontSize: 12,
          }}
        >
          ← volver
        </button>
      </div>
    </div>
  );
}
