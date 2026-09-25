import * as React from 'react'
import { copiarTexto } from '@/lib/copiar'
import { useAuth } from '@/auth/AuthProvider'
import {
  enlaceCorreo, enlaceGmail, enlaceWhatsApp, enviarCorreo, fraseEtapa, marcadoresConcordancia, nombreUsuario, registrarEnvio, rellenar, sinRellenar, telefonoWhatsApp, type PlantillaMensaje,
} from '@/data/mensajes'
import { mensajeError } from '@/data/encargos'
import type { Campo } from '@/data/config'
import { formatearValor, marcadorEtiqueta } from '@/data/config'
import type { Cliente, EncargoEstado } from '@/lib/types'
import { num3, dinero, pendiente } from '@/lib/utils'
import { min } from '@/lib/vocab'
import { Dialog, Input, Popover, Select, Textarea, type DialogAction } from '@/ui'

export type Via = 'WHATSAPP' | 'EMAIL'

/**
 * Menú «¿Por dónde le avisas?»: correo (lo envía la app) o WhatsApp (se abre con el texto y lo
 * envías tú). Nada se envía solo: siempre lo pide una persona.
 */
export function AvisarMenu({ cliente, onElegir, trigger, align = 'start' }: {
  cliente: Cliente | null
  onElegir: (via: Via) => void
  trigger: (p: { open: boolean; toggle: () => void }) => React.ReactNode
  align?: 'start' | 'end'
}) {
  const { tienda } = useAuth()
  const aj = (tienda?.ajustes ?? {}) as Record<string, unknown>
  const [open, setOpen] = React.useState(false)
  const tel = telefonoWhatsApp(cliente?.telefono, String(aj.prefijo_telefono ?? '34'))
  const email = cliente?.email?.trim() || null
  const op = (via: Via, titulo: string, ayuda: string, ok: boolean) => (
    <button type="button" disabled={!ok} onClick={() => { setOpen(false); onElegir(via) }}
      className="flex flex-col items-start rounded-sm px-2 py-1.5 text-left hover:bg-bg-4 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent">
      <span className="font-medium">{titulo}</span>
      <span className="text-sm text-fg-3">{ayuda}</span>
    </button>
  )
  return (
    <Popover open={open} onOpenChange={setOpen} align={align} className="flex w-[260px] flex-col p-1" trigger={trigger}>
      <span className="px-2 pb-1 pt-0.5 text-xs uppercase tracking-wide text-fg-3">¿Por dónde le avisas?</span>
      {op('EMAIL', '✉️ Por correo', email ? `Lo envía la app a ${email}` : 'Falta el correo en la ficha', !!email)}
      {op('WHATSAPP', '💬 Por WhatsApp', tel ? 'Se abre con el texto escrito; lo envías tú' : 'Falta el teléfono en la ficha', !!tel)}
    </Popover>
  )
}

/**
 * Escribir el aviso al cliente por el canal elegido.
 * - Correo: lo envía la app (Resend) al correo de la ficha y queda en el hilo.
 * - WhatsApp: se abre WhatsApp con el texto (o se copia) y lo envía la persona. Sin API de pago.
 */
