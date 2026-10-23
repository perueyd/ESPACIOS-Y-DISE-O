/**
 * Configura una empresa (régimen, series, marca y canales por defecto).
 *
 *   npm run empresa:configurar -- --ruc 20XXXXXXXXX --razon "MI EMPRESA S.A.C." \
 *     --ubigeo 150101 --departamento LIMA --provincia LIMA --distrito LIMA \
 *     --direccion "AV. EJEMPLO 123" --regimen MYPE_TRIBUTARIO --desde 2026-01-01 \
 *     [--nombre-comercial "..."] [--marca "Espacios y Diseño"]
 */
import { parseArgs } from 'node:util';
import { crearPool } from '../src/db/conexion.js';
import { configurarEmpresa } from '../src/empresas/configurar.js';
import type { Regimen } from '../src/tipos.js';

const REGIMENES: Regimen[] = ['NUEVO_RUS', 'RER', 'MYPE_TRIBUTARIO', 'GENERAL'];
const { values: v } = parseArgs({
  options: Object.fromEntries(
    ['ruc', 'razon', 'nombre-comercial', 'ubigeo', 'departamento', 'provincia', 'distrito', 'direccion', 'regimen', 'desde', 'marca'].map((k) => [k, { type: 'string' as const }]),
  ),
});
const faltan = ['ruc', 'razon', 'ubigeo', 'departamento', 'provincia', 'distrito', 'direccion', 'regimen', 'desde'].filter((k) => !v[k]);
if (faltan.length || !REGIMENES.includes(v.regimen as Regimen)) {
  console.error(`Faltan o son inválidos: ${faltan.join(', ') || 'regimen'}. Régimen: ${REGIMENES.join(' | ')}. Ver el encabezado de scripts/empresa.ts.`);
  process.exit(1);
}

const db = crearPool();
try {
  const r = await configurarEmpresa(db, {
    ruc: v.ruc!, razonSocial: v.razon!, ubigeo: v.ubigeo!, departamento: v.departamento!, provincia: v.provincia!,
    distrito: v.distrito!, direccion: v.direccion!, regimen: v.regimen as Regimen, regimenDesde: v.desde!,
    ...(v['nombre-comercial'] ? { nombreComercial: v['nombre-comercial'] } : {}),
    ...(v.marca ? { marca: v.marca } : {}),
  });
  console.log(`✔ Empresa ${r.creada ? 'creada' : 'actualizada'} (${v.ruc}). Series: F001, B001, FC01, BC01. Canales: Tienda web (API), WhatsApp, Instagram, Presencial.`);
} catch (e) {
  console.error('✘', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.end();
}
