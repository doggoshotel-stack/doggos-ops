import { useState, useRef, useCallback } from 'react';
import { submitConsent } from './api.js';
import SignaturePad from './SignaturePad.jsx';

/* ----------------------------- brand ----------------------------- */

const C = {
  cream: '#EAE8DD',
  ink: '#21392C',
  amarillo: '#F5F53D',
  celeste: '#78D9D8',
  brick: '#A23A2A',
  ink15: 'rgba(33,57,44,0.15)',
  ink08: 'rgba(33,57,44,0.08)',
  white: '#FBFBF7',
};

const FONTS = `
  @font-face { font-family:'Cooper BT'; src:url('/fonts/CooperBT-Light.ttf') format('truetype'); font-weight:300; font-display:swap; }
  @font-face { font-family:'GT Zirkon'; src:url('/fonts/GT-Zirkon-Book.woff2') format('woff2'); font-weight:400; font-display:swap; }
  @font-face { font-family:'GT Zirkon'; src:url('/fonts/GT-Zirkon-Bold.woff2') format('woff2'); font-weight:700; font-display:swap; }
  * { box-sizing: border-box; }
  input, textarea { font-family: inherit; }
  input:focus, textarea:focus { outline: 2px solid ${C.celeste}; outline-offset: 1px; }
`;

/* ----------------------------- helpers ----------------------------- */

function todayEs() {
  const d = new Date();
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}

const REQUIRED_MSG = 'Faltan campos obligatorios. Revisa lo marcado en rojo.';

/* ----------------------------- small UI ----------------------------- */

function Section({ n, title, children }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{
        fontFamily: "'Cooper BT', Georgia, serif", fontWeight: 300,
        fontSize: 22, lineHeight: 1.2, color: C.ink, margin: '0 0 10px',
      }}>
        <span style={{ opacity: 0.55, marginRight: 8 }}>{n}.</span>{title}
      </h2>
      <div style={{ fontSize: 15.5, lineHeight: 1.55 }}>{children}</div>
    </section>
  );
}

function P({ children, style }) {
  return <p style={{ margin: '0 0 12px', ...style }}>{children}</p>;
}

function Field({ label, value, onChange, type = 'text', placeholder, required, invalid, hint, wide }) {
  return (
    <label style={{ display: 'block', marginBottom: 14, gridColumn: wide ? '1 / -1' : undefined }}>
      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, marginBottom: 5 }}>
        {label}{required && <span style={{ color: C.brick }}> *</span>}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '11px 12px', fontSize: 15, color: C.ink,
          background: C.white, border: `1.5px solid ${invalid ? C.brick : C.ink15}`,
          borderRadius: 10,
        }}
      />
      {hint && <span style={{ display: 'block', fontSize: 12.5, opacity: 0.6, marginTop: 4 }}>{hint}</span>}
    </label>
  );
}

function CheckRow({ checked, onChange, invalid, children }) {
  return (
    <label style={{
      display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
      padding: '12px 14px', marginTop: 10, borderRadius: 12,
      background: checked ? 'rgba(120,217,216,0.18)' : C.white,
      border: `1.5px solid ${invalid ? C.brick : (checked ? C.celeste : C.ink15)}`,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 20, height: 20, marginTop: 1, accentColor: C.ink, flex: '0 0 auto' }}
      />
      <span style={{ fontSize: 14.5, lineHeight: 1.5 }}>{children}</span>
    </label>
  );
}

