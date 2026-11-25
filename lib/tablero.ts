'use client'

/**
 * Tablero del equipo: metas, tareas de cada persona y quién es quién.
 *
 * Vive aparte del store global a propósito. El store carga todo el negocio
 * al entrar (proyectos, cobros, caja…) y este tablero sólo hace falta en
 * su pantalla; sumarlo allá haría más lenta la carga de todas las demás.
 *
 * Las tablas salen de `supabase/28_tablero.sql`. Si todavía no se corrió,
 * `falta` queda en true y la pantalla dice qué hacer en vez de romperse.
 */

import * as React from 'react'
import { toast } from 'sonner'
import { createClient } from './supabase/client'
import { daysUntil } from './format'

export const ESTADOS_TAREA = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'bloqueada', label: 'Bloqueada' },
  { value: 'hecha', label: 'Hecha' },
] as const

export type EstadoTarea = (typeof ESTADOS_TAREA)[number]['value']
export type EstadoMeta = 'activa' | 'lograda' | 'archivada'

export function etiquetaEstado(e: EstadoTarea): string {
  return ESTADOS_TAREA.find((x) => x.value === e)?.label ?? e
}

export interface Miembro {
  userId: string
  nombre: string
}

export interface Meta {
  id: string
  titulo: string
  detalle: string
  fechaObjetivo: string | null
  estado: EstadoMeta
  createdAt: string
}

export interface TareaEquipo {
  id: string
  titulo: string
  detalle: string
  estado: EstadoTarea
  responsableId: string | null
  metaId: string | null
  projectId: string | null
  fechaLimite: string | null
  orden: number
  hechaAt: string | null
  createdAt: string
}

export type TareaInput = Pick<
  TareaEquipo,
  'titulo' | 'detalle' | 'estado' | 'responsableId' | 'metaId' | 'projectId' | 'fechaLimite'
>

export type MetaInput = Pick<Meta, 'titulo' | 'detalle' | 'fechaObjetivo' | 'estado'>

/* eslint-disable @typescript-eslint/no-explicit-any */
const aTarea = (r: any): TareaEquipo => ({
  id: r.id,
  titulo: r.titulo,
  detalle: r.detalle ?? '',
  estado: r.estado,
  responsableId: r.responsable_id,
  metaId: r.meta_id,
  projectId: r.project_id,
  fechaLimite: r.fecha_limite,
  orden: Number(r.orden),
  hechaAt: r.hecha_at,
  createdAt: r.created_at,
})

const aMeta = (r: any): Meta => ({
  id: r.id,
  titulo: r.titulo,
  detalle: r.detalle ?? '',
  fechaObjetivo: r.fecha_objetivo,
  estado: r.estado,
  createdAt: r.created_at,
})
/* eslint-enable @typescript-eslint/no-explicit-any */

const filaTarea = (t: TareaInput) => ({
  titulo: t.titulo.trim(),
  detalle: t.detalle.trim(),
  estado: t.estado,
  responsable_id: t.responsableId,
  meta_id: t.metaId,
  project_id: t.projectId,
  fecha_limite: t.fechaLimite,
})

const filaMeta = (m: MetaInput) => ({
  titulo: m.titulo.trim(),
  detalle: m.detalle.trim(),
  fecha_objetivo: m.fechaObjetivo,
  estado: m.estado,
})

/**
 * Qué tan apurada está una tarea, con la misma regla que los avisos del
 * servidor (`revisar_tareas()` en el paso 28): a 3 días o menos empieza a
 * avisar. Una tarea hecha o sin fecha nunca está apurada.
 */
export type Urgencia = 'vencida' | 'hoy' | 'pronto' | 'normal' | 'sin-fecha'

export function urgencia(t: Pick<TareaEquipo, 'estado' | 'fechaLimite'>): Urgencia {
  if (!t.fechaLimite) return 'sin-fecha'
  if (t.estado === 'hecha') return 'normal'
  const d = daysUntil(t.fechaLimite)
  if (d === null) return 'sin-fecha'
  if (d < 0) return 'vencida'
  if (d === 0) return 'hoy'
  if (d <= 3) return 'pronto'
  return 'normal'
}

/** Sin fecha al final; entre iguales, el orden en que se cargaron. */
export function porFecha(a: TareaEquipo, b: TareaEquipo): number {
  if (a.fechaLimite && b.fechaLimite && a.fechaLimite !== b.fechaLimite) {
    return a.fechaLimite < b.fechaLimite ? -1 : 1
  }
  if (a.fechaLimite && !b.fechaLimite) return -1
  if (!a.fechaLimite && b.fechaLimite) return 1
  return a.orden - b.orden
}

export function avanceDeMeta(metaId: string, tareas: TareaEquipo[]) {
  const suyas = tareas.filter((t) => t.metaId === metaId)
  const hechas = suyas.filter((t) => t.estado === 'hecha').length
  return {
    total: suyas.length,
    hechas,
    porcentaje: suyas.length ? Math.round((hechas / suyas.length) * 100) : 0,
  }
}

const esTablaFaltante = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist/i.test(e.message ?? ''))

