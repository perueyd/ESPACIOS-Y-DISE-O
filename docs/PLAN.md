# Plan del facturador electrónico — Fase 1 (plan y diseño)

> Estado: fases 1 y 2 aprobadas; fase 3 lista para revisión (ver sección 8).
> Fecha: 23-oct-2026.

---

## 1. Resumen en palabras simples

Vamos a construir un "servicio facturador" propio. Funciona así:

1. Un canal (tu tienda web, o tú desde el panel manual) dice: *"emite una boleta
   por este pedido"*.
2. El facturador revisa que los datos estén bien (DNI, RUC, montos, IGV).
3. Le asigna el siguiente número de la serie (ej. `B001-00000015`) sin saltos.
4. Arma el archivo **XML** con el formato que pide SUNAT (UBL 2.1).
5. Lo **firma** con el Certificado Digital Tributario de la empresa.
6. Lo **envía** a SUNAT. SUNAT responde con una constancia llamada **CDR**
   (aceptado, aceptado con observaciones o rechazado).
7. Guarda el XML, el CDR y genera un **PDF con código QR** para el cliente.
8. Si SUNAT no responde, el comprobante queda "pendiente" y se reintenta solo.

---

## 2. Lo que revisé de SUNAT (y lo que falta confirmar)

Revisé fuentes oficiales y secundarias. Desde este entorno **no pude abrir
directamente sunat.gob.pe** (bloqueo de red), así que todo lo marcado con ⚠️ debe
confirmarse en la documentación oficial antes de programar la fase que lo use.
Esto es parte de la regla "no asumir nada de memoria".

| Tema | Lo encontrado | Confianza |
|---|---|---|
| Sistema | SEE - Del Contribuyente, creado por R.S. 097-2012/SUNAT. | Alta (oficial) |
| Formato | XML UBL 2.1, firmado (XMLDSig, RSA-SHA256), comprimido en ZIP. | Alta |
| Envío facturas/NC/boletas | Servicio SOAP `billService`. Beta: `https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService`. Producción: `https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService`. Métodos: `sendBill` (respuesta inmediata con CDR), `sendSummary` + `getStatus` (resúmenes y bajas, respuesta con ticket). | Media ⚠️ (URLs vistas en fuentes no oficiales, coinciden entre sí) |
| Guías de remisión | Usan otra API (REST con OAuth2). **No están en el alcance** por ahora. | Alta (manual oficial GRE) |
| Plazo facturas | Hasta 3 días calendario para enviar a SUNAT. | Media ⚠️ (el punto de inicio del conteo varía según la fuente) |
| Boletas | Se pueden enviar una por una o en **resumen diario**; plazo del resumen: hasta 7 días calendario desde la emisión. | Media ⚠️ |
| Baja de facturas | Comunicación de baja, hasta el 7.º día calendario. | Media ⚠️ |
| Baja de boletas | Se informan como "anuladas" en el resumen diario. | Media ⚠️ |
| Fuera de plazo | Ya no se puede dar de baja: se emite nota de crédito. | Alta |
| **Cambio 2027** | R.S. 000048-2026/SUNAT cambia reglas de emisión y baja; la R.S. 000143-2026/SUNAT **postergó su vigencia al 1-ene-2027** (algunas partes al 1-abr-2027). Hay que leer el texto oficial para ver si afecta facturas y boletas. | Media ⚠️ **Importante** |
| Boleta > S/ 700 | Obligatorio tipo y número de documento del cliente (R.S. 007-99, Anexo de R.S. 303-2018 y 114-2019). | Alta (oficial) |
| UIT 2026 | S/ 5,500. | Alta |
| Régimen MYPE | Hasta 1,700 UIT. Pago a cuenta 1 % de ingresos netos hasta 300 UIT; renta anual 10 % hasta 15 UIT de renta neta y 29.5 % por el exceso. | Media ⚠️ |
| Nuevo RUS | Límite S/ 96,000 al año / S/ 8,000 mensuales; no emite facturas. | Media ⚠️ |
| Taxi (RUC 10) | Exonerado de IGV (Apéndice II, num. 2 de la Ley del IGV). Una fuente indica prórroga hasta 31-dic-2028 (Ley 32542). **Ojo:** la comisión de apps (Uber, InDrive, etc.) sí está gravada (Informe 000107-2025-SUNAT/7T0000). | Media ⚠️ |
| Homologación | Antes, SUNAT pedía un "set de pruebas" para habilitar el SEE - Del Contribuyente. Confirmar si sigue vigente y cómo se pide en SOL. | Baja ⚠️ |

