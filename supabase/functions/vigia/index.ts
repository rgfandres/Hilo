// vigia · Vigila cuánto se gasta de los planes gratuitos y avisa por correo a quien administra Hilo.
// - La llama una vez al día la GitHub Action «latido» (hilo-privado). Sin clave: como mucho envía
//   un correo al día, y siempre al mismo destino (no se puede cambiar desde fuera).
// - Avisa si algo pasa del 70 % (con 🔴 desde el 90 %), y los lunes manda el resumen de la semana.
// - Secretos que ya existen: RESEND_API_KEY. Opcionales: VIGIA_DESTINO (por defecto hola@conhilo.com),
//   CORREO_REMITENTE (por defecto avisos@conhilo.com).
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Límites de los planes gratuitos (revisar si cambian: supabase.com/pricing, resend.com/pricing)
const LIMITES = {
  bd_bytes: { max: 500 * 1024 ** 2, nombre: 'Base de datos (Supabase)', paso: 'Supabase Pro, 25 $/mes (8 GB)' },
  archivos_bytes: { max: 1024 ** 3, nombre: 'Fotos y adjuntos (Supabase)', paso: 'Supabase Pro, 25 $/mes (100 GB)' },
  activos_30d: { max: 50_000, nombre: 'Usuarios activos al mes (Supabase)', paso: 'Supabase Pro, 25 $/mes (100.000)' },
  correos_mes: { max: 3_000, nombre: 'Correos del mes (Resend)', paso: 'Resend Pro, 20 $/mes (50.000)' },
  correos_dia: { max: 100, nombre: 'Correos de hoy (Resend, máximo diario)', paso: 'Resend Pro, sin máximo diario' },
} as const

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
const mb = (b: number) => b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`

Deno.serve(async (req) => {
  // ?resumen: mandar el resumen hoy aunque no sea lunes (sigue siendo uno al día como mucho)
  const forzar = new URL(req.url).searchParams.has('resumen')
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: u, error } = await sb.rpc('uso_plataforma')
  if (error) return json({ error: error.message }, 500)

  // Los correos de alta y de acceso también salen por Resend: se suman (aproximado: uno por alta)
  const valores: Record<keyof typeof LIMITES, number> = {
    bd_bytes: u.bd_bytes, archivos_bytes: u.archivos_bytes, activos_30d: u.activos_30d,
    correos_mes: u.correos_mes + u.altas_mes, correos_dia: u.correos_hoy + u.altas_hoy,
  }
  const filas = (Object.keys(LIMITES) as (keyof typeof LIMITES)[]).map((k) => {
    const pct = Math.round((valores[k] / LIMITES[k].max) * 100)
    const v = k.endsWith('bytes') ? `${mb(valores[k])} de ${mb(LIMITES[k].max)}` : `${valores[k].toLocaleString('es-ES')} de ${LIMITES[k].max.toLocaleString('es-ES')}`
    return { k, pct, texto: `${LIMITES[k].nombre}: ${v} (${pct} %)`, paso: LIMITES[k].paso }
  })
  const alertas = filas.filter((f) => f.pct >= 70)
  const lunes = new Date().getUTCDay() === 1
  if (!alertas.length && !lunes && !forzar) return json({ enviado: false, motivo: 'todo bajo el 70 %', filas })

  // Una sola vez al día
  const hoy = new Date().toISOString().slice(0, 10)
  const { error: dup } = await sb.from('vigia_envio').insert({ dia: hoy, resumen: { valores, alertas: alertas.map((a) => a.k) } })
  if (dup) return json({ enviado: false, motivo: 'ya se envió hoy', filas })

  const urgente = alertas.some((a) => a.pct >= 90)
  const asunto = alertas.length
    ? `Hilo · ${urgente ? 'urgente' : 'aviso'}: ${alertas.map((a) => `${LIMITES[a.k].nombre} al ${a.pct} %`).join(' · ')}`
    : 'Hilo · resumen semanal de uso'
  const texto = [
    alertas.length ? 'Algo se acerca al límite del plan gratuito:' : 'Todo bajo el 70 % de los planes gratuitos.',
    ...alertas.map((a) => `• ${a.texto} → siguiente paso: ${a.paso}`),
    '',
    'Uso de hoy:',
    ...filas.map((f) => `• ${f.texto}`),
    '',
    'Crecimiento:',
    `• Usuarios: ${u.usuarios} (${u.altas_7d} nuevos esta semana) · activos en 30 días: ${u.activos_30d}`,
    `• Tiendas: ${u.tiendas} (${u.tiendas_7d} nuevas esta semana) · encargos: ${u.encargos}`,
    '',
    'Supabase: https://supabase.com/dashboard/project/fddtqdpsgqafdxvihgwb/settings/billing · Resend: https://resend.com/settings/usage',
  ].join('\n')

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Mismo formato que los avisos que sí llegan (remitente «Hilo», texto y HTML)
      from: `Hilo <${Deno.env.get('CORREO_REMITENTE') ?? 'avisos@conhilo.com'}>`,
      to: [Deno.env.get('VIGIA_DESTINO') ?? 'hola@conhilo.com'],
      subject: asunto, text: texto,
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#1f1f1f;white-space:pre-wrap">${texto.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))}</div>`,
    }),
  })
  if (!r.ok) { await sb.from('vigia_envio').delete().eq('dia', hoy); return json({ error: 'Resend no lo aceptó', status: r.status }, 502) }
  return json({ enviado: true, asunto, filas })
})
