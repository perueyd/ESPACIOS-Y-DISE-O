/**
 * Productos, stock y compras a proveedores.
 *
 *   npm run inventario -- producto --ruc 20XXXXXXXXX --sku TAR-001 --nombre "Tarima 2 plazas" --precio 350.00 \
 *       [--minimo 2] [--sin-stock] [--unidad NIU] [--marca "Espacios y Diseño"]
 *   npm run inventario -- ajustar  --ruc 20XXXXXXXXX --sku TAR-001 --cantidad=-1 --motivo "producto dañado"
 *       (salidas con "=" y signo menos: --cantidad=-1; entradas: --cantidad 3)
 *   npm run inventario -- stock    --ruc 20XXXXXXXXX
 *   npm run inventario -- compra   --ruc 20XXXXXXXXX --archivo compra.json
 *
 * compra.json (montos como texto, tal cual la factura del proveedor; costos SIN IGV):
 *   { "proveedor": { "ruc": "20XXXXXXXXX", "razonSocial": "MADERAS SAC" }, "serie": "F001", "numero": 123,
 *     "fecha": "2026-10-20", "igv": "54.00", "total": "354.00",
 *     "items": [{ "sku": "TAR-001", "descripcion": "Tarima 2 plazas", "cantidad": "2", "costoUnitario": "150.00" }] }
 */
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { crearPool } from '../src/db/conexion.js';
import { registrarCompra, type DatosCompra } from '../src/inventario/compras.js';
import { ajustarStock, guardarProducto, listarStock } from '../src/inventario/productos.js';
import { empresaPorRuc } from './lib/consola.js';

const texto = { type: 'string' as const };
const { values: v, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    ruc: texto, sku: texto, nombre: texto, precio: texto, minimo: texto, unidad: texto, marca: texto,
    cantidad: texto, motivo: texto, archivo: texto, 'sin-stock': { type: 'boolean' },
  },
});
const accion = positionals[0] ?? '';
if (!v.ruc || !['producto', 'ajustar', 'stock', 'compra'].includes(accion)) {
  console.error('Uso: ver el encabezado de scripts/inventario.ts');
  process.exit(1);
}

const db = crearPool();
try {
  const { id: empresaId } = await empresaPorRuc(db, v.ruc);
  if (accion === 'producto') {
    if (!v.sku || !v.nombre || !v.precio) throw new Error('Faltan --sku, --nombre o --precio.');
    await guardarProducto(db, empresaId, {
      sku: v.sku, nombre: v.nombre, precio: v.precio, controlaStock: !v['sin-stock'],
      ...(v.minimo ? { stockMinimo: v.minimo } : {}), ...(v.unidad ? { unidad: v.unidad } : {}), ...(v.marca ? { marca: v.marca } : {}),
    });
    console.log(`✔ Producto ${v.sku.toUpperCase()} guardado.`);
  } else if (accion === 'ajustar') {
    const stock = await ajustarStock(db, empresaId, v.sku ?? '', v.cantidad ?? '0', v.motivo ?? '');
    console.log(`✔ Ajuste registrado. Stock actual de ${v.sku?.toUpperCase()}: ${stock}`);
  } else if (accion === 'stock') {
    console.table((await listarStock(db, empresaId)).map((f) => ({
      sku: f.sku, nombre: f.nombre, stock: f.stock, minimo: f.minimo ?? '-', costo: f.costoPromedio ?? '-', aviso: f.bajoMinimo ? '⚠ reponer' : '',
    })));
  } else {
    if (!v.archivo) throw new Error('Falta --archivo con la compra en JSON.');
    const datos = JSON.parse(await readFile(v.archivo, 'utf8')) as DatosCompra;
    const r = await registrarCompra(db, empresaId, datos);
    console.log(`✔ Compra ${datos.serie}-${datos.numero} registrada (base S/ ${r.base}). Stock y costos actualizados.`);
  }
} catch (e) {
  console.error('✘', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.end();
}