**Documentos oficiales a descargar y leer antes de la fase 2** (de
`cpe.sunat.gob.pe` y `sunat.gob.pe/legislacion`):

1. Guías de elaboración XML UBL 2.1: factura, boleta, nota de crédito, resumen
   diario y comunicación de baja (versión vigente).
2. Catálogos de SUNAT (Anexo 8): tipos de documento, afectación del IGV, motivos
   de nota de crédito, unidades de medida, etc.
3. Listado de códigos de error y observaciones (validaciones de SUNAT).
4. Manual del servicio web `billService` (WSDL).
5. Textos de R.S. 000048-2026 y 000143-2026.

---

## 3. Arquitectura propuesta

```
 Tienda (Vercel)      Panel manual (celular)     Otros canales
        │  llave API          │ login + 2FA            │ llave API
        └──────────────┬──────┴────────────────────────┘
                       ▼
              ┌──────────────────┐
              │  API facturador  │  valida, numera, guarda (transacción)
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐      ┌───────────────────────┐
              │   PostgreSQL     │◄────►│ Cola de envíos        │
              │ (multiempresa)   │      │ (tabla + trabajador)  │
              └──────────────────┘      └──────────┬────────────┘
                                                   ▼
                                  XML UBL 2.1 → firma → ZIP → SUNAT
                                                   │
                                                   ▼
                          Almacenamiento de archivos (XML, CDR, PDF)
                          inmutable, con respaldo, 5+ años
```

### Tecnología recomendada

| Pieza | Propuesta | Por qué |
|---|---|---|
| Lenguaje | Node.js 22 + TypeScript estricto | Lo pediste; buen soporte de XML y firma. |
| API | Hono (framework web pequeño) | Corre igual en Vercel y en un servidor normal. |
| Base de datos | PostgreSQL administrado (Neon o Supabase) | Transacciones, respaldos automáticos y restauración a un punto en el tiempo. |
| Acceso a BD | Kysely o Drizzle + migraciones SQL versionadas | Consultas tipadas; el SQL queda visible y revisable. |
| Dinero | `decimal.js` + columnas `NUMERIC` | Sin errores de punto flotante. |
| XML / firma | `xmlbuilder2`, `xml-crypto`, `node-forge` (leer .pfx) | Librerías estándar, sin depender de un proveedor. |
| PDF + QR | `pdfkit` + `qrcode` | Funciona en servidor sin navegador. |
| Archivos | Almacenamiento tipo S3 (Cloudflare R2, Supabase Storage o Vercel Blob) con versionado | Los XML/CDR no se pueden perder ni sobrescribir. |
| Pruebas | Vitest + base de datos de prueba + SUNAT beta | Pruebas obligatorias. |

### Una advertencia sobre Vercel (te explico una opción mejor para la cola)

La API puede vivir en Vercel sin problema. El punto delicado es la **cola de
reintentos**: necesita revisarse cada pocos minutos. En el plan gratuito de
Vercel los "cron" solo corren una vez al día. Opciones:

1. **Vercel Pro** (de pago): cron cada minuto. Simple.
2. **Vercel gratis + `pg_cron` de Supabase** que llama al facturador cada minuto.
3. **Servidor pequeño siempre encendido** (Railway, Render o Fly.io) solo para el
   trabajador de la cola, y la API en Vercel.

**Mi recomendación:** opción 2 para empezar (bajo costo), dejando el código listo
para pasar a la 1 o la 3 sin cambios. Además, cuando un canal pide emitir, el
facturador intenta enviar a SUNAT de inmediato; la cola es solo la red de seguridad.

---

## 4. Cómo se cumplen las reglas obligatorias

