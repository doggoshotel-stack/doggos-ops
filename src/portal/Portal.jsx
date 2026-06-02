import { useState, useEffect, useCallback } from 'react';
import { requestLink, getRecord, saveRecord, isConfigured } from './api.js';
import { SECTIONS, EDITABLE_HEADERS, EMAIL_HEADER } from './fields.js';

const C = {
  cream: '#EAE8DD',
  ink: '#21392C',
  amarillo: '#F5F53D',
  celeste: '#78D9D8',
  brick: '#A23A2A',
  ink15: 'rgba(33,57,44,0.15)',
};

const FONTS = `
  @font-face { font-family:'Cooper BT'; src:url('/fonts/CooperBT-Light.ttf') format('truetype'); font-weight:300; font-display:swap; }
  @font-face { font-family:'GT Zirkon'; src:url('/fonts/GT-Zirkon-Book.woff2') format('woff2'); font-weight:400; font-display:swap; }
  @font-face { font-family:'GT Zirkon'; src:url('/fonts/GT-Zirkon-Bold.woff2') format('woff2'); font-weight:700; font-display:swap; }
  * { box-sizing: border-box; }
`;

const BASE = {
  minHeight: '100vh',
  background: C.cream,
  color: C.ink,
  fontFamily: "'GT Zirkon', system-ui, sans-serif",
};

function tokenFromUrl() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('token') || '';
}

function blankRecord() {
  const fields = {};
  EDITABLE_HEADERS.forEach((h) => { fields[h] = ''; });
  return { id: '', fields, _new: true };
}

export default function Portal() {
  const [token] = useState(tokenFromUrl);
  // status: 'login' | 'sent' | 'loading' | 'ready' | 'error'
  const [status, setStatus] = useState(token ? 'loading' : 'login');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');

  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(0);
  const [form, setForm] = useState({});
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error

  // Load the customer's record(s) once we have a token.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    getRecord(token)
      .then((data) => {
        if (!alive) return;
        const recs = (data.records || []).map((fields) => ({
          id: String(fields['Conversion ID'] || fields['Contact ID'] || ''),
          fields,
        }));
        setRecords(recs.length ? recs : [blankRecord()]);
        setStatus('ready');
      })
      .catch((err) => {
        if (!alive) return;
        setMessage(err.message === 'invalid_token'
          ? 'El enlace ha caducado o no es válido. Pide uno nuevo.'
          : `No se pudo cargar tu ficha: ${err.message}`);
        setStatus('login');
      });
    return () => { alive = false; };
  }, [token]);

  // Sync the editable form whenever the selected record changes.
  useEffect(() => {
    const rec = records[selected];
    if (!rec) return;
    const f = {};
    EDITABLE_HEADERS.forEach((h) => { f[h] = rec.fields[h] != null ? String(rec.fields[h]) : ''; });
    setForm(f);
    setSaveState('idle');
  }, [records, selected]);

  const onField = useCallback((header, value) => {
    setForm((prev) => ({ ...prev, [header]: value }));
    setSaveState('idle');
  }, []);

  const submitEmail = async (e) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setStatus('sent'); // optimistic; backend never reveals if the email exists
    setMessage('');
    try {
      await requestLink(addr);
    } catch (err) {
      setStatus('login');
      setMessage(`No se pudo enviar el enlace: ${err.message}`);
    }
  };

  const save = async () => {
    const rec = records[selected];
    if (!rec) return;
    setSaveState('saving');
    try {
      const res = await saveRecord(token, rec.id, form);
      setRecords((prev) => prev.map((r, i) => {
        if (i !== selected) return r;
        const merged = { ...r.fields, ...form };
        return { id: res.id || r.id, fields: merged };
      }));
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setMessage(err.message);
    }
  };

  const addDog = () => {
    setRecords((prev) => [...prev, blankRecord()]);
    setSelected(records.length);
  };

  return (
    <div style={BASE}>
      <style>{FONTS}</style>
      <Header />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 80px' }}>
        {!isConfigured() && (
          <Banner tone="error">El portal aún no está configurado. Falta la variable VITE_PORTAL_API.</Banner>
        )}

        {status === 'login' && (
          <LoginCard email={email} setEmail={setEmail} onSubmit={submitEmail} message={message} />
        )}

        {status === 'sent' && (
          <Card>
            <h2 style={h2Style}>Revisa tu correo</h2>
            <p style={{ lineHeight: 1.6, opacity: 0.8 }}>
              Si <strong>{email}</strong> está registrado, te hemos enviado un enlace para acceder a la ficha de tu perro.
              El enlace caduca en una hora.
            </p>
          </Card>
        )}

        {status === 'loading' && (
          <Card><p style={{ opacity: 0.7 }}>Cargando tu ficha…</p></Card>
        )}

        {status === 'ready' && (
          <RecordEditor
            records={records}
            selected={selected}
            setSelected={setSelected}
            form={form}
            onField={onField}
            onSave={save}
            saveState={saveState}
            message={message}
            onAddDog={addDog}
          />
        )}
      </main>
    </div>
  );
}

