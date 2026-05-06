import { useState, useEffect } from 'react';

const STORAGE_KEY = 'doggos_auth_v1';

/**
 * Simple shared-password gate.
 * Password is set via VITE_DOGGOS_PASSWORD environment variable in Vercel.
 * If not set, falls back to "doggos2026" (CHANGE THIS in production).
 *
 * Trade-off: this is a client-side check. The password ships in the JS
 * bundle. That's fine for a casual access gate on an internal ops display.
 * For stronger auth, switch to Cloudflare Access on a custom domain.
 */
const PASSWORD = import.meta.env.VITE_DOGGOS_PASSWORD || 'doggos2026';

const C = {
  cream: '#EAE8DD',
  ink: '#21392C',
  amarillo: '#F5F53D',
  brick: '#A23A2A',
};

export default function PasswordGate({ children }) {
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === PASSWORD) {
      setAuthed(true);
    }
    setChecked(true);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (input === PASSWORD) {
      localStorage.setItem(STORAGE_KEY, PASSWORD);
      setAuthed(true);
      setError(false);
    } else {
      setError(true);
      setInput('');
    }
  };

  if (!checked) return null;
  if (authed) return children;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: C.cream,
        color: C.ink,
        fontFamily: "'GT Zirkon', system-ui, sans-serif",
        padding: 24,
      }}
    >
      <style>{`
        @font-face {
          font-family: 'Cooper BT';
          src: url('/fonts/CooperBT-Light.ttf') format('truetype');
          font-weight: 300; font-style: normal; font-display: swap;
        }
        @font-face {
          font-family: 'GT Zirkon';
          src: url('/fonts/GT-Zirkon-Book.woff2') format('woff2');
          font-weight: 400; font-style: normal; font-display: swap;
        }
        @font-face {
          font-family: 'GT Zirkon';
          src: url('/fonts/GT-Zirkon-Bold.woff2') format('woff2');
          font-weight: 700; font-style: normal; font-display: swap;
        }
      `}</style>

      <div
        style={{
          width: '100%',
          maxWidth: 420,
          padding: 36,
          border: `1.5px solid ${C.ink}`,
          borderRadius: 20,
          background: C.cream,
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontFamily: "'Cooper BT', Georgia, serif",
            fontWeight: 300,
            fontSize: 56,
            lineHeight: 1,
            color: C.ink,
            display: 'block',
            marginBottom: 8,
          }}
        >
          doggos
        </span>
        <span
          style={{
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: C.ink,
            opacity: 0.6,
          }}
        >
          Operaciones Â· acceso restringido
        </span>

        <form onSubmit={submit} style={{ marginTop: 28 }}>
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(false); }}
            placeholder="ContraseÃ±a"
            autoFocus
            style={{
              width: '100%',
              padding: '14px 16px',
              fontSize: 16,
              fontFamily: 'inherit',
              border: `1.5px solid ${error ? C.brick : C.ink}`,
              borderRadius: 12,
              background: C.cream,
              color: C.ink,
              outline: 'none',
              textAlign: 'center',
              letterSpacing: '0.1em',
            }}
          />
          {error && (
            <div style={{ marginTop: 10, fontSize: 12, color: C.brick, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              ContraseÃ±a incorrecta
            </div>
          )}
          <button
            type="submit"
            style={{
              marginTop: 16,
              width: '100%',
              padding: '14px 20px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              border: `1.5px solid ${C.ink}`,
              borderRadius: 999,
              background: C.ink,
              color: C.cream,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.amarillo; e.currentTarget.style.color = C.ink; e.currentTarget.style.borderColor = C.amarillo; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = C.ink; e.currentTarget.style.color = C.cream; e.currentTarget.style.borderColor = C.ink; }}
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
