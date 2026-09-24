/**
 * Plantillas de sector para el alta de tienda. Son DATOS de partida: la tienda
 * queda con esto montado y lo cambia todo después en Ajustes.
 * (Esta carpeta está excluida del detector de fugas: aquí sí van palabras de cada sector.)
 */
import type { BandejaLista, TarjetaInicio } from '@/lib/listaBandejas'

type Campo = { clave: string; etiqueta: string; tipo: 'texto' | 'numero' | 'fecha' | 'opcion'; opciones?: string[]; obligatorio?: boolean; en_tabla?: boolean; visible_proveedor?: boolean; medida?: boolean; unidad?: string }
type Puerta = { tipo: 'HITO_PREVIO' | 'CAMPO_NO_VACIO' | 'CHECK' | 'MATERIAL'; ref: string; mensaje: string; dura?: boolean; etiqueta?: string }
type Etapa = { clave: string; nombre: string; rol?: 'ADMIN' | 'OPERATIVO' | 'ATENCION' | 'LOGISTICA'; color?: string; visible?: boolean; marca?: boolean; espera?: boolean; final?: boolean; grupo?: string; produccion?: boolean; puertas?: Puerta[] }
export interface PlantillaSector {
  id: string
  nombre: string
  descripcion: string
  vocab?: Record<string, string>
  vocab_generos?: Record<string, 'm' | 'f'>
  roles?: Record<string, string>
  ajustes?: Record<string, unknown>
  campos?: { CLIENTE?: Campo[]; ENCARGO?: Campo[]; PRODUCTO?: Campo[] }
  /** aparte: con menú propio; bandejas: las de su lista; serie: prefijo de su numeración */
  tipos: { clave: string; nombre: string; serie?: string; aparte?: boolean; bandejas?: BandejaLista[]; campos?: Campo[]; etapas: Etapa[] }[]
  mensajes?: { nombre: string; texto: string; tipo?: string; etapa?: string; canal?: 'WHATSAPP' | 'EMAIL' | 'AMBOS'; asunto?: string; al_incidencia?: boolean }[]
  productos?: { nombre: string; precio?: number; consumo?: number; material_tipo?: string }[]
  proveedores?: (string | { nombre: string; tipo?: 'ENCARGOS' | 'MATERIAL' | 'AMBOS'; unidad_pedido?: number })[]
  /** Materiales de ejemplo (nacen con stock 0) */
  materiales?: { tipo: string; variante?: string; proveedor?: string; unidad?: string; umbral?: number; unidad_pedido?: number; por_encargo?: boolean; resto_hasta?: number }[]
}