| Regla | Cómo |
|---|---|
| Correlativos sin saltos ni duplicados | Tabla `series` con `ultimo_numero`. Dentro de UNA transacción: se bloquea la fila de la serie (`SELECT … FOR UPDATE`), se suma 1 y se inserta el comprobante. Si algo falla, todo se deshace y el número no se consume. Restricción única `(empresa, tipo, serie, número)` como segundo candado. |
| Pedido repetido | Restricción única `(empresa, canal, pedido_externo)` y encabezado `Idempotency-Key`. Si ya existe, se devuelve el mismo comprobante. |
| Validaciones | DNI 8 dígitos; RUC 11 dígitos con dígito verificador (módulo 11); documento obligatorio en boleta > S/ 700 (parámetro); RUC + razón social en factura; régimen permite el tipo de comprobante. |
| IGV exacto | Precios con IGV incluido → valor unitario sin IGV calculado con hasta 10 decimales (lo que permite SUNAT ⚠️), totales redondeados a 2 decimales con reglas fijas y probadas. |
| SUNAT no responde | Estado `PENDIENTE_ENVIO`, reintentos con espera creciente (1, 2, 5, 10, 30 min…). Alerta si pasa cierto tiempo o se acerca el plazo legal. |
| Errores claros | Tabla `sunat_errores` con el código oficial + explicación en español + qué corregir. |
| Nunca borrar | Sin `DELETE` en comprobantes (bloqueado por permisos de la base de datos). Cambios de estado registrados en `comprobante_eventos`. |
| Log y respaldo 5 años | `auditoria` de cada acción; XML/CDR en almacenamiento inmutable con hash SHA-256 en la base de datos; respaldo diario. |
| Beta primero | Cada empresa tiene `ambiente_sunat` = `BETA` por defecto. Pasar a `PRODUCCION` requiere un rol "dueño" + confirmación 2FA + registro en auditoría. |

### Estados de un comprobante

```
BORRADOR → EMITIDO_LOCAL → (envío) → ACEPTADO
                                   → ACEPTADO_CON_OBSERVACIONES
                                   → RECHAZADO  (se corrige emitiendo uno nuevo)
              ↓ sin respuesta
          PENDIENTE_ENVIO → reintento automático

Después de aceptado: ANULACION_EN_PROCESO → ANULADO (baja / resumen)
                     o queda vigente y se emite NOTA DE CRÉDITO.
```

---

## 5. Fases

| # | Fase | Qué se entrega | Cómo se prueba |
|---|---|---|---|
| 1 | Plan y diseño de BD | Este documento, `BASE_DE_DATOS.md`, `CLAUDE.md` | Tu aprobación |
| 2 | Generación de XML | Migraciones de BD, cálculos de IGV, validaciones, correlativos, XML de boleta, factura, NC, resumen diario y baja | Pruebas automáticas vs. ejemplos oficiales |
| 3 | Firma | Lectura del certificado (.pfx) desde variable de entorno/BD cifrada, firma XMLDSig | Verificar firma con certificado de prueba |
| 4 | Envío a SUNAT beta | Cliente SOAP, cola con reintentos, lectura de CDR, tabla de errores en español | Comprobantes aceptados en beta; simulación de SUNAT caído |
| 5 | PDF | Representación impresa con QR (formato A4 y ticket 80 mm) | Revisión visual + contador |
| 6 | API y tienda | Endpoints, llaves por canal, documentación, conexión con `tarimas-cabeceras-store` (emitir solo al confirmar Yape/Plin) | Pedido repetido no duplica; prueba de punta a punta |
| 7+ | Módulos futuros | Uno por fase (ver abajo) | — |

Orden sugerido de módulos futuros: (a) cobros y estado de pago, (b) inventario y
compras, (c) devoluciones, (d) crédito fiscal y SIRE, (e) finanzas e impuestos,
(f) conciliación bancaria, (g) perfil taxista, (h) dashboard completo,
(i) venta a otros negocios.

Al final de cada fase: revisión de seguridad + tu aprobación antes de unir a `main`.

---

## 6. Antes de pasar a producción (lista obligatoria)

- [ ] Boletas, facturas y notas de crédito aceptadas en SUNAT beta, sin errores
- [ ] Pruebas automáticas pasando al 100 %
- [ ] Un contador revisó boletas y facturas de prueba
- [ ] Probado que un pedido repetido no genera dos comprobantes
- [ ] Probado qué pasa si SUNAT no responde (queda pendiente y se reenvía)
- [ ] Ningún certificado ni clave aparece en GitHub
- [ ] Respaldo diario funcionando y restaurado al menos una vez de prueba
- [ ] Revisión de seguridad final hecha
- [ ] Confirmado si SUNAT exige homologación / autorización previa del SEE - Del Contribuyente
- [ ] Revisado el impacto de R.S. 000048-2026 (vigente desde 1-ene-2027)

