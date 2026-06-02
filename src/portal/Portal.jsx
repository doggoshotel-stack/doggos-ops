import { useState, useEffect, useCallback, useRef } from 'react';
import { requestLink, getRecord, saveRecord, savePhoto, isConfigured } from './api.js';
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
  return { id: '', fields, photo: '', _new: true };
}

// Downscale a picked image to a small square JPEG data URL (cover-cropped,
// centered) so it fits in a single Google Sheets cell. Mirrors the dashboard.
function downscaleToDataUrl(file, size = 256, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Archivo de imagen no válido.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
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
  const [photoState, setPhotoState] = useState('idle'); // idle | saving | saved | error | needsave

  // Load the customer's record(s) once we have a token.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    getRecord(token)
      .then((data) => {
        if (!alive) return;
        const photos = data.photos || {};
        const recs = (data.records || []).map((fields) => {
          const id = String(fields['Conversion ID'] || fields['Contact ID'] || '');
          return { id, fields, photo: photos[id] || '' };
        });
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

  // Reset the photo indicator only when switching dogs (not on every records
  // change), so the "✓ Foto guardada" message survives the photo write.
  useEffect(() => { setPhotoState('idle'); }, [selected]);

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
        return { ...r, id: res.id || r.id, fields: merged };
      }));
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setMessage(err.message);
    }
  };

  // dataUrl: a JPEG data URL to set, or '' to remove the photo.
  const onSavePhoto = async (dataUrl) => {
    const rec = records[selected];
    if (!rec) return;
    if (!rec.id) { setPhotoState('needsave'); return; } // must save the dog first
    setPhotoState('saving');
    try {
      await savePhoto(token, rec.id, dataUrl);
      setRecords((prev) => prev.map((r, i) => (i === selected ? { ...r, photo: dataUrl } : r)));
      setPhotoState('saved');
    } catch (err) {
      setPhotoState('error');
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
            photoState={photoState}
            onSavePhoto={onSavePhoto}
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

function RecordEditor({ records, selected, setSelected, form, onField, onSave, saveState, message, onAddDog, photoState, onSavePhoto }) {
  const dogName = (r) => r.fields['Nombre del perro'] || (r._new ? 'Nuevo perro' : 'Sin nombre');
  const current = records[selected];
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

      <PhotoCard
        photo={current ? current.photo : ''}
        dogName={current ? (current.fields['Nombre del perro'] || '') : ''}
        canEdit={!!(current && current.id)}
        state={photoState}
        onChange={onSavePhoto}
      />

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

function PhotoCard({ photo, dogName, canEdit, state, onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const initial = (dogName || '').trim().charAt(0).toUpperCase() || '🐶';

  const pick = () => { if (inputRef.current) inputRef.current.click(); };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await downscaleToDataUrl(file);
      await onChange(dataUrl);
    } catch (err) {
      // downscale errors surface via the parent's error state on the next save;
      // for a local read failure just stop the spinner.
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h3 style={{ ...h2Style, fontSize: 22 }}>Foto de tu perro</h3>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div
          style={{
            width: 120, height: 120, borderRadius: 16, flexShrink: 0,
            border: `1.5px solid ${C.ink15}`, background: photo ? `#fff url(${photo}) center/cover no-repeat` : C.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.cream, fontFamily: "'Cooper BT', Georgia, serif", fontSize: 48, fontWeight: 300,
          }}
        >
          {!photo && initial}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {canEdit ? (
            <>
              <input ref={inputRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={pick}
                  disabled={busy || state === 'saving'}
                  style={{ ...btnStyle, opacity: (busy || state === 'saving') ? 0.6 : 1 }}
                >
                  {busy || state === 'saving' ? 'Subiendo…' : (photo ? 'Cambiar foto' : 'Subir foto')}
                </button>
                {photo && (
                  <button
                    type="button"
                    onClick={() => onChange('')}
                    disabled={busy || state === 'saving'}
                    style={{ ...btnStyle, background: 'transparent', color: C.brick, border: `1.5px solid ${C.brick}` }}
                  >
                    Quitar foto
                  </button>
                )}
              </div>
              {state === 'saved' && (
                <span style={{ color: C.ink, fontWeight: 700, fontSize: 13, letterSpacing: '0.06em' }}>✓ Foto guardada</span>
              )}
              {state === 'error' && (
                <span style={{ color: C.brick, fontWeight: 700, fontSize: 13 }}>No se pudo guardar la foto.</span>
              )}
              <span style={{ fontSize: 12, opacity: 0.6 }}>JPG o PNG. La recortamos a un cuadrado pequeño automáticamente.</span>
            </>
          ) : (
            <span style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>
              Rellena los datos del perro y pulsa «Guardar cambios» más abajo. Después podrás añadir una foto aquí.
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function Field({ field, value, onChange }) {
  // A checkbox stores the configured `checkedValue` string when ticked, or ''
  // when not — preserving byte-compatibility with the original intake form.
  if (field.type === 'checkbox') {
    const checked = value === field.checkedValue;
    return (
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', gridColumn: '1 / -1' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked ? field.checkedValue : '')}
          style={{ width: 18, height: 18, marginTop: 2, accentColor: C.ink, flexShrink: 0 }}
        />
        <span style={{ fontSize: 14, lineHeight: 1.4 }}>{field.label}</span>
      </label>
    );
  }
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