/* ----------------------------- pieces ----------------------------- */

function Header() {
  return (
    <header style={{ background: C.ink, color: C.cream, padding: '20px 24px' }}>
      <span style={{ fontFamily: "'Cooper BT', Georgia, serif", fontWeight: 300, fontSize: 34, lineHeight: 1 }}>doggos</span>
      <span style={{ marginLeft: 12, fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', opacity: 0.7 }}>
        Mi ficha
      </span>
    </header>
  );
}

function LoginCard({ email, setEmail, onSubmit, message }) {
  return (
    <Card>
      <h2 style={h2Style}>Accede a la ficha de tu perro</h2>
      <p style={{ lineHeight: 1.6, opacity: 0.8, marginBottom: 20 }}>
        Introduce tu correo y te enviaremos un enlace de acceso. Sin contraseñas.
      </p>
      {message && <Banner tone="error">{message}</Banner>}
      <form onSubmit={onSubmit}>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          style={inputStyle}
        />
        <button type="submit" style={{ ...btnStyle, marginTop: 14, width: '100%' }}>
          Enviarme el enlace
        </button>
      </form>
    </Card>
  );
}

function RecordEditor({ records, selected, setSelected, form, onField, onSave, saveState, message, onAddDog }) {
  const dogName = (r) => r.fields['Nombre del perro'] || (r._new ? 'Nuevo perro' : 'Sin nombre');
  return (
    <div>
      {records.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {records.map((r, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              style={{
                ...pillStyle,
                background: i === selected ? C.ink : 'transparent',
                color: i === selected ? C.cream : C.ink,
              }}
            >
              {dogName(r)}
            </button>
          ))}
        </div>
      )}

      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <h3 style={{ ...h2Style, fontSize: 22 }}>{section.title}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {section.fields.map((f) => (
              <Field key={f.header} field={f} value={form[f.header] || ''} onChange={(v) => onField(f.header, v)} />
            ))}
          </div>
        </Card>
      ))}

      {message && saveState === 'error' && <Banner tone="error">No se pudo guardar: {message}</Banner>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        <button onClick={onSave} disabled={saveState === 'saving'} style={{ ...btnStyle, opacity: saveState === 'saving' ? 0.6 : 1 }}>
          {saveState === 'saving' ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {saveState === 'saved' && (
          <span style={{ color: C.ink, fontWeight: 700, fontSize: 13, letterSpacing: '0.06em' }}>✓ Guardado</span>
        )}
        <button onClick={onAddDog} style={{ ...btnStyle, background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}` }}>
          + Añadir otro perro
        </button>
      </div>
    </div>
  );
}

function Field({ field, value, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.65 }}>
        {field.label}
      </span>
      {field.type === 'textarea' ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      ) : field.type === 'select' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
          <option value="">—</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={field.type === 'tel' ? 'tel' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      )}
    </label>
  );
}

function Card({ children }) {
  return (
    <div style={{ background: C.cream, border: `1.5px solid ${C.ink15}`, borderRadius: 16, padding: 24, marginBottom: 16 }}>
      {children}
    </div>
  );
}

function Banner({ tone, children }) {
  const bg = tone === 'error' ? 'rgba(162,58,42,0.08)' : 'rgba(120,217,216,0.15)';
  const border = tone === 'error' ? C.brick : C.celeste;
  return (
    <div style={{ background: bg, border: `1.5px solid ${border}`, color: tone === 'error' ? C.brick : C.ink, borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
      {children}
    </div>
  );
}

const h2Style = { fontFamily: "'Cooper BT', Georgia, serif", fontWeight: 300, fontSize: 28, lineHeight: 1.05, margin: '0 0 4px' };

const inputStyle = {
  width: '100%', padding: '11px 13px', fontSize: 15, fontFamily: 'inherit',
  border: `1.5px solid ${C.ink15}`, borderRadius: 10, background: '#fff', color: C.ink, outline: 'none',
};

const btnStyle = {
  padding: '12px 22px', fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
  border: `1.5px solid ${C.ink}`, borderRadius: 999, background: C.ink, color: C.cream, cursor: 'pointer', fontFamily: 'inherit',
};

const pillStyle = {
  padding: '8px 16px', fontSize: 13, fontWeight: 700, border: `1.5px solid ${C.ink}`, borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
};
