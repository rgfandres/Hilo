import * as React from 'react'
import { copiarTexto } from '@/lib/copiar'
import { useAuth } from '@/auth/AuthProvider'
import {
  enlaceCorreo, enlaceWhatsApp, marcadoresConcordancia, registrarEnvio, rellenar, sinRellenar, telefonoWhatsApp, type PlantillaMensaje,
} from '@/data/mensajes'
import { mensajeError } from '@/data/encargos'
import type { Campo } from '@/data/config'
import { formatearValor } from '@/data/config'
import type { Cliente, EncargoEstado } from '@/lib/types'
import { num3, dinero, pendiente } from '@/lib/utils'
import { min } from '@/lib/vocab'
import { Dialog, Select, Textarea, type DialogAction } from '@/ui'

/**
 * Preparar un mensaje al cliente: elegir plantilla, retocar el texto y abrir
 * WhatsApp o el correo con todo escrito. Nunca se envía solo: lo envía la persona.
 */
export function EnviarMensaje({ open, onOpenChange, encargo, cliente, plantillas, inicial, campos, onEnviado }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  encargo: EncargoEstado
  cliente: Cliente | null
  plantillas: PlantillaMensaje[]
  inicial?: string | null
  campos: Campo[]
  onEnviado: () => void
}) {
  const { tienda, vocab, gr } = useAuth()
  const aj = (tienda?.ajustes ?? {}) as Record<string, unknown>
  const [pid, setPid] = React.useState<string>('')
  const [texto, setTexto] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)
  const [copiado, setCopiado] = React.useState(false)

  const ctx = React.useMemo(() => {
    const c: Record<string, unknown> = {}
    // Campos configurables primero (con su formato), y los fijos encima
    for (const f of campos) {
      const v = encargo.datos?.[f.clave] ?? cliente?.datos?.[f.clave]
      if (v != null && v !== '') c[f.clave] = formatearValor(f, v)
    }
    const nombre = cliente?.nombre ?? encargo.cliente_nombre ?? ''
    Object.assign(c, {
      nombre, nombre_pila: nombre.split(/\s+/)[0],
      numero: num3(encargo), producto: encargo.producto_nombre, proveedor: encargo.proveedor_nombre,
      etapa: encargo.etapa_actual_nombre, tienda: tienda?.nombre, enlace_resena: aj.enlace_resena,
      ...(encargo.importe != null ? { importe: dinero(encargo.importe, String(aj.moneda ?? 'EUR')), a_cuenta: dinero(encargo.a_cuenta, String(aj.moneda ?? 'EUR')), pendiente: dinero(pendiente(encargo), String(aj.moneda ?? 'EUR')) } : {}),
      ...marcadoresConcordancia(vocab.producto, gr.genero.producto, encargo.producto_nombre),
    })
    return c
  }, [encargo, cliente, campos, tienda, aj.enlace_resena, vocab.producto, gr.genero.producto])

  React.useEffect(() => {
    if (!open) return
    const p = plantillas.find((x) => x.id === inicial) ?? null
    setPid(p?.id ?? ''); setTexto(p ? rellenar(p.texto, ctx) : ''); setErr(null); setCopiado(false)
  }, [open, inicial, plantillas, ctx])

  const plantilla = plantillas.find((x) => x.id === pid) ?? null
  const tel = telefonoWhatsApp(cliente?.telefono, String(aj.prefijo_telefono ?? '34'))
  const email = cliente?.email ?? null
  const faltan = sinRellenar(texto)
  const canal = plantilla?.canal ?? 'AMBOS'

  async function enviar(via: 'WHATSAPP' | 'EMAIL') {
    if (!texto.trim()) { setErr('El mensaje está vacío'); return }
    const destino = via === 'WHATSAPP' ? tel! : email!
    // Abrir primero (el navegador solo permite abrir ventanas justo tras el clic)
    const url = via === 'WHATSAPP' ? enlaceWhatsApp(destino, texto) : enlaceCorreo(destino, `${tienda?.nombre ?? ''} · ${vocab.encargo} ${num3(encargo)}`, texto)
    window.open(url, '_blank', 'noopener')
    try {
      await registrarEnvio({ encargo_id: encargo.id, plantilla_id: plantilla?.id ?? null, canal: via, texto, destino, nombre: plantilla?.nombre ?? 'Mensaje libre' })
      onEnviado(); onOpenChange(false)
    } catch (x) { setErr(mensajeError(x)) }
  }

  const acciones: DialogAction[] = [
    { label: copiado ? 'Copiado' : 'Copiar texto', variant: 'ghost', onClick: async () => { if (await copiarTexto(texto)) setCopiado(true); else setErr('Tu navegador no deja copiar solo: selecciona el texto del mensaje y cópialo') } },
  ]
  if (canal !== 'WHATSAPP') acciones.push({ label: 'Correo', variant: 'default', disabled: !email || !texto.trim(), onClick: () => enviar('EMAIL') })
  if (canal !== 'EMAIL') acciones.push({ label: 'WhatsApp', variant: 'primary', disabled: !tel || !texto.trim(), onClick: () => enviar('WHATSAPP') })

  return (
    <Dialog open={open} onOpenChange={onOpenChange} error={err} className="w-[520px]"
      title={`Avisar a ${cliente?.nombre ?? min(vocab.cliente)}`}
      description={
        <span className="text-sm">
          {tel ? `WhatsApp: +${tel}` : 'Sin teléfono'} · {email ?? 'sin correo'}. Se abre la aplicación con el texto escrito; lo envías tú.
        </span>
      }
      actions={acciones}>
      <Select value={pid} onChange={(e) => {
        const p = plantillas.find((x) => x.id === e.target.value) ?? null
        setPid(p?.id ?? ''); setTexto(p ? rellenar(p.texto, ctx) : ''); setCopiado(false)
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
      <Textarea className="min-h-[140px]" value={texto} onChange={(e) => { setTexto(e.target.value); setCopiado(false) }} placeholder="Escribe el mensaje…" />
      {faltan.length > 0 && (
        <span className="text-sm text-warn-fg">Sin rellenar: {faltan.map((f) => `{${f}}`).join(', ')}. Complétalo a mano o revisa la plantilla.</span>
      )}
      {!tel && !email && <span className="text-sm text-fg-3">Añade teléfono o correo {gr.con('cliente', 'al')} (botón Editar) para poder avisarle.</span>}
      {(tel || email) && canal !== 'EMAIL' && !tel && <span className="text-sm text-fg-3">WhatsApp no disponible: falta el teléfono (o no parece válido).</span>}
      {(tel || email) && canal !== 'WHATSAPP' && !email && <span className="text-sm text-fg-3">Correo no disponible: falta la dirección de correo.</span>}
      {plantilla?.etapa_id && plantilla.etapa_id !== encargo.etapa_actual_id && plantilla.etapa_id !== encargo.etapa_siguiente_id && (
        <span className="text-sm text-warn-fg">Esta plantilla es para otra etapa: revisa que el texto encaje.</span>
      )}
    </Dialog>
  )
}
