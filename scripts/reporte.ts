/**
 * Reportes (estimados, para uso interno).
 *
 *   npm run reporte -- dia     --ruc 20XXXXXXXXX [--fecha 2026-10-23]
 *   npm run reporte -- margen  --ruc 20XXXXXXXXX [--fecha 2026-10-23]   (semana lunes a domingo)
 *   npm run reporte -- cliente --ruc 20XXXXXXXXX --documento 12345678
 *   npm run reporte -- meta    --ruc 20XXXXXXXXX --monto 3000.00 [--fecha 2026-10-20]
 */
import { parseArgs } from 'node:util';
import { crearPool } from '../src/db/conexion.js';
import { historialCliente } from '../src/reportes/cliente.js';
import { fijarMetaMargen, margenSemanal } from '../src/reportes/margen.js';
import { resumenDelDia } from '../src/reportes/resumen-dia.js';
import { empresaPorRuc } from './lib/consola.js';

const texto = { type: 'string' as const };
const { values: v, positionals } = parseArgs({ allowPositionals: true, options: { ruc: texto, fecha: texto, documento: texto, monto: texto } });
const accion = positionals[0] ?? '';
if (!v.ruc || !['dia', 'margen', 'cliente', 'meta'].includes(accion)) {
  console.error('Uso: ver el encabezado de scripts/reporte.ts');
  process.exit(1);
}

const db = crearPool();
try {
  const { id: empresaId } = await empresaPorRuc(db, v.ruc);
  if (accion === 'dia') {
    console.log(JSON.stringify(await resumenDelDia(db, empresaId, v.fecha), null, 2));
  } else if (accion === 'margen') {
    const m = await margenSemanal(db, empresaId, v.fecha);
    console.log(`Semana ${m.desde} a ${m.hasta} (montos sin IGV, ESTIMADO)`);
    console.log(`  Ventas:  S/ ${m.ventas}`);
    console.log(`  Costo:   S/ ${m.costo}`);
    console.log(`  Margen:  S/ ${m.margen}${m.porcentaje ? ` (${m.porcentaje} %)` : ''}`);
    if (m.meta) console.log(`  Meta:    S/ ${m.meta.monto} → ${m.meta.cumplimiento} % cumplido`);
    if (m.sinCosto.items) console.log(`  ⚠ ${m.sinCosto.items} ítems (S/ ${m.sinCosto.ventas}) sin costo conocido: no entran al margen. Registra sus compras o usa su SKU.`);
  } else if (accion === 'cliente') {
    const h = await historialCliente(db, empresaId, v.documento ?? '');
    if (!h) throw new Error(`No hay comprobantes para el documento ${v.documento}.`);
    console.log(`${h.cliente.nombre} (${h.cliente.numero}) · comprado S/ ${h.totalComprado} · por cobrar S/ ${h.saldoPendiente}`);
    console.table(h.comprobantes);
  } else {
    if (!v.monto) throw new Error('Falta --monto.');
    await fijarMetaMargen(db, empresaId, v.monto, v.fecha);
    console.log(`✔ Meta de margen semanal: S/ ${v.monto}.`);
  }
} catch (e) {
  console.error('✘', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.end();
}
