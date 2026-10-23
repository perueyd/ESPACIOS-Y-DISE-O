"""
Verificador INDEPENDIENTE de firmas XMLDSig, escrito con otras librerías
(lxml + cryptography) para no depender de la misma librería que firma.

Uso:  python3 -I tests/verificador_independiente.py < firmado.xml
Imprime "OK <algoritmo>" o "ERROR <motivo>" y sale con código 0 / 1.
"""
import base64
import hashlib
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from lxml import etree

DS = "http://www.w3.org/2000/09/xmldsig#"
C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature"
FIRMAS = {
    "http://www.w3.org/2000/09/xmldsig#rsa-sha1": hashes.SHA1(),
    "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256": hashes.SHA256(),
}
DIGESTS = {
    "http://www.w3.org/2000/09/xmldsig#sha1": hashlib.sha1,
    "http://www.w3.org/2001/04/xmlenc#sha256": hashlib.sha256,
}


def fallar(motivo: str) -> None:
    print("ERROR " + motivo)
    sys.exit(1)


def main() -> None:
    raiz = etree.fromstring(sys.stdin.buffer.read())
    ns = {"ds": DS}
    firmas = raiz.findall(".//ds:Signature", ns)
    if len(firmas) != 1:
        fallar(f"se esperaba 1 firma, hay {len(firmas)}")
    firma = firmas[0]
    if firma.getparent() is None or etree.QName(firma.getparent()).localname != "ExtensionContent":
        fallar("la firma no está dentro de ext:ExtensionContent")

    info = firma.find("ds:SignedInfo", ns)
    if info.find("ds:CanonicalizationMethod", ns).get("Algorithm") != C14N:
        fallar("canonicalización distinta de C14N inclusiva")
    alg_firma = info.find("ds:SignatureMethod", ns).get("Algorithm")
    refs = info.findall("ds:Reference", ns)
    if len(refs) != 1 or refs[0].get("URI") != "":
        fallar("se esperaba una sola referencia con URI vacía (documento completo)")
    ref = refs[0]
    transformaciones = [t.get("Algorithm") for t in ref.findall("ds:Transforms/ds:Transform", ns)]
    if transformaciones[:1] != [ENVELOPED]:
        fallar("falta la transformación enveloped-signature")
    alg_digest = ref.find("ds:DigestMethod", ns).get("Algorithm")
    if alg_firma not in FIRMAS or alg_digest not in DIGESTS:
        fallar("algoritmo no soportado")

    # 1) Digest del documento SIN la firma (transformación enveloped) en C14N inclusiva.
    copia = etree.fromstring(etree.tostring(raiz))
    f2 = copia.find(".//ds:Signature", ns)
    f2.getparent().remove(f2)
    canon_doc = etree.tostring(copia, method="c14n", exclusive=False, with_comments=False)
    digest = base64.b64encode(DIGESTS[alg_digest](canon_doc).digest()).decode()
    if digest != ref.find("ds:DigestValue", ns).text.strip():
        fallar("el DigestValue no coincide con el contenido")

    # 2) Firma RSA sobre SignedInfo canonicalizado (con los namespaces heredados).
    canon_info = etree.tostring(info, method="c14n", exclusive=False, with_comments=False)
    der = base64.b64decode("".join(firma.find(".//ds:X509Certificate", ns).text.split()))
    cert = x509.load_der_x509_certificate(der)
    valor = base64.b64decode("".join(firma.find("ds:SignatureValue", ns).text.split()))
    try:
        cert.public_key().verify(valor, canon_info, padding.PKCS1v15(), FIRMAS[alg_firma])
    except Exception:
        fallar("la firma RSA no es válida")
    print("OK " + alg_firma.rsplit("#", 1)[-1])


main()