Antes de vender a otros negocios: confirmar con un contador o abogado tributario
si debes inscribirte como **PSE** (Proveedor de Servicios Electrónicos), y tener
política de privacidad y términos de uso.

---

## 7. Fase 2 — Generación de XML (resultado)

**Qué quedó hecho**

- Migraciones de la base de datos: núcleo, parámetros, comprobantes, cola,
  resúmenes, bajas y auditoría (`db/migraciones/`).
- Cálculo de IGV con precio incluido, sin errores de punto flotante.
- Validaciones: DNI, RUC con dígito verificador, boleta > S/ 700 (parámetro),
  factura con RUC y razón social, régimen (Nuevo RUS sin facturas), series F/B,
  cuotas de crédito, motivos de nota de crédito, exoneraciones vigentes,
  caracteres inválidos y máximo de decimales.
- Emisión en una sola transacción: correlativo sin saltos, pedido repetido
  devuelve el mismo comprobante, nota de crédito nunca supera el saldo del original.
- XML UBL 2.1 de factura, boleta y nota de crédito (validados contra el esquema
  oficial OASIS UBL 2.1), resumen diario (RC) y comunicación de baja (RA).
- Protecciones en la base: no se pueden borrar comprobantes, no se puede
  cambiar su contenido después de emitido, la serie no retrocede, historial y
  auditoría solo de inserción, no se pasa a producción sin registrar quién autorizó.
- 111 pruebas automáticas, incluidas 40 emisiones simultáneas y 10 pedidos
  repetidos simultáneos contra PostgreSQL real.

**Decisiones tomadas por defecto** (las preguntas de la fase 1 seguían abiertas;
se puede cambiar cualquiera sin rehacer el trabajo):

| Pregunta | Decisión provisional |
|---|---|
| Repositorio | Seguimos en este repositorio; se puede mover más adelante sin perder nada. |
| Base de datos | Cualquier PostgreSQL 15 o superior (Supabase y Neon cumplen). |
| Envío de boletas | Una por una (el diseño también soporta resumen diario, que se usa para anular boletas). |
| Series | Compartidas entre marcas: `F001`, `B001`, `FC01`, `BC01`. La marca queda registrada en cada comprobante. |
| Régimen del RUC 10 | Configurable; no bloquea nada por ahora. |
| PDF | Se decide en la fase 5. |

**Pendiente de confirmar en SUNAT beta (fase 4)** ⚠️

1. Código exacto para boletas sin cliente identificado ("clientes varios"). Hoy: tipo `0`.
2. Tolerancias de redondeo que acepta SUNAT (con nuestro método la diferencia máxima es S/ 0.01).
3. Catálogo 09 (motivos de nota de crédito) y demás catálogos contra la versión oficial vigente.
4. Plazos de envío y de baja, y el impacto de la R.S. 000048-2026 desde el 1-ene-2027.
5. Límite de líneas por resumen diario (hoy 500).

**Revisión de seguridad de la fase 2**

- Todas las consultas a la base usan parámetros (sin riesgo de inyección SQL).
- El XML escapa automáticamente los caracteres especiales (`&`, `<`, comillas).
- Se agregó el rechazo de caracteres de control invisibles, que habrían producido XML inválido.
- Se agregó un límite de 10 decimales en cantidades y precios: la base los habría redondeado
  sin avisar y lo guardado no habría coincidido con lo calculado.
- Se agregó un manejador de errores de conexión para que un corte de la base no tumbe el proceso.
- No hay claves, certificados ni contraseñas en el código. La única contraseña escrita es
  la de la base de pruebas local (`facturador`), que no sirve fuera de tu computadora.
- Las pruebas solo borran bases cuyo nombre termina en `_pruebas`, para no tocar la base real.
- Para las próximas fases: falta el aislamiento por empresa con *Row Level Security*
  (fase 6, junto con los roles de usuario y las llaves de API).

## 8. Fase 3 — Firma digital (resultado)

**Qué quedó hecho**

- Lectura del certificado `.pfx`: contraseña equivocada, archivo inválido, certificado
  vencido o aún no vigente → mensaje claro. Si el `.pfx` trae la cadena de certificados,
  se elige el que corresponde a la llave.
