/**
 * Stock por producto = suma de sus movimientos.
 *   Venta (factura/boleta)            → sale  (−cantidad)
 *   Nota de crédito por devolución    → entra (+cantidad)   motivos 06 y 07
 *   Anulación aceptada por SUNAT      → revierte los movimientos del comprobante
 *   Compra a proveedor                → entra (+cantidad) y actualiza el costo promedio
 *   Ajuste manual                     → con motivo obligatorio
 * Solo afecta a productos con `controla_stock` (los muebles a pedido pueden no controlarlo).
 * Vender sin stock NO se bloquea (puede ser a pedido): se avisa con una alerta.
 */
import { crearAlerta } from '../alertas.js';
import { dec, type Decimal } from '../dinero.js';
import type { Db, Tx } from '../db/conexion.js';

/** Motivos de nota de crédito que implican que el producto volvió (catálogo 09). */
const MOTIVOS_DEVOLUCION = new Set(['06', '07']);

export interface ProductoVendido {
  id: string;
  controlaStock: boolean;
  costoPromedio: string | null;
}

/** Busca los productos por código (SKU, en mayúsculas) para enlazar los ítems de un comprobante. */
export async function productosPorSku(tx: Tx, empresaId: string, skus: string[]): Promise<Map<string, ProductoVendido>> {
  if (skus.length === 0) return new Map();
  const r = await tx.query(
    `SELECT id, sku, controla_stock, costo_promedio FROM productos WHERE empresa_id = $1 AND sku = ANY($2::text[]) AND activo`,
    [empresaId, skus.map((s) => s.toUpperCase())],
  );
  return new Map(r.rows.map((f) => [f.sku as string, { id: f.id, controlaStock: f.controla_stock, costoPromedio: f.costo_promedio }]));
}

/** Movimientos de una venta o de una nota de crédito por devolución (dentro de la emisión). */
export async function moverStockPorComprobante(
  tx: Tx,
  d: { empresaId: string; comprobanteId: string; tipoComprobante: string; motivoNota?: string; items: { producto?: ProductoVendido; cantidad: Decimal }[] },
): Promise<void> {
  const esVenta = d.tipoComprobante === '01' || d.tipoComprobante === '03';
  const esDevolucion = d.tipoComprobante === '07' && MOTIVOS_DEVOLUCION.has(d.motivoNota ?? '');
  if (!esVenta && !esDevolucion) return;
  const afectados: string[] = [];
  for (const it of d.items) {
    if (!it.producto?.controlaStock) continue;
    await tx.query(
      `INSERT INTO movimientos_stock (empresa_id, producto_id, tipo, cantidad, costo_unitario, comprobante_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [d.empresaId, it.producto.id, esVenta ? 'VENTA' : 'DEVOLUCION', (esVenta ? it.cantidad.neg() : it.cantidad).toString(), it.producto.costoPromedio, d.comprobanteId],
    );
    afectados.push(it.producto.id);
  }
  await revisarStock(tx, d.empresaId, afectados);
}

/** Al anularse un comprobante en SUNAT, sus movimientos se revierten (sin borrar nada). */
export async function revertirStockDe(tx: Tx, comprobanteId: string): Promise<void> {
  const r = await tx.query(
    `INSERT INTO movimientos_stock (empresa_id, producto_id, tipo, cantidad, costo_unitario, comprobante_id, motivo)
     SELECT empresa_id, producto_id, 'ANULACION', -cantidad, costo_unitario, comprobante_id, 'Comprobante anulado en SUNAT'
     FROM movimientos_stock WHERE comprobante_id = $1 AND tipo IN ('VENTA', 'DEVOLUCION')
     RETURNING empresa_id, producto_id`,
    [comprobanteId],
  );
  if (r.rows[0]) await revisarStock(tx, r.rows[0].empresa_id, r.rows.map((f) => f.producto_id as string));
}

/** Stock actual = suma de movimientos. */
export async function stockDe(q: Db | Tx, productoId: string): Promise<Decimal> {
  const r = await q.query(`SELECT coalesce(sum(cantidad), 0)::text AS stock FROM movimientos_stock WHERE producto_id = $1`, [productoId]);
  return dec(r.rows[0].stock as string);
}

/**
 * Avisa si un producto quedó en o bajo su stock mínimo (AMARILLO) o negativo (ROJO), y
 * cierra la alerta cuando el stock se recupera.
 */
export async function revisarStock(tx: Tx, empresaId: string, productoIds: string[]): Promise<void> {
  for (const id of new Set(productoIds)) {
    const r = await tx.query(
      `SELECT p.sku, p.nombre, p.stock_minimo, coalesce(sum(m.cantidad), 0)::text AS stock
       FROM productos p LEFT JOIN movimientos_stock m ON m.producto_id = p.id
       WHERE p.id = $1 GROUP BY p.id`,
      [id],
    );
    const f = r.rows[0];
    if (!f) continue;
    const stock = dec(f.stock as string);
    const minimo = f.stock_minimo === null ? undefined : dec(f.stock_minimo as string);
    const bajo = stock.isNegative() || (minimo !== undefined && stock.lte(minimo));
    if (bajo) {
      await crearAlerta(tx, {
        empresaId, tipo: 'STOCK_BAJO', severidad: stock.isNegative() ? 'ROJO' : 'AMARILLO', entidad: 'productos', entidadId: id,
        mensaje: stock.isNegative()
          ? `${f.nombre} (${f.sku}) tiene stock negativo (${stock.toString()}): se vendió más de lo registrado. Revisa compras o ajustes.`
          : `${f.nombre} (${f.sku}) quedó con ${stock.toString()} unidades (mínimo ${minimo!.toString()}). Considera reponer.`,
      });
    } else {
      await tx.query(
        `UPDATE alertas SET resuelta_en = now() WHERE empresa_id = $1 AND tipo = 'STOCK_BAJO' AND entidad_id = $2 AND resuelta_en IS NULL`,
        [empresaId, id],
      );
    }
  }
}