function YesNo({ label, value, onChange, invalid, required }) {
  return (
    <div style={{ marginTop: 12 }}>
      <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, marginBottom: 8 }}>
        {label}{required && <span style={{ color: C.brick }}> *</span>}
      </span>
      <div style={{ display: 'flex', gap: 10 }}>
        {['Sí', 'No'].map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            style={{
              flex: 1, padding: '10px 14px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              borderRadius: 10, fontFamily: 'inherit', color: C.ink,
              background: value === opt ? C.amarillo : C.white,
              border: `1.5px solid ${value === opt ? C.ink : (invalid ? C.brick : C.ink15)}`,
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- page ----------------------------- */

export default function Consent() {
  const [f, setF] = useState({
    nombre_tutor: '', dni_nie: '', telefono: '', email: '', perros: '',
    duermen_juntos: '', duermen_juntos_nombres: '',
    leido_seccion_2: false, leido_seccion_3: false, leido_seccion_4: false,
    es_rpp: '',
    contacto_emergencia: '', veterinario_habitual: '',
    acepta_entorno_natural: false, consent_datos: false,
    lugar: '',
  });
  const [sigInk, setSigInk] = useState(false);
  const [status, setStatus] = useState('form'); // form | sending | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const sigRef = useRef(null);

  const set = useCallback((k) => (v) => setF((prev) => ({ ...prev, [k]: v })), []);

  const missing = {
    nombre_tutor: !f.nombre_tutor.trim(),
    dni_nie: !f.dni_nie.trim(),
    telefono: !f.telefono.trim(),
    email: !/^\S+@\S+\.\S+$/.test(f.email.trim()),
    perros: !f.perros.trim(),
    duermen_juntos: !f.duermen_juntos,
    duermen_juntos_nombres: f.duermen_juntos === 'Sí' && !f.duermen_juntos_nombres.trim(),
    leido_seccion_2: !f.leido_seccion_2,
    leido_seccion_3: !f.leido_seccion_3,
    leido_seccion_4: !f.leido_seccion_4,
    es_rpp: !f.es_rpp,
    contacto_emergencia: !f.contacto_emergencia.trim(),
    acepta_entorno_natural: !f.acepta_entorno_natural,
    consent_datos: !f.consent_datos,
    lugar: !f.lugar.trim(),
    firma: !sigInk,
  };
  const hasErrors = Object.values(missing).some(Boolean);

  const onSubmit = async () => {
    if (hasErrors) {
      setShowErrors(true);
      setErrorMsg(REQUIRED_MSG);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setErrorMsg('');
    setStatus('sending');
    const data = {
      nombre_tutor: f.nombre_tutor.trim(),
      dni_nie: f.dni_nie.trim(),
      telefono: f.telefono.trim(),
      email: f.email.trim(),
      perros: f.perros.trim(),
      duermen_juntos: f.duermen_juntos,
      duermen_juntos_nombres: f.duermen_juntos === 'Sí' ? f.duermen_juntos_nombres.trim() : '',
      leido_seccion_2: f.leido_seccion_2 ? 'Sí' : '',
      leido_seccion_3: f.leido_seccion_3 ? 'Sí' : '',
      leido_seccion_4: f.leido_seccion_4 ? 'Sí' : '',
      es_rpp: f.es_rpp,
      contacto_emergencia: f.contacto_emergencia.trim(),
      veterinario_habitual: f.veterinario_habitual.trim(),
      acepta_entorno_natural: f.acepta_entorno_natural ? 'Sí' : '',
      consent_datos: f.consent_datos ? 'Sí' : '',
      lugar_fecha: `${f.lugar.trim()}, ${todayEs()}`,
      firma_png: sigRef.current ? sigRef.current.toDataURL() : '',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    };
    try {
      await submitConsent(data);
      setStatus('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMsg(`No se pudo enviar el formulario: ${err.message}`);
      setStatus('error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const err = (k) => showErrors && missing[k];

  const shell = {
    minHeight: '100vh', background: C.cream, color: C.ink,
    fontFamily: "'GT Zirkon', system-ui, sans-serif",
    padding: '0 16px 64px',
  };
  const card = { maxWidth: 720, margin: '0 auto' };

  if (status === 'done') {
    return (
      <div style={shell}>
        <style>{FONTS}</style>
        <div style={{ ...card, paddingTop: 80, textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🐾</div>
          <h1 style={{ fontFamily: "'Cooper BT', Georgia, serif", fontWeight: 300, fontSize: 30, margin: '0 0 12px' }}>
            ¡Gracias! Consentimiento recibido
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, opacity: 0.85 }}>
            Hemos registrado tu consentimiento correctamente. No hace falta que hagas nada más.
            Si tienes cualquier duda, contáctanos y estaremos encantados de ayudarte.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <style>{FONTS}</style>
      <div style={card}>
        {/* header */}
        <header style={{ paddingTop: 40, paddingBottom: 8 }}>
          <div style={{
            fontFamily: "'GT Zirkon', sans-serif", fontWeight: 700, letterSpacing: 2,
            fontSize: 13, textTransform: 'uppercase', opacity: 0.6,
          }}>
            Doggos Hotel &amp; Daycare
          </div>
          <h1 style={{
            fontFamily: "'Cooper BT', Georgia, serif", fontWeight: 300,
            fontSize: 'clamp(24px, 6.5vw, 30px)', lineHeight: 1.15, margin: '6px 0 4px',
          }}>
            Consentimiento Informado y Exoneración de Responsabilidad
          </h1>
          <div style={{ fontSize: 13.5, opacity: 0.6 }}>Can Abrera, S.L. — CIF: B75368738</div>
        </header>

        {(errorMsg || (showErrors && hasErrors)) && (
          <div style={{
            marginTop: 16, padding: '12px 14px', borderRadius: 12,
            background: 'rgba(162,58,42,0.1)', border: `1.5px solid ${C.brick}`,
            color: C.brick, fontSize: 14.5, fontWeight: 700,
          }}>
            {errorMsg || REQUIRED_MSG}
          </div>
        )}

        <P style={{ marginTop: 18, fontSize: 15, opacity: 0.9 }}>
          Este documento describe las condiciones bajo las cuales Doggos Hotel &amp; Daycare
          («Doggos», «nosotros») presta servicios de guardería, hotel canino y/o prueba de
          adaptación («el Servicio») al perro/los perros identificados a continuación, propiedad
          del cliente que firma este documento («el Cliente», «el Tutor»).
        </P>

        {/* 1. Datos */}
        <Section n={1} title="Datos del Cliente y del Perro">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 16px' }}>
            <Field label="Nombre del Tutor" value={f.nombre_tutor} onChange={set('nombre_tutor')} required invalid={err('nombre_tutor')} wide />
            <Field label="DNI / NIE" value={f.dni_nie} onChange={set('dni_nie')} required invalid={err('dni_nie')} />
            <Field label="Teléfono de contacto" type="tel" value={f.telefono} onChange={set('telefono')} required invalid={err('telefono')} />
            <Field label="Correo electrónico" type="email" value={f.email} onChange={set('email')} required invalid={err('email')} wide />
            <Field label="Nombre(s) del perro / de los perros" value={f.perros} onChange={set('perros')} required invalid={err('perros')}
              hint="Si son varios, sepáralos por comas." wide />
          </div>
        </Section>

        {/* 2. Convivencia */}
        <Section n={2} title="Naturaleza del Servicio y Convivencia con Otros Perros">
          <P>
            La filosofía de Doggos se basa en la vida en comunidad: fuera del horario de descanso,
            los perros comparten los patios y espacios comunes entre sí, socializando de forma
            supervisada. Es precisamente esta convivencia en espacios compartidos lo que buscan la
            mayoría de los clientes que eligen Doggos. Las habitaciones son individuales para cada
            perro, salvo en el caso de perros de la misma familia, cuyo Tutor autorice expresamente
            que duerman juntos.
          </P>
          <YesNo label="¿Autorizas que tus perros duerman en la misma habitación?" value={f.duermen_juntos}
            onChange={set('duermen_juntos')} required invalid={err('duermen_juntos')} />
          {f.duermen_juntos === 'Sí' && (
            <div style={{ marginTop: 12 }}>
              <Field label="Nombres de los perros que dormirán juntos" value={f.duermen_juntos_nombres}
                onChange={set('duermen_juntos_nombres')} required invalid={err('duermen_juntos_nombres')} />
            </div>
          )}
          <P style={{ marginTop: 14 }}>
            El Cliente entiende y acepta expresamente que, durante su estancia, guardería o periodo
            de prueba en Doggos, su perro convivirá y jugará en espacios compartidos con otros
            perros, sin correa, bajo la supervisión del personal de Doggos. Esta interacción social
            es una parte inherente y esperada del Servicio.
          </P>
          <P>El Cliente reconoce que la convivencia entre perros conlleva riesgos inherentes que no
            pueden eliminarse por completo a pesar de una supervisión razonable y diligente,
            incluyendo, entre otros:</P>
          <ul style={{ margin: '0 0 12px', paddingLeft: 22 }}>
            <li>Peleas, mordiscos, arañazos u otras lesiones físicas menores o, en casos excepcionales, graves.</li>
            <li>Estrés, ansiedad o cambios de comportamiento derivados de la convivencia grupal.</li>
            <li>Transmisión de enfermedades o parásitos entre animales (p. ej. tos de las perreras, giardia), incluso cumpliendo los protocolos sanitarios y de vacunación de Doggos.</li>
            <li>Accidentes propios de la actividad física y el juego entre perros (caídas, torceduras, etc.).</li>
          </ul>
          <CheckRow checked={f.leido_seccion_2} onChange={set('leido_seccion_2')} invalid={err('leido_seccion_2')}>
            He leído y entendido esta sección.
          </CheckRow>
        </Section>

        {/* 3. Declaración */}
        <Section n={3} title="Declaración del Tutor">
          <P>El Cliente declara y garantiza que:</P>
          <ul style={{ margin: '0 0 12px', paddingLeft: 22 }}>
            <li>Ha informado a Doggos de cualquier antecedente conocido de agresividad, reactividad, mordeduras previas o comportamiento problemático de su perro hacia personas u otros animales.</li>
            <li>Su perro está correctamente vacunado (incluyendo pauta antirrábica y vacuna frente a tos de las perreras cuando sea exigible) y desparasitado conforme a la normativa vigente.</li>
            <li>Su perro no padece, a su conocimiento, ninguna enfermedad contagiosa activa en el momento de la admisión.</li>
            <li>Ha comunicado a Doggos cualquier condición médica relevante, alergia o medicación que su perro requiera durante su estancia.</li>
            <li>Su perra, en caso de no estar esterilizada, no se encuentra en celo en el momento de la admisión, o lo comunicará a Doggos de forma inmediata si sobreviniera durante la estancia.</li>
          </ul>
          <YesNo label="¿Tu perro está catalogado como raza potencialmente peligrosa (RPP), conforme al RD 287/2002 y normativa aplicable?"
            value={f.es_rpp} onChange={set('es_rpp')} required invalid={err('es_rpp')} />
          {f.es_rpp === 'Sí' && (
            <P style={{ marginTop: 10, fontSize: 14, background: C.ink08, padding: '10px 12px', borderRadius: 10 }}>
              En este caso declaras disponer de la licencia municipal correspondiente y del seguro
              de responsabilidad civil específico en vigor, y aportarás copia de ambos documentos a
              Doggos antes de la admisión.
            </P>
          )}
          <P style={{ marginTop: 14, fontSize: 14, opacity: 0.85 }}>
            La omisión de información relevante conocida por el Tutor podrá eximir a Doggos de
            responsabilidad por los incidentes derivados directamente de dicha omisión.
          </P>
          <CheckRow checked={f.leido_seccion_3} onChange={set('leido_seccion_3')} invalid={err('leido_seccion_3')}>
            He leído y entendido esta sección, y todo lo declarado es cierto.
          </CheckRow>
        </Section>

        {/* 4. Supervisión */}
        <Section n={4} title="Supervisión y Diligencia de Doggos">
          <P>
            Doggos se compromete a mantener una supervisión razonable y adecuada de los perros a su
            cargo, aplicar protocolos de introducción gradual entre animales, separar grupos que lo
            requieran y actuar con la diligencia propia de un profesional del sector. No obstante,
            Doggos no puede garantizar la ausencia total de incidentes propios de la interacción
            natural entre animales, ni actúa como asegurador frente a todo riesgo.
          </P>
          <P>
            La responsabilidad de Doggos frente al Cliente por daños al perro se limita a los
            supuestos de negligencia grave o dolo por parte de Doggos o su personal, quedando
            excluidos los incidentes que se produzcan pese a una supervisión y diligencia
            razonables, conforme a la naturaleza inherentemente imprevisible de la interacción entre
            animales.
          </P>
          <CheckRow checked={f.leido_seccion_4} onChange={set('leido_seccion_4')} invalid={err('leido_seccion_4')}>
            He leído y entendido esta sección.
          </CheckRow>
        </Section>

        {/* 5. Urgencia veterinaria */}
        <Section n={5} title="Atención Veterinaria de Urgencia">
          <P>
            En caso de incidente que requiera atención veterinaria urgente, el Cliente autoriza a
            Doggos a trasladar al perro al centro veterinario de referencia y a autorizar el
            tratamiento necesario, intentando contactar previamente con el Tutor o su contacto de
            emergencia siempre que la urgencia lo permita. El Cliente asume los gastos veterinarios
            derivados de dicha atención, sin perjuicio de lo dispuesto en la cláusula anterior.
          </P>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0 16px' }}>
            <Field label="Contacto de emergencia (nombre y teléfono)" value={f.contacto_emergencia}
              onChange={set('contacto_emergencia')} required invalid={err('contacto_emergencia')} />
            <Field label="Veterinario habitual (nombre y teléfono, si aplica)" value={f.veterinario_habitual}
              onChange={set('veterinario_habitual')} />
          </div>
        </Section>

        {/* 6. Recomendación al recoger */}
        <Section n={6} title="Recomendación al Recoger a su Perro">
          <P>
            Doggos recomienda revisar a su perro con atención al llegar a casa, dado que las
            instalaciones son exteriores y en contacto con la naturaleza. En particular, comprobar
            el pelaje y las almohadillas en busca de semillas, espigas u otros restos vegetales
            adheridos, así como la presencia de garrapatas u otros parásitos externos. La detección
            y retirada temprana ayuda a evitar molestias o complicaciones posteriores.
          </P>
          <CheckRow checked={f.acepta_entorno_natural} onChange={set('acepta_entorno_natural')} invalid={err('acepta_entorno_natural')}>
            Soy consciente de que las instalaciones de Doggos se encuentran en un entorno natural y
            exterior, y de que ello conlleva la posible presencia de semillas, espigas, garrapatas u
            otros elementos propios de dicho entorno. Acepto este riesgo como parte inherente de la
            estancia de mi perro en Doggos.
          </CheckRow>
        </Section>

        {/* 7. Datos */}
        <Section n={7} title="Protección de Datos Personales">
          <P style={{ fontSize: 14 }}>
            De conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018
            (LOPDGDD): <strong>Responsable:</strong> Can Abrera, S.L. (CIF B75368738).{' '}
            <strong>Finalidad:</strong> gestión de la relación contractual, prestación del Servicio,
            atención de emergencias veterinarias y cumplimiento de obligaciones legales y sanitarias.{' '}
            <strong>Legitimación:</strong> ejecución del contrato y consentimiento del interesado.{' '}
            <strong>Conservación:</strong> mientras dure la relación y los plazos legales de
            prescripción. <strong>Cesión:</strong> no se ceden datos salvo obligación legal o
            atención veterinaria de urgencia. <strong>Derechos:</strong> acceso, rectificación,
            supresión, oposición, limitación y portabilidad dirigiéndose a Doggos, y reclamación ante
            la AEPD (www.aepd.es).
          </P>
          <CheckRow checked={f.consent_datos} onChange={set('consent_datos')} invalid={err('consent_datos')}>
            He leído y acepto la información sobre el tratamiento de mis datos personales.
          </CheckRow>
        </Section>

        {/* 8-9 legal notes */}
        <Section n="8-9" title="Ley Aplicable y Vigencia">
          <P style={{ fontSize: 14, opacity: 0.85 }}>
            El presente documento se rige por la legislación española y se somete a los Juzgados y
            Tribunales competentes conforme a la normativa de protección de consumidores, sin
            perjuicio del fuero del domicilio del Cliente. Este consentimiento tendrá validez para la
            presente estancia y para futuras estancias del perro identificado, siempre que no varíen
            las circunstancias declaradas; Doggos podrá solicitar su actualización periódicamente.
          </P>
        </Section>

        {/* 10. Aceptación + firma */}
        <Section n={10} title="Aceptación y Firma">
          <P>
            El Cliente declara haber leído, comprendido y aceptado voluntariamente el contenido
            íntegro de este documento, y presta su consentimiento informado para que su perro
            participe en el Servicio en las condiciones aquí descritas.
          </P>
          <Field label="Lugar" value={f.lugar} onChange={set('lugar')} required invalid={err('lugar')}
            placeholder="p. ej. Abrera" hint={`Fecha: ${todayEs()} (automática)`} />

          <div style={{ marginTop: 6 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, marginBottom: 5 }}>
              Firma del Tutor <span style={{ color: C.brick }}>*</span>
            </span>
            <div style={{
              border: `1.5px solid ${err('firma') ? C.brick : C.ink15}`,
              borderRadius: 14, padding: 6, background: C.white,
            }}>
              <SignaturePad ref={sigRef} color={C.ink} onInkChange={setSigInk} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <span style={{ fontSize: 12.5, opacity: 0.6 }}>Firma con el dedo o el ratón.</span>
              <button type="button" onClick={() => { sigRef.current?.clear(); }}
                style={{
                  background: 'none', border: 'none', color: C.brick, fontSize: 13,
                  fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 4,
                }}>
                Borrar firma
              </button>
            </div>
          </div>
        </Section>

        <button
          type="button"
          onClick={onSubmit}
          disabled={status === 'sending'}
          style={{
            width: '100%', marginTop: 28, padding: '16px 20px',
            fontSize: 17, fontWeight: 700, fontFamily: 'inherit',
            color: C.ink, background: status === 'sending' ? C.ink15 : C.amarillo,
            border: `2px solid ${C.ink}`, borderRadius: 14,
            cursor: status === 'sending' ? 'default' : 'pointer',
          }}
        >
          {status === 'sending' ? 'Enviando…' : 'Firmar y enviar consentimiento'}
        </button>

        <p style={{ fontSize: 12, opacity: 0.5, textAlign: 'center', marginTop: 16 }}>
          Los campos marcados con <span style={{ color: C.brick }}>*</span> son obligatorios.
        </p>
      </div>
    </div>
  );
}
