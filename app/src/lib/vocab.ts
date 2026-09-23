/** Vocabulario por tienda (tienda.ajustes.vocab). Valores neutros por defecto. */
export const VOCAB_DEFECTO = {
  cliente: 'Cliente', clientes: 'Clientes',
  producto: 'Producto', productos: 'Productos',
  proveedor: 'Proveedor', proveedores: 'Proveedores',
  encargo: 'Encargo', encargos: 'Encargos',
  material: 'Material', materiales: 'Materiales',
} as const

export type Vocab = { [K in keyof typeof VOCAB_DEFECTO]: string }

export function vocabDe(ajustes: Record<string, unknown> | undefined | null): Vocab {
  const v = (ajustes?.vocab ?? {}) as Partial<Vocab>
  return { ...VOCAB_DEFECTO, ...v }
}

/** "clienta" / "cliente": en minúscula para usar dentro de frases */
export const min = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Nombres visibles de los roles (tienda.ajustes.roles). El permiso lo da el rol, no el nombre. */
export const ROLES = ['ADMIN', 'OPERATIVO', 'ATENCION', 'LOGISTICA'] as const
export const ROLES_DEFECTO: Record<(typeof ROLES)[number], string> = {
  ADMIN: 'Administración', OPERATIVO: 'Operativo', ATENCION: 'Atención', LOGISTICA: 'Logística',
}
/** Qué puede hacer cada rol, con el vocabulario de la tienda. */
export function ayudaRoles(v: Vocab): Record<(typeof ROLES)[number], string> {
  const enc = min(v.encargos), cli = min(v.clientes), prov = min(v.proveedor)
  return {
    ADMIN: 'Todo, incluidos Ajustes, anular y el equipo',
    OPERATIVO: `Todo el trabajo diario: crear, editar y avanzar cualquier etapa`,
    ATENCION: `Crear y editar ${enc} y ${cli}; avanza solo sus etapas`,
    LOGISTICA: `Avanza solo sus etapas y asigna ${prov}; no edita datos`,
  }
}
export function rolesDe(ajustes: Record<string, unknown> | undefined | null): Record<(typeof ROLES)[number], string> {
  return { ...ROLES_DEFECTO, ...((ajustes?.roles ?? {}) as Partial<Record<(typeof ROLES)[number], string>>) }
}

// ---------------------------------------------------------------------
// Género gramatical del vocabulario (para no escribir «el fábrica» ni «al clienta»).
// Se deduce de la palabra (acaba en -a → femenino) y se puede fijar en
// tienda.ajustes.vocab_generos = { cliente: 'f', ... }.
// ---------------------------------------------------------------------
export type ClaveVocab = 'cliente' | 'producto' | 'proveedor' | 'encargo' | 'material'
export type Genero = 'm' | 'f'
const PLURAL: Record<ClaveVocab, keyof Vocab> = { cliente: 'clientes', producto: 'productos', proveedor: 'proveedores', encargo: 'encargos', material: 'materiales' }

export function generoAuto(palabra: string): Genero {
  const p = (palabra.trim().toLowerCase().split(/\s+/)[0] ?? '')
  // Excepciones habituales masculinas acabadas en -a
  if (/^(día|mapa|sistema|problema|tema|programa|diseña)$/.test(p)) return 'm'
  return /(a|ción|sión|dad|tud)$/.test(p) ? 'f' : 'm'
}
export function generosDe(ajustes: Record<string, unknown> | undefined | null, v: Vocab): Record<ClaveVocab, Genero> {
  const fijados = (ajustes?.vocab_generos ?? {}) as Partial<Record<ClaveVocab, Genero>>
  const out = {} as Record<ClaveVocab, Genero>
  for (const k of ['cliente', 'producto', 'proveedor', 'encargo', 'material'] as ClaveVocab[]) out[k] = fijados[k] ?? generoAuto(v[k])
  return out
}

const FORMAS = {
  el: ['el', 'la'], del: ['del', 'de la'], al: ['al', 'a la'], un: ['un', 'una'], este: ['este', 'esta'],
  nuevo: ['nuevo', 'nueva'], ningun: ['ningún', 'ninguna'], los: ['los', 'las'], nuevos: ['nuevos', 'nuevas'], todos: ['todos', 'todas'],
} as const
export type Forma = keyof typeof FORMAS

export interface Gramatica {
  /** «la fábrica», «del cliente», «nueva prenda»… (palabra en minúscula) */
  con: (k: ClaveVocab, forma: Forma) => string
  /** Igual pero con la primera letra en mayúscula: «La fábrica» */
  Con: (k: ClaveVocab, forma: Forma) => string
  /** Terminación para concordar adjetivos: «asignad» + o('proveedor') */
  o: (k: ClaveVocab, plural?: boolean) => string
  genero: Record<ClaveVocab, Genero>
}
export function gramatica(v: Vocab, genero: Record<ClaveVocab, Genero>): Gramatica {
  const con = (k: ClaveVocab, forma: Forma) => {
    const f = genero[k] === 'f' ? 1 : 0
    const plural = forma === 'los' || forma === 'nuevos' || forma === 'todos'
    return `${FORMAS[forma][f]} ${min(plural ? v[PLURAL[k]] : v[k])}`
  }
  return {
    con,
    Con: (k, forma) => { const s = con(k, forma); return s.charAt(0).toUpperCase() + s.slice(1) },
    o: (k, plural) => (genero[k] === 'f' ? 'a' : 'o') + (plural ? 's' : ''),
    genero,
  }
}
