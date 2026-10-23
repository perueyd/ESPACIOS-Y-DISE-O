/**
 * Certificados .pfx FICTICIOS generados al vuelo para las pruebas.
 * Nunca se guardan en el repositorio ni sirven ante SUNAT.
 */
import { generateKeyPairSync } from 'node:crypto';
import forge from 'node-forge';

export interface OpcionesCertificado {
  ruc?: string;
  clave?: string;
  desde?: Date;
  hasta?: Date;
  /** Incluir un segundo certificado (como una CA) antes del certificado propio. */
  conCadena?: boolean;
}

const cache = new Map<string, Buffer>();

function nuevoPar(): forge.pki.rsa.KeyPair {
  // Generar la llave con el crypto nativo de Node (mucho más rápido que forge).
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const llave = forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()) as forge.pki.rsa.PrivateKey;
  return { privateKey: llave, publicKey: forge.pki.setRsaPublicKey(llave.n, llave.e) };
}

function certificado(par: forge.pki.rsa.KeyPair, cn: string, desde: Date, hasta: Date, serie: string): forge.pki.Certificate {
  const c = forge.pki.createCertificate();
  c.publicKey = par.publicKey;
  c.serialNumber = serie;
  c.validity.notBefore = desde;
  c.validity.notAfter = hasta;
  const atributos = [{ name: 'commonName', value: cn }, { name: 'countryName', value: 'PE' }];
  c.setSubject(atributos);
  c.setIssuer(atributos);
  c.sign(par.privateKey, forge.md.sha256.create());
  return c;
}

export function crearPfxPrueba(o: OpcionesCertificado = {}): Buffer {
  const ruc = o.ruc ?? '20600000005';
  const clave = o.clave ?? 'clave-de-prueba';
  const desde = o.desde ?? new Date(Date.now() - 86_400_000);
  const hasta = o.hasta ?? new Date(Date.now() + 365 * 86_400_000);
  const k = JSON.stringify([ruc, clave, desde.toISOString().slice(0, 10), hasta.toISOString().slice(0, 10), o.conCadena ?? false]);
  const enCache = cache.get(k);
  if (enCache) return enCache;

  const par = nuevoPar();
  const propio = certificado(par, `PRUEBA ${ruc}`, desde, hasta, '01');
  const certs = o.conCadena ? [certificado(nuevoPar(), 'CA DE PRUEBA', desde, hasta, '02'), propio] : [propio];
  const asn1 = forge.pkcs12.toPkcs12Asn1(par.privateKey, certs, clave, { algorithm: '3des' });
  const pfx = Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
  cache.set(k, pfx);
  return pfx;
}