- Firma XMLDSig *enveloped* dentro de `ext:ExtensionContent`, con `Id="SignatureSP"`,
  C14N inclusiva y el certificado incluido (`X509Certificate`). Sirve para facturas,
  boletas, notas de crédito, resúmenes diarios y comunicaciones de baja.
- Cada firma se verifica antes de entregarse. En las pruebas, además, la revisa un
  **verificador independiente** (Python, otras librerías) y se valida otra vez contra
  el esquema UBL 2.1, ahora con la firma real.
- Certificado guardado **cifrado** (AES-256-GCM) con una llave maestra que solo está
  en variables de entorno. El cifrado queda atado a la empresa: copiarlo a otra no sirve.
- Firma única por comprobante: se guarda el XML firmado (sin sobrescribir), su huella
  SHA-256, el `DigestValue` (va en el PDF/QR), el certificado y el algoritmo usados.
  Si se pide firmar otra vez, devuelve el mismo XML; si alguien altera el archivo, se detecta.
- Comandos nuevos: `npm run llave:generar` y `npm run certificado:cargar`.
- 153 pruebas automáticas pasando.

**Error encontrado y corregido por las pruebas:** con 5 procesos firmando a la vez el
mismo comprobante, uno podía no ver la firma recién guardada por otro. El índice único
impedía la doble firma, pero ese proceso fallaba. Se corrigió consultando el archivo
después de tomar el bloqueo.

**Pendiente de confirmar en SUNAT beta (fase 4)** ⚠️

1. **Algoritmo:** Greenter (aceptado por SUNAT) usa RSA-SHA1. No pude confirmar en la
   documentación oficial si SUNAT acepta SHA-256. Es configurable (`FIRMA_ALGORITMO`);
   por defecto SHA1. En beta se probarán ambos.
2. Si SUNAT exige registrar el certificado en Operaciones en Línea (SOL) antes de usarlo.
3. Requisitos del certificado (por ejemplo, que el RUC figure en sus datos).

**Revisión de seguridad de la fase 3**

- La llave privada y la contraseña del `.pfx` solo existen en memoria al firmar; no se
  escriben en registros, auditoría ni mensajes de error. La contraseña se pide por
  teclado sin mostrarse.
- `node-forge` tiene un aviso de seguridad (GHSA-86w9-cpqp-85rv) sobre su
  *verificación* de firmas RSA. Solo lo usamos para abrir el `.pfx`; la firma y la
  verificación las hace el módulo `crypto` de Node.
- Cuando verificamos nuestros propios comprobantes exigimos NUESTRO certificado: una
  firma válida de otro certificado se rechaza.
- El almacén de archivos no sobrescribe y rechaza rutas como `../` o `/etc/...`.
- La base de datos impide cambiar una firma registrada, reactivar o borrar certificados,
  y tener dos XML firmados para el mismo comprobante.
- `.gitignore` bloquea `*.pfx`, `*.p12`, `*.pem`, `*.key`, `.env` y la carpeta `almacen/`.
- Para más adelante: rotación de la llave maestra (volver a cifrar con una nueva) y
  almacenamiento en la nube con bloqueo de objetos (fase 4).

## 9. Decisiones que siguen abiertas

Mientras no respondas, se usan las decisiones provisionales de la sección 7.


1. **Repositorio:** el prompt pide un proyecto nuevo e independiente, pero este
   repositorio se llama `espacios-y-dise-o` (nombre de una marca). ¿Lo usamos para
   el facturador o creas uno nuevo (ej. `facturador-sunat`) y movemos estos
   documentos allá?
2. **Base de datos:** ¿Neon o Supabase? (recomiendo **Supabase**: incluye `pg_cron`
   para la cola y almacenamiento de archivos en el mismo lugar).
3. **Boletas:** ¿envío una por una (recomendado: CDR inmediato) o resumen diario?
   Las anulaciones de boletas igual irán por resumen diario.
4. **Series:** propuesta `B001` (boletas), `F001` (facturas), `BC01`/`FC01`
   (notas de crédito de boleta/factura). ¿Una serie por marca o compartidas?
5. **Régimen del RUC 10** (taxi): ¿Nuevo RUS, RER, MYPE o General?
6. **PDF:** ¿A4, ticket 80 mm o ambos?
