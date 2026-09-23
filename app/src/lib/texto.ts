/** Minúsculas y sin tildes (la ñ se conserva). Para buscar sin preocuparse de acentos. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'ñ')
    .trim()
}

/** ¿Todas las palabras de la búsqueda aparecen en alguno de los textos? Los números se comparan también solo con dígitos. */
export function coincide(q: string, textos: (string | number | null | undefined)[]): boolean {
  const palabras = normalizar(q).split(/\s+/).filter(Boolean)
  if (!palabras.length) return true
  const bolsa = normalizar(textos.filter((t) => t != null && t !== '').join(' '))
  const digitos = bolsa.replace(/[^\d]/g, '')
  return palabras.every((w) => bolsa.includes(w) || (/^\d{3,}$/.test(w) && digitos.includes(w)))
}
