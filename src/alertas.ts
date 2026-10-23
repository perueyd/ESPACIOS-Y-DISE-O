/**
 * Alertas para el dueño (se mostrarán en el panel). No se duplica una alerta
 * abierta del mismo tipo para el mismo documento: se actualiza con lo último
 * (ej. stock bajo que pasa a negativo sube de AMARILLO a ROJO).
 */
import type { Db, Tx } from './db/conexion.js';

export type Severidad = 'VERDE' | 'AMARILLO' | 'ROJO';

export async function crearAlerta(
  q: Db | Tx,
  a: { empresaId: string; tipo: string; severidad: Severidad; mensaje: string; entidad?: string; entidadId?: string },
): Promise<void> {
  const valores = [a.empresaId, a.tipo, a.severidad, a.mensaje, a.entidad ?? null, a.entidadId ?? null];
  const abierta = await q.query(
    `UPDATE alertas SET severidad = $3, mensaje = $4
     WHERE empresa_id = $1 AND tipo = $2 AND entidad IS NOT DISTINCT FROM $5 AND entidad_id IS NOT DISTINCT FROM $6::uuid AND resuelta_en IS NULL`,
    valores,
  );
  if (abierta.rowCount === 0) {
    await q.query(`INSERT INTO alertas (empresa_id, tipo, severidad, mensaje, entidad, entidad_id) VALUES ($1, $2, $3, $4, $5, $6)`, valores);
  }
}
