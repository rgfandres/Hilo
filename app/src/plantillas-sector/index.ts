/**
 * Plantillas de sector para el alta de tienda. Son DATOS de partida: la tienda
 * queda con esto montado y lo cambia todo después en Ajustes.
 * (Esta carpeta está excluida del detector de fugas: aquí sí van palabras de cada sector.)
 */

type Campo = { clave: string; etiqueta: string; tipo: 'texto' | 'numero' | 'fecha' | 'opcion'; opciones?: string[]; obligatorio?: boolean; en_tabla?: boolean; visible_proveedor?: boolean }
type Puerta = { tipo: 'HITO_PREVIO' | 'CAMPO_NO_VACIO' | 'CHECK'; ref: string; mensaje: string; dura?: boolean; etiqueta?: string }
type Etapa = { clave: string; nombre: string; rol?: 'ADMIN' | 'OPERATIVO' | 'ATENCION' | 'LOGISTICA'; color?: string; visible?: boolean; marca?: boolean; espera?: boolean; final?: boolean; puertas?: Puerta[] }
export interface PlantillaSector {
  id: string
  nombre: string
  descripcion: string
  vocab?: Record<string, string>
  vocab_generos?: Record<string, 'm' | 'f'>
  roles?: Record<string, string>
  ajustes?: Record<string, unknown>
  campos?: { CLIENTE?: Campo[]; ENCARGO?: Campo[]; PRODUCTO?: Campo[] }
  tipos: { clave: string; nombre: string; campos?: Campo[]; etapas: Etapa[] }[]
  mensajes?: { nombre: string; texto: string; tipo?: string; etapa?: string; canal?: 'WHATSAPP' | 'EMAIL' | 'AMBOS' }[]
  productos?: { nombre: string; precio?: number }[]
  proveedores?: string[]
}

const GRIS = '#999999', AMBAR = '#C98A00', AZUL = '#2B4C9B', MORADO = '#5A3E96', VERDE = '#1E6B3C'
const cobro = (etiqueta: string, mensaje: string, dura = true): Puerta => ({ tipo: 'CHECK', ref: etiqueta.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_'), etiqueta, mensaje, dura })
const LISTO = (etapa: string, tipo = 'MEDIDA') => ({ nombre: 'Avisar: ya está listo', tipo, etapa, texto: 'Hola {nombre_pila}, ¡{tu_producto} ya está list{o}! Puedes pasar a recogerl{o} cuando quieras por {tienda}.' })
const GRACIAS = (etapa: string, tipo = 'MEDIDA') => ({ nombre: 'Agradecer', tipo, etapa, texto: 'Gracias, {nombre_pila}. Esperamos que disfrutes {tu_producto}. Si te apetece, nos ayuda mucho una reseña: {enlace_resena}' })

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
    id: 'joyeria',
    nombre: 'Joyería a medida',
    descripcion: 'Piezas por encargo con boceto, taller de engaste o fundición y reparaciones.',
    vocab: { encargo: 'Encargo', encargos: 'Encargos', cliente: 'Cliente', clientes: 'Clientes', producto: 'Pieza', productos: 'Piezas', proveedor: 'Taller', proveedores: 'Talleres' },
    vocab_generos: { producto: 'f', proveedor: 'm' },
    roles: { OPERATIVO: 'Joyero', ATENCION: 'Mostrador', LOGISTICA: 'Recados' },
    ajustes: { dias_estancado: 7, color_primario: '#8A5A00' },
    campos: {
      CLIENTE: [
        { clave: 'talla_anillo', etiqueta: 'Talla de anillo', tipo: 'numero', visible_proveedor: true },
        { clave: 'muneca_cm', etiqueta: 'Contorno de muñeca (cm)', tipo: 'numero', visible_proveedor: true },
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
    campos: {
      CLIENTE: ['Cuello', 'Pecho', 'Cintura', 'Cadera', 'Hombros', 'Largo manga', 'Largo chaqueta', 'Entrepierna'].map((e) => ({
        clave: e.toLowerCase().replace(/ /g, '_'), etiqueta: e, tipo: 'numero' as const, visible_proveedor: true })),
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
    id: 'tapiceria',
    nombre: 'Tapicería',
    descripcion: 'Presupuesto, recogida del mueble, taller y entrega con montaje.',
    vocab: { encargo: 'Trabajo', encargos: 'Trabajos', cliente: 'Cliente', clientes: 'Clientes', producto: 'Tela', productos: 'Telas', proveedor: 'Taller', proveedores: 'Talleres' },
    vocab_generos: { encargo: 'm', producto: 'f', proveedor: 'm' },
    roles: { OPERATIVO: 'Tapicero', LOGISTICA: 'Transporte' },
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
      { clave: 'EN_TALLER', nombre: 'En taller', color: MORADO, visible: true, espera: true },
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
    campos: {
      ENCARGO: [
        { clave: 'estancia', etiqueta: 'Estancia', tipo: 'opcion', opciones: ['Cocina', 'Baño', 'Dormitorio', 'Salón', 'Oficina', 'Otra'], en_tabla: true, visible_proveedor: true },
        { clave: 'material', etiqueta: 'Material', tipo: 'texto', visible_proveedor: true },
        { clave: 'acabado', etiqueta: 'Acabado', tipo: 'texto', visible_proveedor: true },
        { clave: 'direccion', etiqueta: 'Dirección de instalación', tipo: 'texto' },
        { clave: 'fecha_instalacion', etiqueta: 'Instalación prevista', tipo: 'fecha', en_tabla: true },
      ],
    },
    tipos: [{ clave: 'PROYECTO', nombre: 'Proyecto a medida', etapas: [
      { clave: 'MEDICION', nombre: 'Medición hecha', rol: 'ATENCION', color: GRIS },
      { clave: 'DISENO', nombre: 'Diseño aprobado', rol: 'ATENCION', color: AMBAR, puertas: [cobro('Señal cobrada', 'Falta cobrar la señal')] },
      { clave: 'FABRICACION', nombre: 'En fabricación', color: MORADO, visible: true, espera: true, puertas: [{ tipo: 'CAMPO_NO_VACIO', ref: 'material', mensaje: 'Falta el material', dura: false }] },
      { clave: 'FABRICADO', nombre: 'Fabricado', color: AZUL, visible: true, marca: true },
      { clave: 'INSTALADO', nombre: 'Instalado', rol: 'LOGISTICA', color: VERDE, final: true, puertas: [cobro('Pago final cobrado', 'Falta cobrar el resto')] },
    ] }],
    mensajes: [
      { nombre: 'Proponer fecha de instalación', tipo: 'PROYECTO', etapa: 'FABRICADO', texto: 'Hola {nombre_pila}, tu proyecto {numero} ya está fabricado. ¿Qué día te viene bien para la instalación?' },
      GRACIAS('INSTALADO', 'PROYECTO'),
    ],
  },
]

/** Datos que se envían a crear_tienda (sin id/nombre/descripción de la plantilla). */
export function datosPlantilla(p: PlantillaSector) {
  const { id: _i, nombre: _n, descripcion: _d, ...resto } = p
  return resto
}
