/**
 * Firma digital XMLDSig "enveloped" de los XML para SUNAT.
 *
 * Estructura (la misma que usa Greenter, aceptada por SUNAT):
 *   <ext:ExtensionContent>
 *     <ds:Signature Id="SignatureSP">
 *       SignedInfo: C14N inclusiva, RSA + digest, Reference URI="" con transformación enveloped
 *       SignatureValue
 *       KeyInfo/X509Data/X509Certificate
 *
 * ⚠️ Algoritmo: Greenter usa RSA-SHA1. No pude confirmar en la documentación oficial
 * si SUNAT exige SHA1 o acepta SHA-256, así que es configurable (FIRMA_ALGORITMO).
 * Por defecto SHA1 (el probado); en la fase 4 se probará SHA256 en SUNAT beta.
 */
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { ID_FIRMA } from '../xml/comun.js';
import type { CertificadoFirma } from './certificado.js';

export type AlgoritmoFirma = 'SHA1' | 'SHA256';

const ALGORITMOS: Record<AlgoritmoFirma, { firma: string; digest: string }> = {
  SHA1: {
    firma: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    digest: 'http://www.w3.org/2000/09/xmldsig#sha1',
  },
  SHA256: {
    firma: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digest: 'http://www.w3.org/2001/04/xmlenc#sha256',
  },
};
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';
const XPATH_EXTENSION = "//*[local-name(.)='ExtensionContent']";

export function algoritmoDesdeEntorno(valor = process.env.FIRMA_ALGORITMO): AlgoritmoFirma {
  if (valor === undefined || valor === '') return 'SHA1';
  if (valor === 'SHA1' || valor === 'SHA256') return valor;
  throw new Error('FIRMA_ALGORITMO debe ser SHA1 o SHA256.');
}

export interface ResultadoFirma {
  xmlFirmado: string;
  /** DigestValue: el "hash" que va en la representación impresa (PDF) y en el QR. */
  digestValue: string;
  signatureValue: string;
}

export class ErrorFirma extends Error {}

export function firmarXml(xml: string, cert: CertificadoFirma, algoritmo: AlgoritmoFirma = 'SHA1'): ResultadoFirma {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const extensiones = doc.getElementsByTagNameNS('urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2', 'ExtensionContent');
  if (extensiones.length !== 1) throw new ErrorFirma('El XML debe tener exactamente un ext:ExtensionContent.');
  if (doc.getElementsByTagNameNS(NS_DS, 'Signature').length > 0) throw new ErrorFirma('El XML ya está firmado.');
  if (extensiones[0]!.childNodes.length > 0) throw new ErrorFirma('ext:ExtensionContent debe estar vacío antes de firmar.');

  const alg = ALGORITMOS[algoritmo];
  const sig = new SignedXml({
    privateKey: cert.llavePrivadaPem,
    publicCert: cert.certificadoPem,
    signatureAlgorithm: alg.firma,
    canonicalizationAlgorithm: C14N,
  });
  sig.addReference({
    xpath: '/*',
    uri: '',
    isEmptyUri: true,
    transforms: [ENVELOPED],
    digestAlgorithm: alg.digest,
  });
  sig.computeSignature(xml, {
    prefix: 'ds',
    attrs: { Id: ID_FIRMA },
    location: { reference: XPATH_EXTENSION, action: 'append' },
  });
  const xmlFirmado = sig.getSignedXml();

  const firmado = new DOMParser().parseFromString(xmlFirmado, 'text/xml');
  const texto = (nombre: string) => firmado.getElementsByTagNameNS(NS_DS, nombre)[0]?.textContent?.trim() ?? '';
  const digestValue = texto('DigestValue');
  const signatureValue = texto('SignatureValue');
  if (!digestValue || !signatureValue) throw new ErrorFirma('No se pudo generar la firma.');

  // Control de seguridad: nunca entregamos una firma que no verifica con nuestro propio certificado.
  if (!verificarFirma(xmlFirmado, cert.certificadoPem).valida) {
    throw new ErrorFirma('La firma generada no pasó la verificación.');
  }
  return { xmlFirmado, digestValue, signatureValue };
}

export interface ResultadoVerificacion {
  valida: boolean;
  errores: string[];
}

/**
 * Verifica la firma de un XML. Si se indica `certificadoPem`, exige que la firma
 * sea de ESE certificado (no basta con que el XML traiga uno cualquiera).
 */
export function verificarFirma(xmlFirmado: string, certificadoPem?: string): ResultadoVerificacion {
  const doc = new DOMParser().parseFromString(xmlFirmado, 'text/xml');
  const firmas = doc.getElementsByTagNameNS(NS_DS, 'Signature');
  if (firmas.length !== 1) return { valida: false, errores: [`Se esperaba una firma y hay ${firmas.length}.`] };

  const sig = new SignedXml(
    certificadoPem
      ? { publicCert: certificadoPem }
      : { getCertFromKeyInfo: (nodo) => SignedXml.getCertFromKeyInfo(nodo) },
  );
  // Los tipos de xml-crypto esperan el Node del DOM del navegador; xmldom es compatible en ejecución.
  sig.loadSignature(firmas[0]! as unknown as Node);
  try {
    const valida = sig.checkSignature(xmlFirmado);
    return { valida, errores: valida ? [] : ['La firma no corresponde al contenido.'] };
  } catch (e) {
    return { valida: false, errores: [e instanceof Error ? e.message : String(e)] };
  }
}
