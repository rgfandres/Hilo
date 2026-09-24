import * as React from 'react'

const MQ_MOVIL = '(max-width: 767px)'
const MQ_TACTIL = '(pointer: coarse)'
const coincide = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches

function useMedia(q: string) {
  const [v, setV] = React.useState(() => coincide(q))
  React.useEffect(() => {
    const m = window.matchMedia(q)
    const h = () => setV(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [q])
  return v
}
/** Pantalla estrecha (≤ 767 px): menú en cajón, barra inferior, tablas en tarjetas. */
export const useEsMovil = () => useMedia(MQ_MOVIL)
/** Pantalla táctil: acciones con doble toque. */
export const useTactil = () => useMedia(MQ_TACTIL)

/**
 * En móvil, el botón o gesto «Atrás» cierra la capa abierta (menú, panel, diálogo)
 * en lugar de salir de la pantalla. Las capas se apilan: cada «Atrás» cierra la de arriba.
 */
export function useCerrarConAtras(open: boolean, cerrar: () => void) {
  const ref = React.useRef(cerrar)
  ref.current = cerrar
  React.useEffect(() => {
    if (!open || !coincide(MQ_MOVIL)) return
    const id = Math.random().toString(36).slice(2)
    window.history.pushState({ ...(window.history.state ?? {}), hiloCapa: id }, '')
    let porAtras = false
    const onPop = () => {
      if (window.history.state?.hiloCapa !== id) { porAtras = true; ref.current() }
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Diferido: si la capa se vuelve a montar enseguida (p. ej. StrictMode), no se retrocede
      if (!porAtras) setTimeout(() => { if (window.history.state?.hiloCapa === id) window.history.back() }, 0)
    }
  }, [open])
}

/**
 * Doble toque contra toques accidentales (en pantallas táctiles, o siempre si se pide): el primer toque
 * «arma» la acción y se desarma sola a los N segundos; el segundo la ejecuta.
 */
export function useDobleToque(segundos = 3.5, siempre = false) {
  const tactil = useTactil() || siempre
  const [armado, setArmado] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!armado) return
    const t = setTimeout(() => setArmado(null), segundos * 1000)
    return () => clearTimeout(t)
  }, [armado, segundos])
  /** Devuelve true si hay que ejecutar ya; false si solo se ha armado. */
  const pulsar = React.useCallback((clave: string) => {
    if (!tactil) return true
    if (armado === clave) { setArmado(null); return true }
    setArmado(clave); return false
  }, [tactil, armado])
  return { armado, pulsar, tactil }
}
