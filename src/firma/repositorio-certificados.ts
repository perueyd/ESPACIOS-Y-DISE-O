/**
 * Guardar y obtener el certificado digital de cada empresa, cifrado en la base de datos.
 * Ni el .pfx ni su contraseña se guardan en claro, ni aparecen en registros o auditoría.
 */
import { enTransaccion, type Db, type Tx } from '../db/conexion.js';
import { cifrar, descifrar } from '../seguridad/cifrado.js';
import { ErrorCertificado, leerPfx, verificarVigencia, type CertificadoFirma } from './certificado.js';

type Consultor = Db | Tx;

const contextoPfx = (empresaId: string) => `certificado-pfx:${empresaId}`;
const contextoClave = (empresaId: string) => `certificado-clave:${empresaId}`;

export interface CertificadoGuardado {
  id: string;
  certificado: CertificadoFirma;
}

export interface DatosCargaCertificado {
  empresaId: string;
  pfx: Buffer;
  clave: string;
  llaveMaestra: Buffer;
  usuarioId?: string;
  ahora?: Date;
}

/** Valida el .pfx, lo cifra y lo deja como certificado activo (desactiva el anterior). */
export async function guardarCertificado(db: Db, d: DatosCargaCertificado): Promise<CertificadoGuardado> {
  const cert = leerPfx(d.pfx, d.clave);
  verificarVigencia(cert, d.ahora);

  return enTransaccion(db, async (tx) => {
    const emp = await tx.query(`SELECT id FROM empresas WHERE id = $1 FOR UPDATE`, [d.empresaId]);
    if (!emp.rows[0]) throw new ErrorCertificado('La empresa no existe.');
    const anterior = await tx.query(
      `UPDATE certificados SET activo = false WHERE empresa_id = $1 AND activo RETURNING id, huella_sha256`,
      [d.empresaId],
    );
    const ins = await tx.query(
      `INSERT INTO certificados (empresa_id, pfx_cifrado, clave_pfx_cifrada, numero_serie, emisor, sujeto,
         huella_sha256, valido_desde, valido_hasta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        d.empresaId,
        cifrar(d.pfx, d.llaveMaestra, contextoPfx(d.empresaId)),
        cifrar(Buffer.from(d.clave, 'utf8'), d.llaveMaestra, contextoClave(d.empresaId)),
        cert.numeroSerie, cert.emisor, cert.sujeto, cert.huella, cert.validoDesde, cert.validoHasta,
      ],
    );
    const id = ins.rows[0].id as string;
    await tx.query(
      `INSERT INTO auditoria (empresa_id, usuario_id, accion, entidad, entidad_id, antes, despues)
       VALUES ($1, $2, 'CARGAR_CERTIFICADO', 'certificados', $3, $4, $5)`,
      [
        d.empresaId, d.usuarioId ?? null, id,
        anterior.rows[0] ? JSON.stringify({ certificado: anterior.rows[0].id, huella: anterior.rows[0].huella_sha256 }) : null,
        JSON.stringify({ huella: cert.huella, sujeto: cert.sujeto, validoHasta: cert.validoHasta.toISOString() }),
      ],
    );
    return { id, certificado: cert };
  });
}

/** Devuelve el certificado activo y vigente de la empresa, ya descifrado (solo en memoria). */
export async function obtenerCertificadoActivo(q: Consultor, empresaId: string, llaveMaestra: Buffer, ahora = new Date()): Promise<CertificadoGuardado> {
  const r = await q.query(
    `SELECT id, pfx_cifrado, clave_pfx_cifrada FROM certificados WHERE empresa_id = $1 AND activo`,
    [empresaId],
  );
  const fila = r.rows[0];
  if (!fila) {
    throw new ErrorCertificado('La empresa no tiene un certificado digital activo. Cárgalo con: npm run certificado:cargar');
  }
  const pfx = descifrar(fila.pfx_cifrado as Buffer, llaveMaestra, contextoPfx(empresaId));
  const clave = descifrar(fila.clave_pfx_cifrada as Buffer, llaveMaestra, contextoClave(empresaId)).toString('utf8');
  const cert = leerPfx(pfx, clave);
  verificarVigencia(cert, ahora);
  return { id: fila.id as string, certificado: cert };
}
