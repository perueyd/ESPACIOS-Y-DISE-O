# Guía: obtener el Certificado Digital Tributario (CDT) de SUNAT

> Consultado el 23-oct-2026 en [gob.pe – Obtener certificado digital tributario](https://www.gob.pe/26725-obtener-certificado-digital-tributario)
> y [cpe.sunat.gob.pe – Certificado Digital](https://cpe.sunat.gob.pe/certificado-digital).
> Los nombres de los menús de SOL pueden cambiar; si no ves una opción con el nombre
> exacto, busca la más parecida. Los puntos con ⚠️ vienen de guías no oficiales.

El CDT es **gratuito**, lo emite SUNAT y **solo sirve para firmar comprobantes
electrónicos**. Dura **3 años**.

---

## Antes de empezar: ¿cumples los requisitos?

- [ ] RUC **activo** y domicilio fiscal **habido**.
- [ ] Estar afecto al **Impuesto a la Renta de tercera categoría** (empresas y negocios).
- [ ] Ingresos **que no superen** 300 UIT al año. Es un **máximo**, no un mínimo:
      si vendes menos, calificas. Equivale a unos S/ 1,260,000 (UIT de 2019, la que
      cita la norma) o S/ 1,650,000 (UIT de 2026). ⚠️ La norma es de 2020: confirma con
      tu contador qué año de ingresos se revisa.
- [ ] No tener ya un CDT vigente (y no haber obtenido más de dos).
- [ ] No estar inscrito como OSE ni como PSE.
- [ ] Tener tu **Clave SOL principal** a la mano (este trámite lo haces tú, el titular).

**RUC 20 (Corporación Agamenón S.A.C., MYPE Tributario):** debería cumplir todos.
**RUC 10 (taxi):** si está en el **Nuevo RUS**, no está afecto a renta de tercera
categoría y probablemente **no califique** para el CDT gratuito. Confírmalo antes
con tu contador. Por ahora haz solo el del RUC 20.

---

## Paso 1 · Entrar a SUNAT Operaciones en Línea

1. Abre **sunat.gob.pe** → **Operaciones en Línea (SOL)**.
2. Ingresa con **RUC + usuario + Clave SOL** (la principal).

## Paso 2 · Solicitar el certificado

1. Menú: **Empresa → Comprobantes de Pago → Certificado Digital Tributario – CDT →
   Solicitar Certificado Digital Tributario**.
2. Revisa que tus datos estén bien, **acepta los términos y condiciones** y envía.
3. El sistema te pide confirmar: confirma.
4. Verás un mensaje de **aceptación**.

## Paso 3 · Descargar el certificado desde el Buzón SOL

1. En SOL, abre tu **Buzón electrónico**.
2. Abre el mensaje del CDT y elige **generar y descargar**.
3. Te pedirá crear una **clave privada** (mínimo 8 caracteres, letras y números):
   - Usa **16 caracteres o más**, por ejemplo cuatro palabras y números.
   - **No** uses tu Clave SOL ni otra contraseña que ya uses.
   - Guárdala en un **gestor de contraseñas** (Bitwarden, 1Password o el de tu navegador).
   - ⚠️ **Si la olvidas, no se puede recuperar**: tendrías que pedir otro certificado.
4. Se descarga un archivo **`.p12`** (por ejemplo, `certificado.p12`). Es el mismo
   tipo de archivo que un `.pfx`, y el facturador acepta los dos.

## Paso 4 · Guardar el archivo de forma segura

El `.p12` más su clave equivalen a **tu firma**: con ellos alguien podría emitir
comprobantes a tu nombre.

- ✅ Guárdalo en **dos lugares seguros**: por ejemplo, el gestor de contraseñas
  (como adjunto) y una USB que guardes bajo llave.
- ✅ Guarda la clave **separada** del archivo.
- ❌ **No** lo envíes por WhatsApp, correo ni chat (tampoco a mí).
- ❌ **No** lo pongas dentro de la carpeta del proyecto ni lo subas a GitHub.

## Paso 5 · Sacar el archivo público `.cer`

Para registrar el certificado en SOL se usa el archivo **`.cer`**, que es solo la
parte pública: no contiene la llave privada y se puede subir sin riesgo.

**Opción A: con el facturador** (en tu computadora, dentro de la carpeta del proyecto):
```bash
npm run certificado:exportar-cer -- --p12 "C:/ruta/segura/certificado.p12"
```
Te pide la clave (no se ve al escribir), crea `certificado.cer` al lado del `.p12`
y muestra el titular y la fecha de vencimiento: así compruebas también que la clave
es la correcta.

**Opción B: con Windows** ⚠️
1. Doble clic en el `.p12` → **Instalar** → completa el asistente con tu clave.
2. Abre `certmgr.msc` → **Personal → Certificados** → doble clic en tu certificado.
3. Pestaña **Detalles → Copiar en archivo… → No exportar la clave privada →
   DER binario codificado X.509 (.CER)** → guarda.

## Paso 6 · Registrar el certificado en SOL ⚠️

1. En SOL: **Empresa → Comprobantes de Pago → Factura Electrónica (o Sistema de
   Emisión Electrónica) → Registro y mantenimiento → Correo electrónico y
   certificados digitales**.
2. Registra el **correo electrónico** del emisor y confírmalo con el código que te
   envía SUNAT.
3. **Agrega el certificado**: sube el archivo **`.cer`** (nunca el `.p12`).

> ⚠️ **Todavía no te incorpores al "SEE – Del contribuyente" ni inicies la
> homologación.** En esa pantalla puede aparecer la opción
> *"Deseo emitir a través del SEE – Del contribuyente"*. Ese paso y la homologación
> (el set de pruebas de SUNAT) los haremos juntos en la fase 4, cuando el facturador
> ya envíe a SUNAT beta. Si hoy emites por SEE-SOL u otro sistema, seguirás
> emitiendo igual mientras tanto.

## Paso 7 · Crear el usuario SOL secundario (lo necesitaremos en la fase 4)

El facturador **nunca** usará tu Clave SOL principal.

1. En SOL: **Empresa → Mantenimiento de usuarios secundarios ⚠️ → Crear usuario**.
2. Dale **solo** los permisos de **comprobantes de pago electrónicos (emisión y
   consulta)**. Nada de declaraciones, pagos ni trámites.
3. Guarda el usuario y la clave en tu gestor de contraseñas.

## Paso 8 · Cargar el certificado en el facturador (más adelante)

Cuando tengamos la base de datos real (fase 4), **tú** lo cargarás desde tu
computadora con:
```bash
npm run llave:generar    # una sola vez; guárdala como LLAVE_MAESTRA
npm run certificado:cargar -- --ruc 20XXXXXXXXX --pfx "C:/ruta/segura/certificado.p12"
```
El certificado queda **cifrado** en la base de datos.

---

## Problemas frecuentes

| Problema | Qué hacer |
|---|---|
| No aparece la opción "Certificado Digital Tributario" | Puede que no cumplas algún requisito (renta de tercera, tope de ingresos, ya tienes un CDT, domicilio no habido). Revisa la lista de arriba o pregunta a tu contador. |
| No llegó el mensaje al Buzón | Espera unos minutos y vuelve a entrar a SOL. |
| Olvidé la clave privada | No se recupera. Hay que solicitar otro CDT (máximo dos con esta norma). |
| "La contraseña del certificado .pfx no es correcta" | Revisa mayúsculas, minúsculas y espacios. |
| Se acerca el vencimiento (3 años) | El facturador mostrará alertas. Solicita el nuevo antes de que venza y cárgalo con el mismo comando. |

## Lista final

- [ ] Descargué el `.p12` y guardé la clave en un gestor de contraseñas.
- [ ] Guardé el `.p12` en dos lugares seguros, fuera del proyecto.
- [ ] Generé el `.cer` y vi el titular y la fecha de vencimiento correctos.
- [ ] Registré el correo y el `.cer` en SOL (sin incorporarme todavía al SEE – Del contribuyente).
- [ ] Creé el usuario SOL secundario con permisos mínimos.
