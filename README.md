# Facturador electrónico SUNAT

Facturador propio para emitir boletas, facturas, notas de crédito y comunicaciones
de baja directamente a SUNAT (SEE - Del Contribuyente), sin proveedores externos.

## Estado

| Fase | Estado |
|---|---|
| 1. Plan y diseño de base de datos | ✅ Aprobada |
| 2. Generación de XML | ✅ Aprobada |
| 3. Firma digital | ✅ Aprobada |
| 4. Envío a SUNAT beta | ✅ Lista para revisión (falta la prueba real en beta) |
| 5. PDF con QR | Pendiente |
| 6. API y conexión con la tienda | Pendiente |

Hoy el sistema valida, calcula el IGV, numera sin saltos, guarda en PostgreSQL, genera
el XML, lo firma y lo envía a SUNAT **beta** con reintentos automáticos. Producción está
bloqueada hasta tu autorización.

## Cómo funciona (resumen)

1. Un canal (tienda web o panel manual) pide emitir un comprobante.
2. El facturador valida los datos (DNI, RUC, monto de S/ 700, régimen…).
3. Calcula el IGV con decimales exactos (el cliente paga exactamente el precio publicado).
4. Toma el siguiente número de la serie y guarda todo en una sola transacción.
5. Genera el XML UBL 2.1 que pide SUNAT.
6. Lo firma con el Certificado Digital Tributario de la empresa (guardado cifrado) y guarda el XML firmado.
7. Lo envía a SUNAT y guarda la constancia (CDR). Si SUNAT no responde, lo reintenta solo.
8. *(Próximas fases)* Genera el PDF con QR y se conecta con la tienda.

## Cómo usarlo (para desarrollo)

Necesitas Node.js 22 o superior y PostgreSQL 15 o superior. Para las pruebas, además:
`xmllint` (valida el esquema UBL) y Python 3 con `lxml` y `cryptography` (verificador
independiente de firmas).

```bash
npm install                      # instala las librerías

npm run db:prueba                # levanta una base de datos de pruebas local y muestra su URL
export DATABASE_URL_PRUEBAS=...  # pega la URL que mostró el paso anterior
npm test                         # corre TODAS las pruebas (deben pasar al 100 %)

npm run typecheck                # revisa los tipos de TypeScript
npm run ejemplos                 # genera XML de ejemplo en docs/ejemplos/
```

Para crear las tablas en una base real (Supabase/Neon):

```bash
cp .env.example .env             # y completa DATABASE_URL (nunca subas .env a GitHub)
DATABASE_URL=... npm run db:migrar
```

### Cargar el certificado digital de una empresa

¿Aún no lo tienes? Sigue la guía [`docs/GUIA_CERTIFICADO.md`](docs/GUIA_CERTIFICADO.md).

1. Genera la llave maestra (una sola vez por ambiente) y guárdala en `LLAVE_MAESTRA`
   y en un gestor de contraseñas: `npm run llave:generar`
2. Carga el `.pfx` (la contraseña se pide por teclado y no se muestra):
   ```bash
   npm run certificado:cargar -- --ruc 20XXXXXXXXX --pfx /ruta/fuera/del/proyecto/certificado.pfx
   ```
3. Guarda el `.pfx` original en un lugar seguro **fuera** de la carpeta del proyecto.
   Nunca lo subas a GitHub.

### Probar contra SUNAT beta

```bash
npm run sunat:beta -- --ruc 20XXXXXXXXX
```
Detalles en [`docs/PRUEBA_BETA.md`](docs/PRUEBA_BETA.md).

### Procesar la cola de envíos

```bash
npm run cola:procesar     # una vuelta; en producción se programa cada minuto
```

## Carpetas

| Carpeta | Qué hay |
|---|---|
| `src/calculos/` | IGV, totales y monto en letras |
| `src/validaciones/` | DNI, RUC y reglas de cada comprobante |
| `src/xml/` | Generación de XML (factura, boleta, nota de crédito, resumen diario, baja) |
| `src/firma/` | Certificado digital y firma XMLDSig |
| `src/seguridad/` | Cifrado de datos sensibles (AES-256-GCM) |
| `src/almacen/` | Guardado de archivos (XML firmados) sin sobrescribir |
| `src/comprobantes/` | Emisión, firma y anulación de comprobantes |
| `src/sunat/` | Cliente del servicio web de SUNAT, CDR y códigos de error |
| `src/cola/` | Cola de envíos con reintentos automáticos |
| `db/migraciones/` | Estructura de la base de datos (SQL) |
| `tests/` | Pruebas automáticas |
| `docs/` | Plan, diseño de la base de datos y ejemplos de XML |

## Documentos

- [`CLAUDE.md`](CLAUDE.md) — reglas obligatorias del proyecto.
- [`docs/PLAN.md`](docs/PLAN.md) — cómo funciona, arquitectura, fases y lo revisado de SUNAT.
- [`docs/BASE_DE_DATOS.md`](docs/BASE_DE_DATOS.md) — diseño de la base de datos.
- [`docs/GUIA_CERTIFICADO.md`](docs/GUIA_CERTIFICADO.md) — cómo obtener el certificado digital en SUNAT.
- [`docs/PRUEBA_BETA.md`](docs/PRUEBA_BETA.md) — cómo hacer la prueba real en SUNAT beta.
- [`docs/ejemplos/`](docs/ejemplos/) — XML de ejemplo con datos ficticios.
