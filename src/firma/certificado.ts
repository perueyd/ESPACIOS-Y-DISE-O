/**
 * Lectura del Certificado Digital Tributario (archivo .pfx / .p12).
 *
 * node-forge se usa SOLO para abrir el .pfx (PKCS#12). La firma y la verificación
 * las hace el módulo `crypto` de Node (vía xml-crypto). Motivo: node-forge tiene un
 * aviso de seguridad sobre su verificación de firmas RSA (GHSA-86w9-cpqp-85rv), que
 * no usamos.
 */
import { X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto';
import forge from 'node-forge';

export interface CertificadoFirma {
  llavePrivadaPem: string;
  certificadoPem: string;
  /** Certificado en DER base64, tal como va dentro de <ds:X509Certificate>. */
  certificadoBase64: string;
  numeroSerie: string;
  emisor: string;
  sujeto: string;
  validoDesde: Date;
  validoHasta: Date;
  /** Huella SHA-256 del certificado, para identificarlo sin exponerlo. */
  huella: string;
}

export class ErrorCertificado extends Error {}

export function leerPfx(pfx: Buffer, clave: string): CertificadoFirma {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, clave);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/MAC could not be verified|Invalid password/i.test(msg)) {
      throw new ErrorCertificado('La contraseña del certificado .pfx no es correcta.');
    }
    throw new ErrorCertificado('El archivo no es un certificado .pfx/.p12 válido.');
  }

  const llaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag! })[forge.pki.oids.pkcs8ShroudedKeyBag!] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag! })[forge.pki.oids.keyBag!] ?? []),
  ];
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag! })[forge.pki.oids.certBag!] ?? [];
  const llaveForge = llaves.find((b) => b.key)?.key;
  if (!llaveForge) throw new ErrorCertificado('El .pfx no contiene la llave privada.');
  if (certs.length === 0) throw new ErrorCertificado('El .pfx no contiene el certificado.');

  const llavePrivadaPem = forge.pki.privateKeyToPem(llaveForge);
  const llave = createPrivateKey(llavePrivadaPem);
  if (llave.asymmetricKeyType !== 'rsa') throw new ErrorCertificado('El certificado debe usar una llave RSA.');
  const publicaDeLlave = createPublicKey(llave).export({ type: 'spki', format: 'der' });

  // Un .pfx puede traer también los certificados de la cadena: elegimos el que corresponde a la llave.
  for (const bag of certs) {
    if (!bag.cert) continue;
    const pem = forge.pki.certificateToPem(bag.cert);
    const x509 = new X509Certificate(pem);
    if (!x509.publicKey.export({ type: 'spki', format: 'der' }).equals(publicaDeLlave)) continue;
    return {
      llavePrivadaPem,
      certificadoPem: pem,
      certificadoBase64: x509.raw.toString('base64'),
      numeroSerie: x509.serialNumber,
      emisor: x509.issuer,
      sujeto: x509.subject,
      validoDesde: new Date(x509.validFrom),
      validoHasta: new Date(x509.validTo),
      huella: x509.fingerprint256,
    };
  }
  throw new ErrorCertificado('Ningún certificado del .pfx corresponde a su llave privada.');
}

/** Lanza un error claro si el certificado no está vigente en la fecha indicada. */
export function verificarVigencia(c: CertificadoFirma, fecha: Date = new Date()): void {
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  if (fecha < c.validoDesde) {
    throw new ErrorCertificado(`El certificado digital recién es válido desde el ${dia(c.validoDesde)}.`);
  }
  if (fecha > c.validoHasta) {
    throw new ErrorCertificado(`El certificado digital venció el ${dia(c.validoHasta)}. Solicita uno nuevo en SUNAT y cárgalo.`);
  }
}

/** Días que faltan para que venza (negativo si ya venció). Para alertas. */
export function diasParaVencer(c: CertificadoFirma, hoy: Date = new Date()): number {
  return Math.floor((c.validoHasta.getTime() - hoy.getTime()) / 86_400_000);
}
