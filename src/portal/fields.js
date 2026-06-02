// Editable customer-portal fields, grouped into sections.
//
// Each field's `header` is the EXACT column header in the customers Google
// Sheet — the same headers the ops dashboard's parseHubSpotRow already reads.
// Keeping them identical means the portal writes straight into the sheet the
// dashboard reads, with no translation layer and no schema drift.

export const SECTIONS = [
  {
    title: 'Datos del dueño',
    fields: [
      { header: 'Nombre', label: 'Nombre', type: 'text' },
      { header: 'Apellidos', label: 'Apellidos', type: 'text' },
      { header: 'Número de teléfono de WhatsApp', label: 'Teléfono (WhatsApp)', type: 'tel' },
      { header: 'Dirección', label: 'Dirección', type: 'text' },
      { header: 'Persona autorizada para recogida/entrega', label: 'Persona autorizada para recogida/entrega', type: 'text' },
    ],
  },
  {
    title: 'Perfil del perro',
    fields: [
      { header: 'Nombre del perro', label: 'Nombre del perro', type: 'text' },
      { header: 'Raza', label: 'Raza', type: 'text' },
      { header: 'Tamaño', label: 'Tamaño', type: 'select', options: ['Pequeño', 'Mediano', 'Grande', 'Gigante'] },
      { header: 'Sexo', label: 'Sexo', type: 'select', options: ['Macho', 'Hembra'] },
      { header: 'Peso (kg)', label: 'Peso (kg)', type: 'text' },
      { header: 'Edad', label: 'Edad', type: 'text' },
      { header: 'Fecha de nacimiento', label: 'Fecha de nacimiento', type: 'text' },
      { header: 'Número de chip', label: 'Número de chip', type: 'text' },
      { header: 'Número de Cartilla Sanitaria', label: 'Número de cartilla sanitaria', type: 'text' },
      { header: 'Esterilizado', label: '¿Esterilizado?', type: 'select', options: ['Sí', 'No'] },
      { header: 'Última vacunación polivalente', label: 'Última vacunación polivalente', type: 'text' },
    ],
  },
  {
    title: 'Salud',
    fields: [
      { header: 'Alergias', label: 'Alergias', type: 'textarea' },
      { header: 'Patologias', label: 'Patologías', type: 'textarea' },
      { header: 'Nombre del fármaco', label: 'Medicación — nombre del fármaco', type: 'text' },
      { header: 'Dosis', label: 'Medicación — dosis', type: 'text' },
      { header: 'Días de las dosis', label: 'Medicación — pauta / días', type: 'text' },
      { header: 'Observaciones medicas', label: 'Observaciones médicas', type: 'textarea' },
      { header: 'Compañía aseguradora', label: 'Compañía aseguradora', type: 'text' },
    ],
  },
  {
    title: 'Alimentación',
    fields: [
      { header: 'Tipo de comida', label: 'Tipo de comida', type: 'text' },
      { header: 'Marca de comida', label: 'Marca de comida', type: 'text' },
      { header: 'Cantidad diaria (gramos)', label: 'Cantidad diaria (gramos)', type: 'text' },
      { header: 'Frecuencia de comidas', label: 'Frecuencia de comidas', type: 'text' },
      { header: 'Horario habitual', label: 'Horario habitual', type: 'text' },
      { header: 'Premios/snacks', label: 'Premios / snacks', type: 'text' },
      { header: 'Alimentos prohibidos', label: 'Alimentos prohibidos', type: 'text' },
      { header: 'Suplementos', label: 'Suplementos', type: 'text' },
    ],
  },
  {
    title: 'Costumbres y observaciones',
    fields: [
      { header: 'Rituales o costumbres', label: 'Rituales o costumbres', type: 'textarea' },
      { header: 'Observaciones', label: 'Observaciones', type: 'textarea' },
    ],
  },
  {
    title: 'Veterinario y emergencias',
    fields: [
      { header: 'Clínica habitual', label: 'Clínica habitual', type: 'text' },
      { header: 'Dirección (2)', label: 'Dirección de la clínica', type: 'text' },
      { header: 'Teléfono clinica', label: 'Teléfono de la clínica', type: 'tel' },
      { header: 'Contacto emergencia 1', label: 'Contacto de emergencia 1', type: 'text' },
      { header: 'Contacto emergencia 2', label: 'Contacto de emergencia 2', type: 'text' },
    ],
  },
];

// Flat list of every editable header (what we send back on save).
export const EDITABLE_HEADERS = SECTIONS.flatMap((s) => s.fields.map((f) => f.header));

// The identity column — shown read-only, never sent.
export const EMAIL_HEADER = 'Correo';
