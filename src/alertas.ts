/**
 * Alertas para el dueño (se mostrarán en el panel). No se duplica una alerta
 * abierta del mismo tipo para el mismo documento.
 */
import type { Db, Tx } from './db/conexion.js';

export type Severidad = 'VERDE' | 'AMARILLO' | 'ROJO';

export async function crearAlerta(
  q: Db | Tx,
  a: { empresaId: string; tipo: string; severidad: Severidad; mensaje: string; entidad?: string; entidadId?: string },
): Promise<void> {
  await q.query(
    `INSERT INTO alertas (empresa_id, tipo, severidad, mensaje, entidad, entidad_id)
     SELECT $1, $2, $3, $4, $5, $6
     WHERE NOT EXISTS (
       SELECT 1 FROM alertas WHERE empresa_id = $1 AND tipo = $2 AND entidad_id IS NOT DISTINCT FROM $6::uuid AND resuelta_en IS NULL)`,
    [a.empresaId, a.tipo, a.severidad, a.mensaje, a.entidad ?? null, a.entidadId ?? null],
  );
}
