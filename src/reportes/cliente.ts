/**
 * Historial de un cliente por su número de documento: comprobantes, total comprado
 * (menos notas de crédito) y saldo pendiente. Excluye rechazados y anulados.
 */
import { sqlSaldo } from '../cobros/pagos.js';
import { Decimal, dec, sumar } from '../dinero.js';
import type { Db } from '../db/conexion.js';
import { idComprobanteLegible } from '../tipos.js';

export interface HistorialCliente {
  cliente: { tipoDocumento: string; numero: string; nombre: string };
  comprobantes: { numero: string; tipo: string; fecha: string; total: string; estado: string; estadoPago: string; saldo: string }[];
  totalComprado: string;
  saldoPendiente: string;
}

export async function historialCliente(db: Db, empresaId: string, numeroDoc: string): Promise<HistorialCliente | undefined> {
  const cli = await db.query(
    `SELECT id, tipo_doc_identidad, numero_doc, nombre_razon_social FROM clientes WHERE empresa_id = $1 AND numero_doc = $2`,
    [empresaId, numeroDoc.trim()],
  );
  const c = cli.rows[0];
  if (!c) return undefined;
  const r = await db.query(
    `SELECT c.tipo_comprobante AS tipo, c.serie, c.numero, c.fecha_emision::text AS fecha, c.importe_total::text AS total,
            c.estado::text, c.estado_pago::text AS estado_pago,
            CASE WHEN c.tipo_comprobante = '07' THEN 0 ELSE ${sqlSaldo('c')} END::text AS saldo
     FROM comprobantes c
     WHERE c.empresa_id = $1 AND c.cliente_id = $2 AND c.estado NOT IN ('RECHAZADO', 'ANULADO')
     ORDER BY c.fecha_emision, c.serie, c.numero`,
    [empresaId, c.id],
  );
  const comprobantes = r.rows.map((f) => ({
    numero: idComprobanteLegible(f.serie, Number(f.numero)), tipo: f.tipo as string, fecha: f.fecha as string,
    total: dec(f.total).toFixed(2), estado: f.estado as string, estadoPago: f.estado_pago as string, saldo: dec(f.saldo).toFixed(2),
  }));
  const comprado = comprobantes.reduce((a, x) => (x.tipo === '07' ? a.minus(x.total) : a.plus(x.total)), new Decimal(0));
  return {
    cliente: { tipoDocumento: c.tipo_doc_identidad, numero: c.numero_doc, nombre: c.nombre_razon_social },
    comprobantes,
    totalComprado: comprado.toFixed(2),
    saldoPendiente: sumar(comprobantes.map((x) => dec(x.saldo))).toFixed(2),
  };
}
