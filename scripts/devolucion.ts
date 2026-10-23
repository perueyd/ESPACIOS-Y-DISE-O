/**
 * Devolución de productos: emite la nota de crédito, devuelve el stock y registra el reembolso.
 *
 *   npm run devolucion -- --ruc 20XXXXXXXXX --comprobante B001-15 --items 1:1,2:2 \
 *       --motivo "Cliente devolvió la cabecera" [--danados 2] \
 *       [--reembolso YAPE] [--monto 150.00] [--referencia 00123456]
 *
 *   --items      línea:cantidad, separados por comas (la línea es el nº de ítem del comprobante)
 *   --danados    líneas que volvieron dañadas: no regresan al stock vendible
 *   --reembolso  medio con el que devolviste el dinero; sin --monto, el total de la nota
 */
import { parseArgs } from 'node:util';
import { MEDIOS_PAGO, type MedioPago } from '../src/cobros/pagos.js';
import { procesarAhora } from '../src/cola/procesar.js';
import { serviciosDesdeEntorno } from '../src/config.js';
import { crearPool } from '../src/db/conexion.js';
import { registrarDevolucion } from '../src/devoluciones/devoluciones.js';
import { empresaPorRuc } from './lib/consola.js';

const texto = { type: 'string' as const };
const { values: v } = parseArgs({
  options: { ruc: texto, comprobante: texto, items: texto, motivo: texto, danados: texto, reembolso: texto, monto: texto, referencia: texto },
});
const ref = /^([FB][A-Z0-9]{3})-(\d{1,8})$/i.exec(v.comprobante ?? '');
if (!v.ruc || !ref || !v.items || !v.motivo) {
  console.error('Uso: ver el encabezado de scripts/devolucion.ts');
  process.exit(1);
}

const db = crearPool();
try {
  const { id: empresaId } = await empresaPorRuc(db, v.ruc);
  const c = await db.query(
    `SELECT id FROM comprobantes WHERE empresa_id = $1 AND serie = $2 AND numero = $3 AND tipo_comprobante IN ('01', '03')`,
    [empresaId, ref[1]!.toUpperCase(), Number(ref[2])],
  );
  if (!c.rows[0]) throw new Error(`No existe la factura o boleta ${v.comprobante}.`);
  const danados = new Set((v.danados ?? '').split(',').filter(Boolean).map(Number));
  const items = v.items.split(',').map((par) => {
    const [orden, cantidad] = par.split(':');
    if (!orden || !cantidad) throw new Error(`"${par}" no es línea:cantidad (ej. 1:2).`);
    return { orden: Number(orden), cantidad, danado: danados.has(Number(orden)) };
  });
  const medio = v.reembolso?.toUpperCase() as MedioPago | undefined;
  if (medio && !MEDIOS_PAGO.includes(medio)) throw new Error(`Medio de reembolso: ${MEDIOS_PAGO.join(', ')}.`);

  const r = await registrarDevolucion(db, {
    empresaId, comprobanteId: c.rows[0].id, motivo: v.motivo, items,
    ...(medio ? { reembolso: { medio, ...(v.monto ? { monto: v.monto } : {}), ...(v.referencia ? { referencia: v.referencia } : {}) } } : {}),
  });
  console.log(`✔ Devolución ${r.tipo.toLowerCase()} registrada: nota de crédito ${r.notaCredito} por S/ ${r.total}.`);
  if (danados.size) console.log('  Los productos dañados no regresaron al stock vendible.');
  // Se intenta enviar a SUNAT ya; si no se puede, la cola lo reintenta sola.
  const enviado = await procesarAhora(db, serviciosDesdeEntorno(db), r.notaCreditoId).catch(() => false);
  console.log(enviado ? '  Enviada a SUNAT.' : '  Queda en la cola de envío a SUNAT (se reintenta sola).');
} catch (e) {
  console.error('✘', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.end();
}
