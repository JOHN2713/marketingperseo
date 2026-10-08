/* =====================================================================
   worktime.js · Tiempo laboral entre dos momentos
   Solo cuentan las horas dentro del horario de la empresa (por defecto
   lunes a viernes de 09:00 a 18:00). Una tarea que empieza el viernes a
   las 17:00 y termina el lunes a las 10:00 dura 2 horas, no 65.

   El horario es de Ecuador y se aplica con su zona fija (UTC-5, sin
   horario de verano), no con la del navegador: el mismo par de fechas da
   el mismo resultado se abra donde se abra.

   No conoce Supabase ni el DOM: funciones puras, probadas aparte.
   ===================================================================== */

const HORA = 3600000;
const DIA = 24 * HORA;
const UTC_OFFSET_MS = -5 * HORA;          // America/Guayaquil

export const DEFAULT_SETTINGS = Object.freeze({
  work_days: [1, 2, 3, 4, 5],             // dia ISO: 1 = lunes … 7 = domingo
  work_start: '09:00',
  work_end: '18:00',
  archive_after_days: 3,
});

/** 'HH:MM' o 'HH:MM:SS' → milisegundos desde la medianoche. */
function msDelDia(hhmm) {
  const [h, m = 0, s = 0] = String(hhmm).split(':').map(Number);
  return h * HORA + m * 60000 + s * 1000;
}

/**
 * Horas laborales entre dos timestamps. Null si falta alguno o el fin es
 * anterior al inicio.
 */
export function workHours(fromTs, toTs, settings = DEFAULT_SETTINGS) {
  if (!fromTs || !toTs) return null;
  // Se trabaja en "hora de pared" de Ecuador: al sumar el desfase, los
  // getters UTC devuelven la fecha y hora locales de alla.
  const ini = new Date(fromTs).getTime() + UTC_OFFSET_MS;
  const fin = new Date(toTs).getTime() + UTC_OFFSET_MS;
  if (isNaN(ini) || isNaN(fin) || fin < ini) return null;

  const dias = new Set(settings.work_days);
  const abre = msDelDia(settings.work_start);
  const cierra = msDelDia(settings.work_end);

  let total = 0;
  for (let d = Math.floor(ini / DIA) * DIA; d <= fin; d += DIA) {
    const iso = new Date(d).getUTCDay() || 7;          // domingo: 0 → 7
    if (!dias.has(iso)) continue;
    const desde = Math.max(ini, d + abre);
    const hasta = Math.min(fin, d + cierra);
    if (hasta > desde) total += hasta - desde;
  }
  return total / HORA;
}

/** Horas de una jornada completa. */
export function workdayHours(settings = DEFAULT_SETTINGS) {
  return (msDelDia(settings.work_end) - msDelDia(settings.work_start)) / HORA;
}

/** "lun a vie, 09:00–18:00" — para rotular de donde sale el tiempo. */
export function describeSchedule(settings = DEFAULT_SETTINGS) {
  const N = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const ds = [...settings.work_days].sort((a, b) => a - b);
  const seguidos = ds.every((d, i) => i === 0 || d === ds[i - 1] + 1);
  const dias = ds.length > 2 && seguidos ? `${N[ds[0]]} a ${N[ds[ds.length - 1]]}` : ds.map(d => N[d]).join(', ');
  const h = t => String(t).slice(0, 5);
  return `${dias}, ${h(settings.work_start)}–${h(settings.work_end)}`;
}

/** Momento a partir del cual una tarea completada pasa al archivo. */
export function archiveCutoff(settings = DEFAULT_SETTINGS, now = Date.now()) {
  return new Date(now - settings.archive_after_days * DIA);
}

export function isArchived(task, settings = DEFAULT_SETTINGS, now = Date.now()) {
  return task.status === 'completado' && !!task.finished_at
      && new Date(task.finished_at) < archiveCutoff(settings, now);
}
