export type Rol = 'ADMIN' | 'OPERATIVO' | 'LOGISTICA' | 'ATENCION'
export type TipoHito = 'NORMAL' | 'INCIDENCIA' | 'REENTRADA'

export interface Tienda {
  id: string
  nombre: string
  ajustes: { color_primario?: string; dias_estancado?: number; [k: string]: unknown }
}

export interface Miembro { tienda_id: string; user_id: string; email: string; rol: Rol; activo: boolean }

export interface Etapa {
  id: string
  tienda_id: string
  tipo_encargo_id: string
  orden: number
  clave: string
  nombre: string
  rol_ejecuta: Rol
  visible_para_proveedor: boolean
  marca_proveedor?: boolean
  es_final: boolean
  es_espera: boolean
  color: string | null
  grupo?: string | null
}

export interface Puerta { mensaje: string; dura: boolean; tipo?: 'HITO_PREVIO' | 'CAMPO_NO_VACIO' | 'CHECK' | 'MATERIAL'; referencia?: string }

/** Fila de v_encargo_estado */
export interface EncargoEstado {
  id: string
  tienda_id: string
  periodo_id: string | null
  tipo_encargo_id: string
  numero: number
  cliente_id: string
  producto_id: string | null
  proveedor_id: string | null
  estado: 'ACTIVO' | 'ANULADO'
  datos: Record<string, unknown>
  importe: number | null
  complementos?: string | null
  a_cuenta: number
  creado_en: string
  actualizado_en: string
  etapa_actual_id: string | null
  etapa_actual_clave: string | null
  etapa_actual_nombre: string | null
  etapa_actual_orden: number | null
  es_final: boolean | null
  etapa_siguiente_id: string | null
  etapa_siguiente_clave: string | null
  etapa_siguiente_nombre: string | null
  etapa_siguiente_rol: Rol | null
  en_revision: boolean
  estancado: boolean
  cliente_nombre: string | null
  producto_nombre: string | null
  proveedor_nombre: string | null
  puertas_pendientes: Puerta[]
  cliente_telefono: string | null
  tipo_nombre: string | null
  etapa_grupo: string | null
  es_espera: boolean
  siguiente_es_final: boolean
  en_proveedor: boolean
  dias_en_etapa: number | null
  atascado: boolean
  revisar_manual: boolean
  revisar_nota: string | null
  n_comentarios: number
  serie: string
}

export interface Hito {
  id: string
  encargo_id: string
  etapa_id: string
  tipo: TipoHito
  fecha: string
  usuario_id: string | null
  nota: string | null
  deshecho_en: string | null
  resuelto_en?: string | null
  resolucion?: string | null
  etapa?: Pick<Etapa, 'clave' | 'nombre' | 'color' | 'orden'>
}

export interface Comentario { id: string; encargo_id: string; usuario_id: string | null; texto: string; fecha: string }

export interface Cliente {
  id: string; tienda_id: string; nombre: string; telefono: string | null; email: string | null
  datos: Record<string, unknown>; notas: string | null
}

export interface Periodo { id: string; nombre: string }
