/**
 * Direcciones y credenciales de SUNAT según el ambiente de cada empresa.
 *
 * BETA: usuario público de pruebas  RUC + "MODDATOS" / "MODDATOS"
 *       (orientacion.sunat.gob.pe, "Pautas servicio BETA"). No requiere certificado registrado.
 * PRODUCCIÓN: usuario SOL SECUNDARIO de la empresa, guardado cifrado. Además exige la
 *       variable SUNAT_PERMITIR_PRODUCCION=si (doble candado; regla del proyecto).
 */
import type { Db, Tx } from '../db/conexion.js';
import { cifrar, descifrar } from '../seguridad/cifrado.js';
import type { CredencialesSunat } from './cliente.js';

export type Ambiente = 'BETA' | 'PRODUCCION';

export const URL_BILL_SERVICE: Record<Ambiente, string> = {
  BETA: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  PRODUCCION: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
};

export class ErrorConfiguracionSunat extends Error {}

const contextoClaveSol = (empresaId: string) => `clave-sol:${empresaId}`;

export function urlServicio(ambiente: Ambiente, entorno = process.env): string {
  if (ambiente === 'PRODUCCION' && entorno.SUNAT_PERMITIR_PRODUCCION !== 'si') {
    throw new ErrorConfiguracionSunat(
      'Envío a PRODUCCIÓN bloqueado: falta SUNAT_PERMITIR_PRODUCCION=si. Solo se activa con autorización del dueño.',
    );
  }
  // Permite apuntar a un SUNAT simulado en pruebas, nunca en producción.
  if (ambiente === 'BETA' && entorno.SUNAT_URL_BETA) return entorno.SUNAT_URL_BETA;
  return URL_BILL_SERVICE[ambiente];
}

export async function credencialesSunat(
  q: Db | Tx,
  empresaId: string,
  ruc: string,
  ambiente: Ambiente,
  llaveMaestra: Buffer,
): Promise<CredencialesSunat> {
  if (ambiente === 'BETA') return { usuario: `${ruc}MODDATOS`, clave: 'MODDATOS' };
  const r = await q.query(`SELECT usuario_sol, clave_cifrada FROM credenciales_sol WHERE empresa_id = $1 AND ambiente = $2`, [
    empresaId,
    ambiente,
  ]);
  const f = r.rows[0];
  if (!f) throw new ErrorConfiguracionSunat('Falta configurar el usuario SOL secundario de la empresa para producción.');
  return {
    usuario: `${ruc}${f.usuario_sol as string}`,
    clave: descifrar(f.clave_cifrada as Buffer, llaveMaestra, contextoClaveSol(empresaId)).toString('utf8'),
  };
}

/** Guarda (o reemplaza) el usuario SOL secundario de producción, cifrado. */
export async function guardarCredencialesSol(
  q: Db | Tx,
  empresaId: string,
  usuarioSecundario: string,
  clave: string,
  llaveMaestra: Buffer,
): Promise<void> {
  if (!/^[A-Z0-9]{1,20}$/i.test(usuarioSecundario)) {
    throw new ErrorConfiguracionSunat('Escribe solo el usuario secundario (sin el RUC), por ejemplo "FACTURA01".');
  }
  await q.query(
    `INSERT INTO credenciales_sol (empresa_id, ambiente, usuario_sol, clave_cifrada) VALUES ($1, 'PRODUCCION', $2, $3)
     ON CONFLICT (empresa_id, ambiente) DO UPDATE SET usuario_sol = EXCLUDED.usuario_sol,
       clave_cifrada = EXCLUDED.clave_cifrada, actualizado_en = now()`,
    [empresaId, usuarioSecundario.toUpperCase(), cifrar(Buffer.from(clave, 'utf8'), llaveMaestra, contextoClaveSol(empresaId))],
  );
}
