// enviar-correo · Envía por Resend el aviso que una persona ha escrito en la ficha.
// Nunca se llama sola: solo cuando alguien pulsa «Enviar correo».
// - El destino sale de la ficha del cliente (preparar_correo), no del navegador.
// - Permisos y límite diario los comprueba preparar_correo con la sesión de quien envía.
// - Secretos (los pone quien administra, en Supabase → Edge Functions → Secrets):
//     RESEND_API_KEY    obligatoria
//     CORREO_REMITENTE  opcional (por defecto avisos@conhilo.com; el dominio debe estar verificado en Resend)
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const clave = Deno.env.get('RESEND_API_KEY')
  if (!clave) return json({ error: 'sin_configurar' }, 503)

  const auth = req.headers.get('Authorization') ?? ''
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'Inicia sesión para enviar' }, 401)
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, apikey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return json({ error: 'Petición no válida' }, 400) }
  const encargo = String(b.encargo_id ?? '')
  const asunto = String(b.asunto ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
  const texto = String(b.texto ?? '').trim().slice(0, 5000)
  if (!/^[0-9a-f-]{36}$/i.test(encargo) || !texto) return json({ error: 'Falta el mensaje' }, 400)

  const { data: p, error } = await sb.rpc('preparar_correo', { p_encargo: encargo })
  if (error) return json({ error: error.message }, 400)

  const remitente = Deno.env.get('CORREO_REMITENTE') ?? 'avisos@conhilo.com'
  const tienda = String(p.tienda ?? '').replace(/[<>"\r\n]/g, '').trim() || 'Tu tienda'
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#1f1f1f;white-space:pre-wrap">${esc(texto)}</div>`
    + `<p style="font-family:system-ui,sans-serif;font-size:12px;color:#888;margin-top:24px">${esc(tienda)} · Puedes responder a este correo.</p>`

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${tienda} <${remitente}>`,
      to: [p.email],
      ...(p.responder ? { reply_to: [p.responder] } : {}),
      subject: asunto || tienda,
      text: texto,
      html,
    }),
  })
  if (!r.ok) {
    console.error('Resend', r.status, await r.text())
    return json({ error: 'El servicio de correo no lo ha aceptado. Prueba más tarde o ábrelo en tu correo.' }, 502)
  }

  // Anotarlo en el hilo con la sesión de quien envía (autor y permisos los pone la base de datos)
  const { error: e2 } = await sb.from('mensaje_enviado').insert({
    encargo_id: encargo,
    plantilla_id: typeof b.plantilla_id === 'string' ? b.plantilla_id : null,
    canal: 'EMAIL', texto, destino: p.email,
    nombre: String(b.nombre ?? 'Mensaje libre').slice(0, 200),
    por_hilo: true,
  })
  if (e2) console.error('Anotar', e2.message)
  return json({ ok: true, destino: p.email, anotado: !e2 })
})