const GRIS = '#999999', AMBAR = '#C98A00', AZUL = '#2B4C9B', MORADO = '#5A3E96', VERDE = '#1E6B3C'
const cobro = (etiqueta: string, mensaje: string, dura = true): Puerta => ({ tipo: 'CHECK', ref: etiqueta.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_'), etiqueta, mensaje, dura })
const LISTO = (etapa: string, tipo = 'MEDIDA') => ({ nombre: 'Avisar: ya está listo', tipo, etapa, texto: 'Hola {nombre_pila}, ¡{tu_producto} ya está list{o}! Puedes pasar a recogerl{o} cuando quieras por {tienda}.' })
const GRACIAS = (etapa: string, tipo = 'MEDIDA') => ({ nombre: 'Agradecer', tipo, etapa, texto: 'Gracias, {nombre_pila}. Esperamos que disfrutes {tu_producto}. Si te apetece, nos ayuda mucho una reseña: {enlace_resena}' })

// Bandejas de la lista y tarjetas de «Para hoy» (las claves siguen la regla de claveBandeja)
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const bE = (nombre: string, etapas: (string | { etapa: string; proveedor?: 'con' | 'sin' })[], mas: Partial<BandejaLista> = {}): BandejaLista =>
  ({ key: 'x-' + slug(nombre), tipo: 'etapas', nombre, etapas: etapas.map((e) => typeof e === 'string' ? { etapa: e } : e), accionable: true, ...mas })
const TODOS: BandejaLista = { key: 'todos', tipo: 'todos', nombre: '📋 Todos', con_terminados: true }
const PEDIR = (nombre = '📦 Pedir material', grupo?: string): BandejaLista => ({ key: 'mat-pedir', tipo: 'pedir', nombre, grupo, accionable: true, solo_falta: true })
const ESPERA = (nombre = '🚚 Material en camino', grupo?: string): BandejaLista => ({ key: 'mat-espera', tipo: 'espera_material', nombre, grupo })
const REVISAR: BandejaLista = { key: 'revisar', tipo: 'revisar', nombre: '⚠️ Revisar', accionable: true }
const TERMINADOS = (nombre: string, grupo?: string): BandejaLista => ({ key: 'entregados', tipo: 'terminados', nombre, grupo })
const ANULADOS: BandejaLista = { key: 'anulados', tipo: 'anulados', nombre: '🗑️ Anulados' }
const tB = (nombre: string, b: BandejaLista | string, tono?: TarjetaInicio['tono']): TarjetaInicio => ({ que: 'bandeja', nombre, bandeja: typeof b === 'string' ? b : b.key, tono })
const INCIDENCIAS: TarjetaInicio = { que: 'incidencias', nombre: 'Incidencias', tono: 'danger' }
const MEDIDAS_CUERPO = (l: string[]) => l.map((e) => ({ clave: slug(e).replace(/-/g, '_'), etiqueta: e, tipo: 'numero' as const, visible_proveedor: true, medida: true, unidad: 'cm' }))
const MOD = (m: { materiales?: boolean; produccion?: boolean; logistica?: boolean }) => ({ modulos: { materiales: !!m.materiales, produccion: !!m.produccion, logistica: !!m.logistica } })

// Moda a medida: bandejas de la lista (por nombre de etapa)
const M_ESPERA_TELA = bE('⏳ Esperando tela', ['Encargado'], { grupo: 'Tela', llegadas: true, ayuda: 'Sin tela en mano todavía: no se puede cortar hasta que llegue.' })
const M_CORTAR = bE('✂️ Listos para cortar', ['Tela recibida'], { grupo: 'Corte', lote_hoja: true })
const M_EN_CORTE = bE('📤 En corte', ['Enviado a corte'], { grupo: 'Corte', accionable: false })
const M_ASIGNAR = bE('🏭 Asignar taller', [{ etapa: 'Recogido del cortador', proveedor: 'sin' }], { grupo: 'Corte', elegir_proveedor: true, ayuda: 'Corte recogido pero sin taller: asígnalo para que avance.' })
const M_TALLER = bE('🧵 En taller', ['Llevado al taller', { etapa: 'Recogido del cortador', proveedor: 'con' }], { grupo: 'Confección', accionable: false })
const M_TIENDA = bE('🏪 En tienda', ['Recogido del taller', 'Entregado en tienda'], { grupo: 'Confección', ayuda: 'Ya en la tienda, pendientes de entregar a la clienta.' })

export const PLANTILLAS: PlantillaSector[] = [
  {
    id: 'blanco',
    nombre: 'En blanco',
    descripcion: 'Un flujo sencillo para empezar y configurarlo todo a tu manera.',
    tipos: [{ clave: 'ENCARGO', nombre: 'Encargo', etapas: [
      { clave: 'RECIBIDO', nombre: 'Recibido', rol: 'ATENCION', color: GRIS },
      { clave: 'EN_PROCESO', nombre: 'En proceso', color: AZUL },
      { clave: 'LISTO', nombre: 'Listo', color: AMBAR },
      { clave: 'ENTREGADO', nombre: 'Entregado', rol: 'ATENCION', color: VERDE, final: true },
    ] }],
    mensajes: [LISTO('LISTO', 'ENCARGO'), GRACIAS('ENTREGADO', 'ENCARGO')],
  },
  {
    id: 'moda',
    nombre: 'Moda a medida: flamenca, novia y fiesta',
    descripcion: 'Trajes a medida con stock de telas, orden de corte, cortador, talleres de confección, reparto y prendas de stock para arreglar.',
    vocab: { encargo: 'Traje', encargos: 'Trajes', cliente: 'Clienta', clientes: 'Clientas', producto: 'Modelo', productos: 'Modelos', proveedor: 'Taller', proveedores: 'Talleres', material: 'Tela', materiales: 'Telas' },
    vocab_generos: { encargo: 'm', producto: 'm', proveedor: 'm', material: 'f' },
    roles: { ATENCION: 'Dependienta', OPERATIVO: 'Producción', LOGISTICA: 'Reparto' },
    ajustes: {
      ...MOD({ materiales: true, produccion: true, logistica: true }),
      dias_estancado: 10, estancado_por: 'pasos', estancado_en_espera: true, dias_atasco_proveedor: 15,
      usar_importe: true, normalizar_nombres: true, segundos_deshacer: 8,
      // Una ficha por traje: cada traje nuevo copia los datos de la clienta en una ficha propia
      cliente_por_encargo: true, repetir_copia: ['feria'],
      usar_complementos: true, etiqueta_complementos: 'Adornos', tipos_construccion: ['Con corte', 'Enterizo'],
      material_unidad: 'm', material_pedir: 'falta', material_contador: 'restos', material_menu_pedidos: true, umbral_material_defecto: 10,
      hoja_nombre: 'Orden de corte', hoja_campo_col: 'talla', hoja_col_etiqueta: 'Talla',
      hoja_curva: ['T.32', 'T.34', 'T.36', 'T.38', 'T.40', 'T.42', 'T.44', 'T.46', 'T.48', 'T.50', 'T.52'],
      hoja_imp_marca: 'X', hoja_imp_cabecera: 'producto', hoja_imp_cliente: false, hoja_imp_cantidad: false, hoja_imp_nota: false,
      proveedor: { ver_cliente: 'nombre' },
      pantallas: { ATENCION: ['parahoy', 'encargos', 'nuevo', 'clientes', 'productos'], LOGISTICA: ['logistica', 'productos'] },
      guia_medidas: {
        activa: true, modo: 'cercana', destino: 'talla', principal: 'pecho', validan: ['cintura', 'cadera'], especial: 'Revisar', tolerancias: [1, 2, 3], responsable: '',
        filas: [[32, 76, 56, 84], [34, 80, 60, 88], [36, 84, 64, 92], [38, 88, 68, 96], [40, 92, 72.5, 100], [42, 96, 76.8, 104], [44, 100, 81.2, 108], [46, 104, 85.6, 112], [48, 108, 90, 116], [50, 112, 94.5, 120], [52, 116, 98.5, 124]]
          .map(([t, pecho, cintura, cadera]) => ({ etiqueta: `T.${t}`, valores: { pecho, cintura, cadera } })),
      },
      frases_etapa: {
        'Encargado': 'pendiente de tela', 'Tela recibida': 'pendiente de corte', 'Enviado a corte': 'enviado a corte', 'Recogido del cortador': 'pendiente de confección',
        'Llevado al taller': 'en taller de {proveedor}', 'Recogido del taller': 'listo para entregar', 'Entregado en tienda': 'listo para entregar', 'Entregado a clienta': 'entregado',
      },
      lista_bandejas: [TODOS, M_ESPERA_TELA, PEDIR('📦 Pedir tela', 'Tela'), M_CORTAR, M_EN_CORTE, M_ASIGNAR, M_TALLER, M_TIENDA, TERMINADOS('💃 Entregados a clienta', 'Confección'), REVISAR, ANULADOS],
      inicio_tarjetas: [tB('Trajes en temporada', TODOS), tB('Pendientes de tela', M_ESPERA_TELA), tB('En taller', M_TALLER), tB('Listos para entregar', M_TIENDA, 'ok'), tB('Entregados', 'entregados', 'ok'), INCIDENCIAS],
      logistica: {
        abrir_primera: true, doble_siempre: true, ocultar_futuros: true, ocultar_llegadas: true, historico_periodo: true, campos_tarjeta: ['tejido', 'talla', 'feria'],
        bandejas: {
          'e:Recogido del cortador': { nombre: '📥 Recoger del cortador', boton: '✓ Recogido', dias: '{n} días esperando', filtro: 'siempre', carpetas: 'nunca', subtitulo: 'Trajes cortados esperando a que los recojas.' },
          'c:adorno': { nombre: '🎀 Adornos', boton: '✓ Comprado', dias: '{n} días esperando el adorno', filtro: 'nunca', carpetas: 'nunca', subtitulo: 'Adornos por comprar. Márcalo al comprarlo y el traje pasa solo a «Llevar al taller».' },
          'e:Llevado al taller': { nombre: '🚛 Llevar al taller', boton: '🚛 Llevado', dias: '{n} días en el coche', filtro: 'siempre', carpetas: 'nunca', proveedor: true, subtitulo: 'Con el adorno comprado, pendientes de llevar al taller.' },
          'e:Recogido del taller': { nombre: '📦 Recoger del taller', boton: '📦 Recogido', dias: '{n} días en taller', filtro: 'nunca', carpetas: 'siempre', subtitulo: 'Trajes en los talleres, pendientes de recoger.' },
          'e:Entregado en tienda': { nombre: '🏪 Dejar en tienda', boton: '🏪 Entregado', dias: '{n} días en el coche', filtro: 'nunca', carpetas: 'nunca', todos: true, todos_texto: '🏪 Marcar TODOS como entregados en tienda', subtitulo: 'Recogidos del taller, pendientes de dejar en la tienda.' },
          h: { nombre: '📚 Histórico', filtro: 'nunca', carpetas: 'siempre', subtitulo: 'Trajes ya entregados en la tienda (solo consulta).', vacio: 'Aún no has entregado ningún traje en la tienda esta temporada.' },
        },
      },
    },
    campos: {
      CLIENTE: MEDIDAS_CUERPO(['Pecho', 'Cintura', 'Cadera', 'Hombro', 'Largo manga', 'Largo talle delantero', 'Largo talle espalda', 'Largo total', 'Altura pecho', 'Separación pecho', 'Contorno manga', 'Muñeca']),
      ENCARGO: [
        { clave: 'tejido', etiqueta: 'Tipo de tela', tipo: 'texto', en_tabla: true, visible_proveedor: true },
        { clave: 'talla', etiqueta: 'Talla', tipo: 'opcion', opciones: ['T.32', 'T.34', 'T.36', 'T.38', 'T.40', 'T.42', 'T.44', 'T.46', 'T.48', 'T.50', 'T.52'], en_tabla: true, visible_proveedor: true },
        { clave: 'feria', etiqueta: 'Feria o evento', tipo: 'texto', visible_proveedor: true },
        { clave: 'fecha_limite', etiqueta: 'Lo necesita para', tipo: 'fecha', en_tabla: true },
      ],
      PRODUCTO: [{ clave: 'notas', etiqueta: 'Notas', tipo: 'texto' }],
    },
    tipos: [
      { clave: 'MEDIDA', nombre: 'A medida', etapas: [
        { clave: 'ENCARGADO', nombre: 'Encargado', rol: 'ATENCION', color: GRIS },
        { clave: 'TELA', nombre: 'Tela recibida', color: AMBAR, puertas: [{ tipo: 'MATERIAL', ref: 'material', mensaje: 'Falta recibir la tela' }] },
        { clave: 'CORTE', nombre: 'Enviado a corte', color: MORADO, espera: true, produccion: true },
        { clave: 'CORTADO', nombre: 'Recogido del cortador', rol: 'LOGISTICA', color: AZUL, visible: true },
        { clave: 'TALLER', nombre: 'Llevado al taller', rol: 'LOGISTICA', color: AZUL, visible: true, espera: true, puertas: [
          { tipo: 'CHECK', ref: 'adorno', etiqueta: 'Adorno comprado', mensaje: 'Falta comprar el adorno' },
          { tipo: 'CAMPO_NO_VACIO', ref: 'proveedor_id', mensaje: 'Elige un taller antes de marcarlo como llevado' },
        ] },
        { clave: 'RECOGIDO', nombre: 'Recogido del taller', rol: 'LOGISTICA', color: VERDE, visible: true },
        { clave: 'EN_TIENDA', nombre: 'Entregado en tienda', rol: 'LOGISTICA', color: VERDE },
        { clave: 'ENTREGADO', nombre: 'Entregado a clienta', rol: 'ATENCION', color: VERDE, final: true },
      ] },
      { clave: 'STOCK', nombre: 'Prendas de stock', serie: 'S', aparte: true,
        campos: [{ clave: 'arreglo', etiqueta: 'Qué hay que hacer', tipo: 'texto', obligatorio: true, en_tabla: true }],
        bandejas: [TODOS, bE('🪡 En taller', ['En taller'], { ayuda: 'Prendas de stock que se están arreglando.' }), bE('✅ Arreglados', ['Arreglado'], { accionable: false, ayuda: 'Ya arreglados, esperando a que la clienta pase a recogerlos.' }), TERMINADOS('💃 Entregados')],
        etapas: [
          { clave: 'EN_TALLER', nombre: 'En taller', rol: 'ATENCION', color: GRIS },
          { clave: 'ARREGLADO', nombre: 'Arreglado', color: AZUL },
          { clave: 'ENTREGADO', nombre: 'Entregado a clienta', rol: 'ATENCION', color: VERDE, final: true },
        ] },
    ],
    mensajes: [
      { nombre: '🧵 Avisar: tela recibida', tipo: 'MEDIDA', etapa: 'TELA', asunto: 'Tu tela ya está aquí · {tienda}', texto: 'Hola {nombre_pila}, soy {usuario|el equipo} de {tienda}. Ya tenemos la tela de tu traje {producto}. Pasa a producción y te aviso cuando esté listo para la prueba.' },
      { nombre: '🧵 Avisar: en confección', tipo: 'MEDIDA', etapa: 'TALLER', asunto: 'Tu traje ya se está confeccionando · {tienda}', texto: 'Hola {nombre_pila}, tu traje {producto} ya está en confección. Te aviso en cuanto esté listo para la prueba.' },
      { nombre: '💄 Avisar: listo para probar', tipo: 'MEDIDA', etapa: 'EN_TIENDA', asunto: 'Tu traje está listo para probar · {tienda}', texto: 'Hola {nombre_pila}, tu traje {producto} ya está listo para probártelo. ¿Qué día te viene bien pasarte por la tienda?' },
      { nombre: '💬 Mensaje de entrega', tipo: 'MEDIDA', etapa: 'ENTREGADO', asunto: 'Tu traje de {tienda}', texto: '¡Hola {nombre_pila}! Esperamos que disfrutes muchísimo tu traje. Ha sido un placer hacerlo para ti.\n\n[[Si has quedado contenta, nos ayudas mucho con una reseña: {enlace_resena}\n\n]]¡Gracias por confiar en {tienda}!' },
      { nombre: '📏 Pedir medidas', asunto: 'Medidas para tu traje · {tienda}', texto: 'Hola {nombre_pila}, para empezar con tu traje {producto} necesitamos tus medidas. ¿Puedes pasarte esta semana por la tienda?' },
      { nombre: '⏱️ Avisar de un retraso', al_incidencia: true, asunto: 'Novedades de tu traje · {tienda}', texto: 'Hola {nombre_pila}, te escribo para avisarte de un pequeño retraso con tu traje {producto}: ahora está {estado}. Cualquier duda, dime.' },
      { nombre: '📲 Avisar: prenda arreglada', tipo: 'STOCK', etapa: 'ARREGLADO', canal: 'WHATSAPP', texto: '¡Hola {nombre_pila}! Tu traje ({producto}) ya está arreglado y listo para recoger. ¿Cuándo te viene bien pasar?' },
    ],
    productos: [{ nombre: 'Canastero 4 capas', consumo: 6.5 }, { nombre: 'Rociero', consumo: 8 }, { nombre: 'Sirena', consumo: 7 }, { nombre: 'Canastero 5 capas', consumo: 8.35 }],
    proveedores: ['Cortador', 'Taller de confección 1', 'Taller de confección 2', { nombre: 'Almacén de tejidos', tipo: 'MATERIAL', unidad_pedido: 50 }],
    materiales: [
      ...['Rosa palo', 'Verde agua', 'Rojo', 'Negro'].map((v) => ({ tipo: 'Bambula', variante: v, proveedor: 'Almacén de tejidos', unidad: 'm', umbral: 10, unidad_pedido: 50, resto_hasta: 5 })),
      { tipo: 'Georgette', variante: 'Lunares blanco sobre negro', proveedor: 'Almacén de tejidos', unidad: 'm', umbral: 10, unidad_pedido: 10, resto_hasta: 5, por_encargo: true },
    ],
  },
  {
    id: 'joyeria',
    nombre: 'Joyería a medida',
    descripcion: 'Piezas por encargo con boceto, taller de engaste o fundición y reparaciones.',
    vocab: { encargo: 'Encargo', encargos: 'Encargos', cliente: 'Cliente', clientes: 'Clientes', producto: 'Pieza', productos: 'Piezas', proveedor: 'Taller', proveedores: 'Talleres' },
    vocab_generos: { producto: 'f', proveedor: 'm' },
    roles: { OPERATIVO: 'Joyero', ATENCION: 'Mostrador', LOGISTICA: 'Recados' },
    ajustes: {
      dias_estancado: 7, color_primario: '#8A5A00', usar_importe: true,
      frases_etapa: { 'Consulta': 'en consulta', 'Diseño aprobado': 'con el diseño aprobado', 'Enviada al taller': 'en el taller', 'Terminada en taller': 'terminada, en revisión', 'Revisada y lista': 'lista para recoger', 'Recibida': 'recibida', 'Reparada': 'reparada, lista para recoger', 'Entregada': 'entregada' },
      lista_bandejas: [TODOS, bE('💬 Consultas', ['Consulta']), bE('✏️ Diseño aprobado', ['Diseño aprobado']), bE('🔨 En taller', ['Enviada al taller'], { accionable: false }), bE('🔍 Por revisar', ['Terminada en taller']), bE('💍 Listas', ['Revisada y lista', 'Reparada']), bE('🛠️ Reparaciones', ['Recibida']), REVISAR, TERMINADOS('Entregadas'), ANULADOS],
      inicio_tarjetas: [tB('Consultas abiertas', 'x-consultas'), tB('En taller', 'x-en-taller'), tB('Por revisar', 'x-por-revisar', 'warn'), tB('Listas para recoger', 'x-listas', 'ok'), INCIDENCIAS],
    },
    campos: {
      CLIENTE: [
        { clave: 'talla_anillo', etiqueta: 'Talla de anillo', tipo: 'numero', visible_proveedor: true, medida: true },
        { clave: 'muneca_cm', etiqueta: 'Contorno de muñeca', tipo: 'numero', visible_proveedor: true, medida: true, unidad: 'cm' },
        { clave: 'preferencias', etiqueta: 'Preferencias', tipo: 'texto' },
      ],
      ENCARGO: [
        { clave: 'metal', etiqueta: 'Metal', tipo: 'opcion', opciones: ['Oro amarillo 18k', 'Oro blanco 18k', 'Oro rosa 18k', 'Plata 925', 'Platino'], obligatorio: true, en_tabla: true, visible_proveedor: true },
        { clave: 'piedra', etiqueta: 'Piedra', tipo: 'texto', en_tabla: true, visible_proveedor: true },
        { clave: 'talla', etiqueta: 'Talla', tipo: 'numero', visible_proveedor: true },
        { clave: 'grabado', etiqueta: 'Grabado', tipo: 'texto', visible_proveedor: true },
        { clave: 'fecha_limite', etiqueta: 'Fecha que lo necesita', tipo: 'fecha', en_tabla: true },
        { clave: 'ocasion', etiqueta: 'Ocasión', tipo: 'opcion', opciones: ['Pedida', 'Boda', 'Aniversario', 'Regalo', 'Otra'] },
        { clave: 'presupuesto', etiqueta: 'Presupuesto (€)', tipo: 'numero' },
      ],
    },
    tipos: [
      { clave: 'MEDIDA', nombre: 'Pieza a medida', etapas: [
        { clave: 'CONSULTA', nombre: 'Consulta', rol: 'ATENCION', color: GRIS },
        { clave: 'DISENO', nombre: 'Diseño aprobado', rol: 'ATENCION', color: AMBAR, puertas: [
          { tipo: 'CAMPO_NO_VACIO', ref: 'metal', mensaje: 'Falta elegir el metal' },
          cobro('Boceto aprobado por el cliente', 'El cliente tiene que aprobar el boceto'),
          cobro('Señal cobrada', 'Falta cobrar la señal'),
        ] },
        { clave: 'EN_TALLER', nombre: 'Enviada al taller', color: MORADO, visible: true, espera: true, puertas: [
          { tipo: 'CAMPO_NO_VACIO', ref: 'proveedor_id', mensaje: 'Falta elegir el taller' },
          { tipo: 'CAMPO_NO_VACIO', ref: 'talla', mensaje: 'No hay talla: si es un anillo, el taller la necesita', dura: false },
        ] },
        { clave: 'TERMINADA', nombre: 'Terminada en taller', color: AZUL, visible: true, marca: true },
        { clave: 'LISTA', nombre: 'Revisada y lista', color: AZUL },
        { clave: 'ENTREGADA', nombre: 'Entregada', rol: 'ATENCION', color: VERDE, final: true, puertas: [
          cobro('Pago final cobrado', 'Falta cobrar el resto'),
          cobro('Certificado de garantía entregado', 'Recuerda dar el certificado de garantía', false),
        ] },
      ] },
      { clave: 'REPARACION', nombre: 'Reparación', campos: [
        { clave: 'reparar', etiqueta: 'Qué hay que reparar', tipo: 'texto', obligatorio: true, en_tabla: true, visible_proveedor: true },
      ], etapas: [
        { clave: 'RECIBIDA', nombre: 'Recibida', rol: 'ATENCION', color: GRIS },
        { clave: 'REPARADA', nombre: 'Reparada', color: AZUL },
        { clave: 'ENTREGADA', nombre: 'Entregada', rol: 'ATENCION', color: VERDE, final: true },
      ] },
    ],
    mensajes: [
      { nombre: 'Diseño para aprobar', texto: 'Hola {nombre_pila}, te enviamos el boceto de {tu_producto}. Cuando lo apruebes, empezamos. Un saludo desde {tienda}.' },
      LISTO('LISTA'), GRACIAS('ENTREGADA'), LISTO('REPARADA', 'REPARACION'),
    ],
    productos: [{ nombre: 'Solitario clásico', precio: 1450 }, { nombre: 'Alianza lisa', precio: 390 }],
  },
  {
    id: 'sastreria',
    nombre: 'Sastrería y confección a medida',
    descripcion: 'Prendas a medida con toma de medidas, fábrica o taller externo, prueba y arreglos.',
    vocab: { encargo: 'Pedido', encargos: 'Pedidos', cliente: 'Cliente', clientes: 'Clientes', producto: 'Prenda', productos: 'Prendas', proveedor: 'Fábrica', proveedores: 'Fábricas' },
    vocab_generos: { producto: 'f', proveedor: 'f' },
    ajustes: {
      ...MOD({ materiales: true }), usar_importe: true, material_unidad: 'm', material_pedir: 'falta', umbral_material_defecto: 5,
      frases_etapa: { 'Medidas tomadas': 'con las medidas tomadas', 'Tejido elegido': 'con el tejido elegido', 'Enviado a fábrica': 'en fábrica', 'Recibido en tienda': 'en tienda, listo para la prueba', 'Prueba hecha': 'con la prueba hecha', 'Recibido': 'recibido', 'Arreglado': 'arreglado', 'Entregado': 'entregado' },
      lista_bandejas: [TODOS, bE('📏 Medidas tomadas', ['Medidas tomadas']), bE('🧵 Tejido elegido', ['Tejido elegido']), PEDIR('📦 Pedir tejido'), bE('🏭 En fábrica', ['Enviado a fábrica'], { accionable: false }), bE('👔 Para probar', ['Recibido en tienda']), bE('✅ Para entregar', ['Prueba hecha', 'Arreglado']), bE('🪡 Arreglos', ['Recibido']), REVISAR, TERMINADOS('Entregados'), ANULADOS],
      inicio_tarjetas: [tB('En fábrica', 'x-en-fabrica'), tB('Para probar', 'x-para-probar', 'warn'), tB('Para entregar', 'x-para-entregar', 'ok'), tB('Arreglos', 'x-arreglos'), INCIDENCIAS],
    },
    campos: {
      CLIENTE: ['Cuello', 'Pecho', 'Cintura', 'Cadera', 'Hombros', 'Largo manga', 'Largo chaqueta', 'Entrepierna'].map((e) => ({
        clave: e.toLowerCase().replace(/ /g, '_'), etiqueta: e, tipo: 'numero' as const, visible_proveedor: true, medida: true, unidad: 'cm' })),
      ENCARGO: [
        { clave: 'tejido', etiqueta: 'Tejido', tipo: 'texto', en_tabla: true, visible_proveedor: true },
        { clave: 'forro', etiqueta: 'Forro', tipo: 'texto', visible_proveedor: true },
        { clave: 'fecha_evento', etiqueta: 'Fecha del evento', tipo: 'fecha', en_tabla: true },
      ],
    },
    tipos: [
      { clave: 'MEDIDA', nombre: 'A medida', etapas: [
        { clave: 'MEDIDAS', nombre: 'Medidas tomadas', rol: 'ATENCION', color: GRIS },
        { clave: 'TEJIDO', nombre: 'Tejido elegido', rol: 'ATENCION', color: AMBAR },
        { clave: 'EN_FABRICA', nombre: 'Enviado a fábrica', color: MORADO, visible: true, espera: true, puertas: [
          { tipo: 'CAMPO_NO_VACIO', ref: 'producto_id', mensaje: 'Falta la prenda' },
          { tipo: 'CAMPO_NO_VACIO', ref: 'proveedor_id', mensaje: 'Falta elegir la fábrica' },
          { tipo: 'CAMPO_NO_VACIO', ref: 'tejido', mensaje: 'Falta el tejido' },
          cobro('Señal cobrada', 'No se envía a fábrica sin cobrar la señal'),
        ] },
        { clave: 'RECIBIDO', nombre: 'Recibido en tienda', color: AZUL, visible: true },
        { clave: 'PRUEBA', nombre: 'Prueba hecha', rol: 'ATENCION', color: AZUL },
        { clave: 'ENTREGADO', nombre: 'Entregado', rol: 'ATENCION', color: VERDE, final: true, puertas: [cobro('Pago final cobrado', 'Falta cobrar el resto')] },
      ] },
      { clave: 'ARREGLO', nombre: 'Arreglo', campos: [{ clave: 'arreglo', etiqueta: 'Qué hay que hacer', tipo: 'texto', obligatorio: true, en_tabla: true }], etapas: [
        { clave: 'RECIBIDO', nombre: 'Recibido', rol: 'ATENCION', color: GRIS },
        { clave: 'ARREGLADO', nombre: 'Arreglado', color: AZUL },
        { clave: 'ENTREGADO', nombre: 'Entregado', rol: 'ATENCION', color: VERDE, final: true },
      ] },
    ],
    mensajes: [
      { nombre: 'Citar para prueba', tipo: 'MEDIDA', etapa: 'RECIBIDO', texto: 'Hola {nombre_pila}, {tu_producto} ha llegado. ¿Cuándo te viene bien pasar a probártel{o}?' },
      GRACIAS('ENTREGADO'), LISTO('ARREGLADO', 'ARREGLO'),
    ],
  },
  {
    id: 'arreglos',
    nombre: 'Arreglos y costura',
    descripcion: 'Muchos trabajos pequeños y rápidos: recibir la prenda, arreglarla (en casa o con una costurera), avisar y cobrar al recoger.',
    vocab: { encargo: 'Arreglo', encargos: 'Arreglos', cliente: 'Cliente', clientes: 'Clientes', producto: 'Servicio', productos: 'Servicios', proveedor: 'Costurera', proveedores: 'Costureras' },
    vocab_generos: { encargo: 'm', producto: 'm', proveedor: 'f' },
    roles: { OPERATIVO: 'Costura', ATENCION: 'Mostrador' },
    ajustes: {
      dias_estancado: 5, usar_importe: true,
      frases_etapa: { 'Recibido': 'recibido en tienda', 'En arreglo': 'en arreglo', 'Listo para recoger': 'listo para recoger', 'Entregado': 'entregado' },
      lista_bandejas: [TODOS, bE('📥 Por empezar', ['Recibido']), bE('🪡 En arreglo', ['En arreglo'], { accionable: false }), bE('✅ Listos para recoger', ['Listo para recoger']), REVISAR, TERMINADOS('Entregados'), ANULADOS],
      inicio_tarjetas: [tB('Por empezar', 'x-por-empezar', 'warn'), tB('En arreglo', 'x-en-arreglo'), tB('Listos para recoger', 'x-listos-para-recoger', 'ok'), INCIDENCIAS],
      pantallas: { ATENCION: ['parahoy', 'encargos', 'nuevo', 'clientes', 'productos'], OPERATIVO: ['parahoy', 'encargos'] },
    },
    campos: {
      ENCARGO: [
        { clave: 'prenda', etiqueta: 'Prenda', tipo: 'opcion', opciones: ['Pantalón', 'Falda', 'Vestido', 'Chaqueta', 'Camisa', 'Abrigo', 'Traje', 'Otra'], obligatorio: true, en_tabla: true, visible_proveedor: true },
        { clave: 'arreglo', etiqueta: 'Qué hay que hacer', tipo: 'texto', obligatorio: true, en_tabla: true, visible_proveedor: true },
        { clave: 'fecha_recogida', etiqueta: 'Para cuándo', tipo: 'fecha', en_tabla: true },
      ],
    },
    tipos: [{ clave: 'ARREGLO', nombre: 'Arreglo', etapas: [
      { clave: 'RECIBIDO', nombre: 'Recibido', rol: 'ATENCION', color: GRIS },
      { clave: 'EN_ARREGLO', nombre: 'En arreglo', color: MORADO, visible: true },
      { clave: 'LISTO', nombre: 'Listo para recoger', color: AMBAR, visible: true, marca: true },
      { clave: 'ENTREGADO', nombre: 'Entregado', rol: 'ATENCION', color: VERDE, final: true, puertas: [cobro('Cobrado', 'Falta cobrar el arreglo')] },
    ] }],
    mensajes: [
      { ...LISTO('LISTO', 'ARREGLO'), canal: 'WHATSAPP' },
      { nombre: 'Recordar que está pendiente de recoger', canal: 'WHATSAPP', texto: 'Hola {nombre_pila}, te recordamos que tu arreglo {numero} está listo en {tienda} desde hace unos días. ¡Te esperamos!' },
    ],
    productos: [{ nombre: 'Bajo de pantalón', precio: 8 }, { nombre: 'Cambiar cremallera', precio: 12 }, { nombre: 'Estrechar', precio: 15 }, { nombre: 'Acortar mangas', precio: 14 }],
  },
  {
    id: 'tapiceria',
    nombre: 'Tapicería',
    descripcion: 'Presupuesto, recogida del mueble, taller y entrega con montaje.',
    vocab: { encargo: 'Trabajo', encargos: 'Trabajos', cliente: 'Cliente', clientes: 'Clientes', producto: 'Tela', productos: 'Telas', proveedor: 'Taller', proveedores: 'Talleres' },
    vocab_generos: { encargo: 'm', producto: 'f', proveedor: 'm' },
    roles: { OPERATIVO: 'Tapicero', LOGISTICA: 'Transporte' },
    ajustes: {
      ...MOD({ logistica: true }), usar_importe: true, dias_estancado: 10,
      frases_etapa: { 'Presupuesto enviado': 'pendiente de aceptar el presupuesto', 'Aceptado': 'pendiente de recoger el mueble', 'Mueble recogido': 'en nuestro almacén', 'En taller': 'en el taller', 'Terminado': 'terminado, pendiente de entrega', 'Entregado y montado': 'entregado' },
      lista_bandejas: [TODOS, bE('📝 Presupuestos', ['Presupuesto enviado'], { accionable: false }), bE('🚚 Por recoger', ['Aceptado']), bE('📦 Recogidos', ['Mueble recogido']), bE('🔨 En taller', ['En taller'], { accionable: false }), bE('🛋️ Para entregar', ['Terminado']), REVISAR, TERMINADOS('Entregados'), ANULADOS],
      inicio_tarjetas: [tB('Presupuestos abiertos', 'x-presupuestos'), tB('Por recoger', 'x-por-recoger', 'warn'), tB('En taller', 'x-en-taller'), tB('Para entregar', 'x-para-entregar', 'ok'), INCIDENCIAS],
      pantallas: { LOGISTICA: ['logistica', 'parahoy', 'encargos', 'clientes'] },
    },
    campos: {
      ENCARGO: [
        { clave: 'mueble', etiqueta: 'Mueble', tipo: 'opcion', opciones: ['Sofá', 'Sillón', 'Silla', 'Cabecero', 'Banco', 'Otro'], obligatorio: true, en_tabla: true, visible_proveedor: true },
        { clave: 'plazas', etiqueta: 'Plazas / unidades', tipo: 'numero', visible_proveedor: true },
        { clave: 'espuma', etiqueta: 'Espuma', tipo: 'opcion', opciones: ['Mantener', 'Cambiar blanda', 'Cambiar media', 'Cambiar firme'], visible_proveedor: true },
        { clave: 'direccion', etiqueta: 'Dirección de recogida', tipo: 'texto' },
        { clave: 'fecha_entrega', etiqueta: 'Entrega prevista', tipo: 'fecha', en_tabla: true },
      ],
    },
    tipos: [{ clave: 'TAPIZADO', nombre: 'Tapizado', etapas: [
      { clave: 'PRESUPUESTO', nombre: 'Presupuesto enviado', rol: 'ATENCION', color: GRIS },
      { clave: 'ACEPTADO', nombre: 'Aceptado', rol: 'ATENCION', color: AMBAR, puertas: [
        { tipo: 'CAMPO_NO_VACIO', ref: 'producto_id', mensaje: 'Falta elegir la tela' },
        cobro('Señal cobrada', 'Falta cobrar la señal'),
      ] },
      { clave: 'RECOGIDO', nombre: 'Mueble recogido', rol: 'LOGISTICA', color: AZUL },
      { clave: 'EN_TALLER', nombre: 'En taller', color: MORADO, visible: true, espera: true, puertas: [{ tipo: 'CAMPO_NO_VACIO', ref: 'proveedor_id', mensaje: 'Falta elegir el taller' }] },
      { clave: 'TERMINADO', nombre: 'Terminado', color: AZUL, visible: true, marca: true },
      { clave: 'ENTREGADO', nombre: 'Entregado y montado', rol: 'LOGISTICA', color: VERDE, final: true, puertas: [cobro('Pago final cobrado', 'Falta cobrar el resto')] },
    ] }],
    mensajes: [
      { nombre: 'Enviar presupuesto', texto: 'Hola {nombre_pila}, te enviamos el presupuesto del trabajo {numero}. Cualquier duda, aquí estamos. {tienda}' },
      { nombre: 'Avisar: listo para entregar', tipo: 'TAPIZADO', etapa: 'TERMINADO', texto: 'Hola {nombre_pila}, tu trabajo {numero} está terminado. ¿Qué día te viene bien que lo llevemos?' },
      GRACIAS('ENTREGADO', 'TAPIZADO'),
    ],
  },
  {
    id: 'carpinteria',
    nombre: 'Carpintería y muebles a medida',
    descripcion: 'Medición, diseño, fabricación e instalación en casa del cliente.',
    vocab: { encargo: 'Proyecto', encargos: 'Proyectos', cliente: 'Cliente', clientes: 'Clientes', producto: 'Mueble', productos: 'Muebles', proveedor: 'Taller', proveedores: 'Talleres' },
    vocab_generos: { encargo: 'm', producto: 'm', proveedor: 'm' },
    roles: { OPERATIVO: 'Carpintero', LOGISTICA: 'Montaje' },
    ajustes: {
      ...MOD({ logistica: true }), usar_importe: true, dias_estancado: 15,
      frases_etapa: { 'Medición hecha': 'en diseño', 'Diseño aprobado': 'pendiente de fabricar', 'En fabricación': 'en fabricación', 'Fabricado': 'fabricado, pendiente de instalar', 'Instalado': 'instalado' },
      lista_bandejas: [TODOS, bE('📐 En diseño', ['Medición hecha']), bE('✅ Aprobados', ['Diseño aprobado']), bE('🪚 En fabricación', ['En fabricación'], { accionable: false }), bE('🚚 Para instalar', ['Fabricado']), REVISAR, TERMINADOS('Instalados'), ANULADOS],
      inicio_tarjetas: [tB('En diseño', 'x-en-diseno'), tB('En fabricación', 'x-en-fabricacion'), tB('Para instalar', 'x-para-instalar', 'ok'), INCIDENCIAS],
      pantallas: { LOGISTICA: ['logistica', 'parahoy', 'encargos', 'clientes'] },
    },
    campos: {
      ENCARGO: [
        { clave: 'estancia', etiqueta: 'Estancia', tipo: 'opcion', opciones: ['Cocina', 'Baño', 'Dormitorio', 'Salón', 'Oficina', 'Otra'], en_tabla: true, visible_proveedor: true },
        { clave: 'madera', etiqueta: 'Madera o tablero', tipo: 'texto', visible_proveedor: true },
        { clave: 'acabado', etiqueta: 'Acabado', tipo: 'texto', visible_proveedor: true },
        { clave: 'direccion', etiqueta: 'Dirección de instalación', tipo: 'texto' },
        { clave: 'fecha_instalacion', etiqueta: 'Instalación prevista', tipo: 'fecha', en_tabla: true },
      ],
    },
    tipos: [{ clave: 'PROYECTO', nombre: 'Proyecto a medida', etapas: [
      { clave: 'MEDICION', nombre: 'Medición hecha', rol: 'ATENCION', color: GRIS },
      { clave: 'DISENO', nombre: 'Diseño aprobado', rol: 'ATENCION', color: AMBAR, puertas: [cobro('Señal cobrada', 'Falta cobrar la señal')] },
      { clave: 'FABRICACION', nombre: 'En fabricación', color: MORADO, visible: true, espera: true, puertas: [{ tipo: 'CAMPO_NO_VACIO', ref: 'proveedor_id', mensaje: 'Falta elegir el taller' }, { tipo: 'CAMPO_NO_VACIO', ref: 'madera', mensaje: 'Falta elegir la madera', dura: false }] },
      { clave: 'FABRICADO', nombre: 'Fabricado', color: AZUL, visible: true, marca: true },
      { clave: 'INSTALADO', nombre: 'Instalado', rol: 'LOGISTICA', color: VERDE, final: true, puertas: [cobro('Pago final cobrado', 'Falta cobrar el resto')] },
    ] }],
    mensajes: [
      { nombre: 'Proponer fecha de instalación', tipo: 'PROYECTO', etapa: 'FABRICADO', texto: 'Hola {nombre_pila}, tu proyecto {numero} ya está fabricado. ¿Qué día te viene bien para la instalación?' },
      GRACIAS('INSTALADO', 'PROYECTO'),
    ],
  },
  {
    id: 'personalizacion',
    nombre: 'Personalización e imprenta',
    descripcion: 'Camisetas, sudaderas, tazas o vinilos personalizados: presupuesto, diseño aprobado, artículos en stock o pedidos, producción y entrega.',
    vocab: { encargo: 'Pedido', encargos: 'Pedidos', cliente: 'Cliente', clientes: 'Clientes', producto: 'Producto', productos: 'Productos', proveedor: 'Taller', proveedores: 'Talleres', material: 'Artículo', materiales: 'Artículos' },
    vocab_generos: { encargo: 'm', producto: 'm', proveedor: 'm', material: 'm' },
    roles: { OPERATIVO: 'Producción', ATENCION: 'Atención', LOGISTICA: 'Envíos' },
    ajustes: {
      ...MOD({ materiales: true, produccion: true }),
      dias_estancado: 5, usar_importe: true, material_unidad: 'uds', material_pedir: 'falta', material_menu_pedidos: true, umbral_material_defecto: 20,
      hoja_nombre: 'Hoja de producción', hoja_imp_cantidad: true, hoja_imp_cliente: true, hoja_imp_nota: true,
      frases_etapa: { 'Presupuesto enviado': 'pendiente de aprobar', 'Diseño aprobado': 'esperando los artículos', 'Artículos listos': 'en cola de producción', 'En producción': 'en producción', 'Listo': 'listo para entregar', 'Entregado': 'entregado' },
      lista_bandejas: [TODOS, bE('📝 Presupuestos', ['Presupuesto enviado'], { accionable: false }), bE('⏳ Esperando artículos', ['Diseño aprobado'], { llegadas: true }), PEDIR('📦 Pedir artículos'), bE('🖨️ Para producir', ['Artículos listos'], { lote_hoja: true }), bE('⚙️ En producción', ['En producción'], { accionable: false }), bE('✅ Listos', ['Listo']), REVISAR, TERMINADOS('Entregados'), ANULADOS],
      inicio_tarjetas: [tB('Presupuestos abiertos', 'x-presupuestos'), tB('Para producir', 'x-para-producir', 'warn'), tB('Listos para entregar', 'x-listos', 'ok'), INCIDENCIAS],
    },
    campos: {
      ENCARGO: [
        { clave: 'tecnica', etiqueta: 'Técnica', tipo: 'opcion', opciones: ['Serigrafía', 'Vinilo', 'Bordado', 'DTF', 'Sublimación', 'Grabado láser'], obligatorio: true, en_tabla: true, visible_proveedor: true },
        { clave: 'cantidad', etiqueta: 'Unidades', tipo: 'numero', en_tabla: true, visible_proveedor: true },
        { clave: 'tallas', etiqueta: 'Reparto de tallas', tipo: 'texto', visible_proveedor: true },
        { clave: 'ubicacion', etiqueta: 'Dónde va el diseño', tipo: 'texto', visible_proveedor: true },
        { clave: 'fecha_entrega', etiqueta: 'Fecha de entrega', tipo: 'fecha', en_tabla: true },
      ],
    },
    tipos: [{ clave: 'PEDIDO', nombre: 'Pedido personalizado', etapas: [
      { clave: 'PRESUPUESTO', nombre: 'Presupuesto enviado', rol: 'ATENCION', color: GRIS },
      { clave: 'APROBADO', nombre: 'Diseño aprobado', rol: 'ATENCION', color: AMBAR, puertas: [cobro('Diseño aprobado por el cliente', 'El cliente tiene que aprobar el diseño'), cobro('Señal cobrada', 'Falta cobrar la señal')] },
      { clave: 'ARTICULOS', nombre: 'Artículos listos', color: AMBAR, puertas: [{ tipo: 'MATERIAL', ref: 'material', mensaje: 'Faltan artículos por recibir' }] },
      { clave: 'PRODUCCION', nombre: 'En producción', color: MORADO, visible: true, espera: true, produccion: true },
      { clave: 'LISTO', nombre: 'Listo', color: AZUL, visible: true, marca: true },
      { clave: 'ENTREGADO', nombre: 'Entregado', rol: 'ATENCION', color: VERDE, final: true, puertas: [cobro('Pago final cobrado', 'Falta cobrar el resto')] },
    ] }],
    mensajes: [
      { nombre: 'Enviar presupuesto', tipo: 'PEDIDO', etapa: 'PRESUPUESTO', asunto: 'Presupuesto {numero} · {tienda}', texto: 'Hola {nombre_pila}, te enviamos el presupuesto y la prueba de diseño del pedido {numero}. Cuando nos des el visto bueno, empezamos.' },
      { ...LISTO('LISTO', 'PEDIDO'), asunto: 'Tu pedido {numero} está listo · {tienda}' },
      { nombre: 'Avisar de un retraso', al_incidencia: true, texto: 'Hola {nombre_pila}, tu pedido {numero} lleva un pequeño retraso: ahora está {estado}. Te avisamos en cuanto esté.' },
    ],
    productos: [{ nombre: 'Camiseta personalizada', precio: 12, consumo: 1, material_tipo: 'Camiseta' }, { nombre: 'Sudadera personalizada', precio: 28, consumo: 1, material_tipo: 'Sudadera' }, { nombre: 'Taza', precio: 9, consumo: 1, material_tipo: 'Taza' }],
    proveedores: [{ nombre: 'Mayorista textil', tipo: 'MATERIAL', unidad_pedido: 50 }, 'Taller de bordado'],
    materiales: [
      ...['Blanca', 'Negra'].map((v) => ({ tipo: 'Camiseta', variante: v, proveedor: 'Mayorista textil', unidad: 'uds', umbral: 20, unidad_pedido: 50 })),
      { tipo: 'Sudadera', variante: 'Gris', proveedor: 'Mayorista textil', unidad: 'uds', umbral: 10, unidad_pedido: 25 },
      { tipo: 'Taza', variante: 'Blanca', unidad: 'uds', umbral: 24, unidad_pedido: 36 },
    ],
  },
]

/** Datos que se envían a crear_tienda (sin id/nombre/descripción de la plantilla). */
export function datosPlantilla(p: PlantillaSector) {
  const { id: _i, nombre: _n, descripcion: _d, ...resto } = p
  return resto
}