export function useTablero() {
  const supabase = React.useMemo(() => createClient(), [])
  const [cargando, setCargando] = React.useState(true)
  const [falta, setFalta] = React.useState(false)
  const [yo, setYo] = React.useState<string | null>(null)
  const [miembros, setMiembros] = React.useState<Miembro[]>([])
  const [metas, setMetas] = React.useState<Meta[]>([])
  const [tareas, setTareas] = React.useState<TareaEquipo[]>([])

  const fallo = React.useCallback((accion: string, e: unknown) => {
    const message = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e)
    console.error(`[tablero] ${accion}:`, e)
    toast.error(`No se pudo ${accion}`, { description: message })
  }, [])

  const refrescar = React.useCallback(async () => {
    const [u, mi, me, ta] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('miembros').select('*').order('nombre'),
      supabase.from('metas').select('*').order('fecha_objetivo', { ascending: true, nullsFirst: false }),
      supabase.from('tareas_equipo').select('*').order('orden'),
    ])
    setYo(u.data.user?.id ?? null)

    if ([mi.error, me.error, ta.error].some(esTablaFaltante)) {
      setFalta(true)
      setCargando(false)
      return
    }
    const error = mi.error ?? me.error ?? ta.error
    if (error) {
      fallo('cargar el tablero', error)
      setCargando(false)
      return
    }
    setFalta(false)
    setMiembros((mi.data ?? []).map((r) => ({ userId: r.user_id, nombre: r.nombre })))
    setMetas((me.data ?? []).map(aMeta))
    setTareas((ta.data ?? []).map(aTarea))
    setCargando(false)
  }, [supabase, fallo])

  React.useEffect(() => {
    void refrescar()
    // Varias personas usan el mismo tablero: al volver a la pestaña se trae
    // lo que hayan cambiado los demás mientras tanto.
    const alVolver = () => {
      if (document.visibilityState === 'visible') void refrescar()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [refrescar])

  const guardarTarea = React.useCallback(
    async (input: TareaInput, id?: string): Promise<boolean> => {
      const fila = filaTarea(input)
      const { data, error } = id
        ? await supabase.from('tareas_equipo').update(fila).eq('id', id).select().single()
        : await supabase.from('tareas_equipo').insert(fila).select().single()
      if (error) {
        fallo(id ? 'guardar la tarea' : 'crear la tarea', error)
        return false
      }
      const t = aTarea(data)
      setTareas((prev) => (id ? prev.map((x) => (x.id === id ? t : x)) : [...prev, t]))
      return true
    },
    [supabase, fallo],
  )

  /** Mover de columna: se ve al instante y se deshace si la base lo rechaza. */
  const moverTarea = React.useCallback(
    async (id: string, estado: EstadoTarea): Promise<boolean> => {
      const antes = tareas.find((t) => t.id === id)
      if (!antes || antes.estado === estado) return true
      setTareas((prev) => prev.map((t) => (t.id === id ? { ...t, estado } : t)))
      const { data, error } = await supabase
        .from('tareas_equipo')
        .update({ estado })
        .eq('id', id)
        .select()
        .single()
      if (error) {
        setTareas((prev) => prev.map((t) => (t.id === id ? antes : t)))
        fallo('mover la tarea', error)
        return false
      }
      const t = aTarea(data)
      setTareas((prev) => prev.map((x) => (x.id === id ? t : x)))
      return true
    },
    [supabase, fallo, tareas],
  )

  const borrarTarea = React.useCallback(
    async (id: string): Promise<boolean> => {
      const { error } = await supabase.from('tareas_equipo').delete().eq('id', id)
      if (error) {
        fallo('borrar la tarea', error)
        return false
      }
      setTareas((prev) => prev.filter((t) => t.id !== id))
      return true
    },
    [supabase, fallo],
  )

  const guardarMeta = React.useCallback(
    async (input: MetaInput, id?: string): Promise<boolean> => {
      const fila = filaMeta(input)
      const { data, error } = id
        ? await supabase.from('metas').update(fila).eq('id', id).select().single()
        : await supabase.from('metas').insert(fila).select().single()
      if (error) {
        fallo(id ? 'guardar la meta' : 'crear la meta', error)
        return false
      }
      const m = aMeta(data)
      setMetas((prev) => (id ? prev.map((x) => (x.id === id ? m : x)) : [...prev, m]))
      return true
    },
    [supabase, fallo],
  )

  /** Borrar una meta no borra sus tareas: quedan sueltas (FK set null). */
  const borrarMeta = React.useCallback(
    async (id: string): Promise<boolean> => {
      const { error } = await supabase.from('metas').delete().eq('id', id)
      if (error) {
        fallo('borrar la meta', error)
        return false
      }
      setMetas((prev) => prev.filter((m) => m.id !== id))
      setTareas((prev) => prev.map((t) => (t.metaId === id ? { ...t, metaId: null } : t)))
      return true
    },
    [supabase, fallo],
  )

  const cambiarMiNombre = React.useCallback(
    async (nombre: string): Promise<boolean> => {
      if (!yo) return false
      const limpio = nombre.trim()
      const { error } = await supabase.from('miembros').update({ nombre: limpio }).eq('user_id', yo)
      if (error) {
        fallo('cambiar tu nombre', error)
        return false
      }
      setMiembros((prev) =>
        prev
          .map((m) => (m.userId === yo ? { ...m, nombre: limpio } : m))
          .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      )
      return true
    },
    [supabase, fallo, yo],
  )

  return {
    cargando,
    falta,
    yo,
    miembros,
    metas,
    tareas,
    refrescar,
    guardarTarea,
    moverTarea,
    borrarTarea,
    guardarMeta,
    borrarMeta,
    cambiarMiNombre,
  }
}

export type Tablero = ReturnType<typeof useTablero>
