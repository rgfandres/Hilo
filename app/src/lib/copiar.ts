/**
 * Copiar al portapapeles con alternativa: API moderna → execCommand → devuelve false
 * para que la pantalla muestre el texto seleccionado y se copie a mano.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(texto); return true }
  } catch { /* se intenta el método antiguo */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = texto; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

/** En el móvil, el menú nativo de compartir (WhatsApp, correo…) si existe. */
export async function compartir(titulo: string, texto: string): Promise<'compartido' | 'cancelado' | 'no'> {
  if (!navigator.share) return 'no'
  try { await navigator.share({ title: titulo, text: texto }); return 'compartido' } catch { return 'cancelado' }
}
