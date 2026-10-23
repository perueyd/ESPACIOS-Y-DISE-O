# Facturador electrónico SUNAT

Facturador propio para emitir boletas, facturas, notas de crédito y comunicaciones
de baja directamente a SUNAT (SEE - Del Contribuyente), sin proveedores externos.

## Estado

**Fase 1 — Plan y diseño (esperando aprobación).** Todavía no hay código.

## Documentos

- [`CLAUDE.md`](CLAUDE.md) — reglas obligatorias del proyecto.
- [`docs/PLAN.md`](docs/PLAN.md) — cómo funciona, arquitectura, fases y lo revisado de SUNAT.
- [`docs/BASE_DE_DATOS.md`](docs/BASE_DE_DATOS.md) — diseño de la base de datos.

## Cómo funcionará (resumen)

1. Un canal (tienda web o panel manual) pide emitir un comprobante.
2. El facturador valida los datos, asigna el número y arma el XML.
3. Lo firma con el certificado digital de la empresa y lo envía a SUNAT.
4. Guarda el XML, la constancia de SUNAT (CDR) y genera el PDF con QR.
5. Si SUNAT no responde, lo reintenta automáticamente.

Las instrucciones de instalación y uso se agregarán cuando exista el código.
