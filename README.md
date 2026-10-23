# Facturador electrónico SUNAT

Facturador propio para emitir boletas, facturas, notas de crédito y comunicaciones
de baja directamente a SUNAT (SEE - Del Contribuyente), sin proveedores externos.

## Estado

| Fase | Estado |
|---|---|
| 1. Plan y diseño de base de datos | ✅ Aprobada |
| 2. Generación de XML | ✅ Lista para revisión |
| 3. Firma digital | Pendiente |
| 4. Envío a SUNAT beta | Pendiente |
| 5. PDF con QR | Pendiente |
| 6. API y conexión con la tienda | Pendiente |

**Todavía no envía nada a SUNAT.** Hoy el sistema valida, calcula el IGV, numera
sin saltos, guarda en PostgreSQL y genera el XML (sin firmar).

## Cómo funciona (resumen)

1. Un canal (tienda web o panel manual) pide emitir un comprobante.
2. El facturador valida los datos (DNI, RUC, monto de S/ 700, régimen…).
3. Calcula el IGV con decimales exactos (el cliente paga exactamente el precio publicado).
4. Toma el siguiente número de la serie y guarda todo en una sola transacción.
5. Genera el XML UBL 2.1 que pide SUNAT.
6. *(Próximas fases)* Lo firma, lo envía a SUNAT, guarda el CDR y genera el PDF.

## Cómo usarlo (para desarrollo)

Necesitas Node.js 22 o superior y PostgreSQL 15 o superior.

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

## Carpetas

| Carpeta | Qué hay |
|---|---|
| `src/calculos/` | IGV, totales y monto en letras |
| `src/validaciones/` | DNI, RUC y reglas de cada comprobante |
| `src/xml/` | Generación de XML (factura, boleta, nota de crédito, resumen diario, baja) |
| `src/comprobantes/` | Emisión: valida, numera y guarda en una transacción |
| `db/migraciones/` | Estructura de la base de datos (SQL) |
| `tests/` | Pruebas automáticas |
| `docs/` | Plan, diseño de la base de datos y ejemplos de XML |

## Documentos

- [`CLAUDE.md`](CLAUDE.md) — reglas obligatorias del proyecto.
- [`docs/PLAN.md`](docs/PLAN.md) — cómo funciona, arquitectura, fases y lo revisado de SUNAT.
- [`docs/BASE_DE_DATOS.md`](docs/BASE_DE_DATOS.md) — diseño de la base de datos.
- [`docs/ejemplos/`](docs/ejemplos/) — XML de ejemplo con datos ficticios.
