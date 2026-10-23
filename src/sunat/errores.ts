/**
 * Traduce los códigos de SUNAT a mensajes en español simple, diciendo qué corregir.
 * Fuente: tabla sunat_errores (lista oficial de códigos de retorno + explicaciones propias).
 */
import type { Db, Tx } from '../db/conexion.js';

export type TipoCodigo = 'EXCEPCION' | 'RECHAZO' | 'OBSERVACION';

export interface CodigoExplicado {
  codigo: string;
  tipo: TipoCodigo;
  reintentable: boolean;
  /** Mensaje listo para mostrar a una persona. */
  mensaje: string;
}

/** Códigos que indican que SUNAT YA tiene ese comprobante: no se reenvía, se revisa. */
export const CODIGOS_YA_REGISTRADO = new Set(['1032', '1033', '2223', '2324']);

export function tipoPorRango(codigo: string): TipoCodigo {
  const n = Number(codigo);
  if (Number.isInteger(n) && n >= 4000) return 'OBSERVACION';
  if (Number.isInteger(n) && n >= 2000) return 'RECHAZO';
  return 'EXCEPCION';
}

const QUE_HACER_POR_TIPO: Record<TipoCodigo, string> = {
  EXCEPCION: 'SUNAT no procesó el envío. Revisa la configuración o avisa a soporte técnico.',
  RECHAZO: 'Corrige el dato indicado y emite un comprobante nuevo (el rechazado no tiene validez).',
  OBSERVACION: 'El comprobante es válido; corrige el dato en los próximos comprobantes.',
};

export async function explicarCodigo(q: Db | Tx, codigo: string, mensajeSunat = ''): Promise<CodigoExplicado> {
  const r = await q.query(
    `SELECT mensaje_oficial, explicacion_es, que_corregir, tipo, reintentable FROM sunat_errores WHERE codigo = $1`,
    [codigo],
  );
  const f = r.rows[0];
  const tipo = (f?.tipo as TipoCodigo | undefined) ?? tipoPorRango(codigo);
  const explicacion = (f?.explicacion_es as string | null) ?? (f?.mensaje_oficial as string | undefined) ?? (mensajeSunat || 'Error no catalogado');
  const queHacer = (f?.que_corregir as string | null) ?? QUE_HACER_POR_TIPO[tipo];
  return {
    codigo,
    tipo,
    reintentable: Boolean(f?.reintentable),
    mensaje: `Código ${codigo}: ${explicacion} Qué hacer: ${queHacer}`,
  };
}