export function EnviarMensaje({ open, onOpenChange, encargo, cliente, plantillas, inicial, via, campos, onEnviado }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  encargo: EncargoEstado
  cliente: Cliente | null
  plantillas: PlantillaMensaje[]
  inicial?: string | null
  via: Via
  campos: Campo[]
  onEnviado: () => void
}) {
  const { tienda, vocab, gr, session } = useAuth()
  const aj = (tienda?.ajustes ?? {}) as Record<string, unknown>
  const [pid, setPid] = React.useState<string>('')
  const [texto, setTexto] = React.useState('')
  const [asunto, setAsunto] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)
  const [copiado, setCopiado] = React.useState(false)
  const [hecho, setHecho] = React.useState<string | null>(null)
  const [sinConfigurar, setSinConfigurar] = React.useState(false)

  const ctx = React.useMemo(() => {
    const c: Record<string, unknown> = {}
    // Campos configurables primero (con su formato), y los fijos encima
    for (const f of campos) {
      const v = encargo.datos?.[f.clave] ?? cliente?.datos?.[f.clave]
      if (v != null && v !== '') { c[f.clave] = formatearValor(f, v); const a = marcadorEtiqueta(f); if (a && !(a in c)) c[a] = c[f.clave] }
    }
    const nombre = cliente?.nombre ?? encargo.cliente_nombre ?? ''
    Object.assign(c, {
      nombre, nombre_pila: nombre.split(/\s+/)[0],
      numero: num3(encargo), producto: encargo.producto_nombre, proveedor: encargo.proveedor_nombre,
      etapa: encargo.etapa_actual_nombre, estado: fraseEtapa(aj, encargo.etapa_actual_nombre), complementos: encargo.complementos,
      usuario: nombreUsuario(session?.user), tienda: tienda?.nombre, enlace_resena: aj.enlace_resena,
      ...(encargo.importe != null ? { importe: dinero(encargo.importe, String(aj.moneda ?? 'EUR')), a_cuenta: dinero(encargo.a_cuenta, String(aj.moneda ?? 'EUR')), pendiente: dinero(pendiente(encargo), String(aj.moneda ?? 'EUR')) } : {}),
      ...marcadoresConcordancia(vocab.producto, gr.genero.producto, encargo.producto_nombre),
    })
    // La frase de la etapa puede llevar marcadores («en el taller de {proveedor}»)
    if (typeof c.estado === 'string') c.estado = rellenar(c.estado, c)
    return c
  }, [encargo, cliente, campos, tienda, aj, session?.user, vocab.producto, gr.genero.producto])

  // Se rellena al abrir (o al cambiar de plantilla); una recarga de la ficha no pisa lo que se ha retocado
  const ctxRef = React.useRef(ctx); ctxRef.current = ctx
  const plantillasRef = React.useRef(plantillas); plantillasRef.current = plantillas
  const asuntoDe = React.useCallback((p: PlantillaMensaje | null) =>
    p?.asunto?.trim() ? rellenar(p.asunto, ctxRef.current) : `${tienda?.nombre ?? ''} · ${vocab.encargo} ${num3(encargo)}`, [tienda?.nombre, vocab.encargo, encargo])
  const asuntoRef = React.useRef(asuntoDe); asuntoRef.current = asuntoDe
  React.useEffect(() => {
    if (!open) return
    const p = plantillasRef.current.find((x) => x.id === inicial) ?? null
    setPid(p?.id ?? ''); setTexto(p ? rellenar(p.texto, ctxRef.current) : ''); setAsunto(asuntoRef.current(p))
    setErr(null); setCopiado(false); setHecho(null); setSinConfigurar(false)
  }, [open, inicial, via])

  const plantilla = plantillas.find((x) => x.id === pid) ?? null
  const tel = telefonoWhatsApp(cliente?.telefono, String(aj.prefijo_telefono ?? '34'))
  const email = cliente?.email?.trim() || null
  const faltan = sinRellenar(texto)
  const nombrePlantilla = plantilla?.nombre ?? 'Mensaje libre'

  async function enviarPorApp() {
    if (!texto.trim()) { setErr('El mensaje está vacío'); return }
    setErr(null)
    try {
      const r = await enviarCorreo({ encargo_id: encargo.id, plantilla_id: plantilla?.id ?? null, asunto, texto, nombre: nombrePlantilla })
      if (r === 'sin_configurar') { setSinConfigurar(true); return }
      setHecho(`Correo enviado a ${email} y anotado en el hilo.`); onEnviado()
    } catch (x) { setErr(mensajeError(x)) }
  }

  // Abrir WhatsApp o el correo de la persona (el navegador solo deja abrir ventanas justo tras el clic)
  async function abrirFuera(canal: Via) {
    if (!texto.trim()) { setErr('El mensaje está vacío'); return }
    const destino = canal === 'WHATSAPP' ? tel! : email!
    const url = canal === 'WHATSAPP' ? enlaceWhatsApp(destino, texto) : (aj.correo_web === 'gmail' ? enlaceGmail : enlaceCorreo)(destino, asunto, texto)
    window.open(url, '_blank', 'noopener')
    try {
      await registrarEnvio({ encargo_id: encargo.id, plantilla_id: plantilla?.id ?? null, canal, texto, destino, nombre: nombrePlantilla })
      setHecho(canal === 'WHATSAPP' ? 'Abierto en WhatsApp y anotado en el hilo. Envíalo desde allí.' : 'Abierto en tu correo y anotado en el hilo. Envíalo desde allí.'); onEnviado()
    } catch (x) { setErr(mensajeError(x)) }
  }

  const copiar: DialogAction = { label: copiado ? 'Copiado' : 'Copiar texto', variant: 'ghost', onClick: async () => { if (await copiarTexto(texto)) setCopiado(true); else setErr('Tu navegador no deja copiar solo: selecciona el texto del mensaje y cópialo') } }
  const acciones: DialogAction[] = hecho
    ? [{ label: 'Cerrar', variant: 'primary', onClick: () => onOpenChange(false) }]
    : via === 'EMAIL'
      ? (sinConfigurar
        ? [copiar, { label: 'Abrir en mi correo', variant: 'primary', disabled: !email || !texto.trim(), onClick: () => abrirFuera('EMAIL') }]
        : [copiar, { label: 'Enviar correo', variant: 'primary', disabled: !email || !texto.trim(), onClick: enviarPorApp }])
      : [copiar, { label: 'Abrir WhatsApp', variant: 'primary', disabled: !tel || !texto.trim(), onClick: () => abrirFuera('WHATSAPP') }]

  const quien = cliente?.nombre ?? min(vocab.cliente)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} error={err} className="w-[520px]" sinCancelar={!!hecho}
      title={via === 'EMAIL' ? `Correo a ${quien}` : `WhatsApp a ${quien}`}
      description={
        <span className="text-sm">
          {via === 'EMAIL'
            ? (email ? `Para: ${email}. Lo envía la app; si contesta, la respuesta te llega a tu correo.` : 'Falta el correo en la ficha (botón Editar).')
            : (tel ? `+${tel}. Se abre WhatsApp con el texto escrito y lo envías tú (o cópialo y pégalo).` : 'Falta el teléfono en la ficha (botón Editar).')}
        </span>
      }
      actions={acciones}>
      <Select value={pid} disabled={!!hecho} onChange={(e) => {
        const p = plantillas.find((x) => x.id === e.target.value) ?? null
        setPid(p?.id ?? ''); setTexto(p ? rellenar(p.texto, ctx) : ''); setAsunto(asuntoDe(p)); setCopiado(false)
      }}>
        <option value="">Mensaje libre</option>
        {(() => {
          // Las de esta etapa primero; las de otras etapas, aparte (se pueden usar igual)
          const aqui = plantillas.filter((p) => p.etapa_id && (p.etapa_id === encargo.etapa_actual_id || p.etapa_id === encargo.etapa_siguiente_id))
          const generales = plantillas.filter((p) => !p.etapa_id)
          const otras = plantillas.filter((p) => p.etapa_id && !aqui.includes(p))
          return <>
            {aqui.length > 0 && <optgroup label="Para esta etapa">{aqui.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</optgroup>}
            {generales.length > 0 && <optgroup label="Generales">{generales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</optgroup>}
            {otras.length > 0 && <optgroup label="De otras etapas">{otras.map((p) => <option key={p.id} value={p.id}>{p.nombre} (otra etapa)</option>)}</optgroup>}
          </>
        })()}
      </Select>
      {via === 'EMAIL' && <Input value={asunto} disabled={!!hecho} onChange={(e) => setAsunto(e.target.value)} placeholder="Asunto" aria-label="Asunto" />}
      <Textarea className="min-h-[140px]" value={texto} disabled={!!hecho} onChange={(e) => { setTexto(e.target.value); setCopiado(false) }} placeholder="Escribe el mensaje…" />
      {hecho && <span className="text-sm text-ok-fg">{hecho}</span>}
      {sinConfigurar && !hecho && <span className="text-sm text-warn-fg">El envío de correos desde la app aún no está activado en esta tienda. Puedes abrirlo en tu correo con el texto ya escrito.</span>}
      {faltan.length > 0 && !hecho && (
        <span className="text-sm text-warn-fg">Sin rellenar: {faltan.map((f) => `{${f}}`).join(', ')}. Complétalo a mano o revisa la plantilla.</span>
      )}
      {plantilla?.etapa_id && plantilla.etapa_id !== encargo.etapa_actual_id && plantilla.etapa_id !== encargo.etapa_siguiente_id && !hecho && (
        <span className="text-sm text-warn-fg">Esta plantilla es para otra etapa: revisa que el texto encaje.</span>
      )}
    </Dialog>
  )
}
