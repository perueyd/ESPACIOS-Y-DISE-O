# Revisión de seguridad

Revisión completa antes de publicar el facturador (23/10/2026). Se repite al cerrar cada fase.

## Lo que se revisó y está bien

| Tema | Cómo está protegido |
|---|---|
| Llaves de API | Una por canal, guardadas solo como huella SHA-256, comparadas en tiempo constante, revocables. Permisos por llave (`emitir`, `consultar`, `cobrar`, `anular`). |
| Datos de otra empresa | Toda consulta filtra por la empresa de la llave; un id ajeno responde 404 (probado). |
| Certificado y Clave SOL | Cifrados con AES-256-GCM y la `LLAVE_MAESTRA` (variable de entorno); nunca en la base en claro ni en GitHub. |
| Producción SUNAT | Doble candado: autorización registrada del dueño + `SUNAT_PERMITIR_PRODUCCION=si`. |
| Comprobantes, pagos, stock, archivos | Solo inserción o inmutables por disparadores en la base: ni con SQL directo se editan o borran. |
| Inyección SQL | Todas las consultas usan parámetros (`$1`, `$2`…). |
| Pedidos gigantes | Límite de 100 KB por pedido y de 120 pedidos por minuto por llave. |
| Errores | Al cliente nunca se le muestran detalles internos; solo se registran en el servidor (sin claves). |
| XML de SUNAT | El lector no resuelve entidades externas (sin XXE). |
| Repositorio | Sin certificados, claves ni `.env` (revisado con búsqueda de patrones). |

## Corregido en esta revisión

1. **Límite de intentos fallidos.** Antes se podían probar llaves sin fin y cada intento consultaba
   la base. Ahora, tras 20 intentos fallidos en un minuto desde una dirección, esa dirección
   queda frenada un minuto (429) **sin tocar la base**, incluso si después acierta la llave.
   También aplica a la clave del cron.
2. **Tabla del límite sin fin.** El contador de pedidos por minuto nunca se limpiaba; ahora sí.
3. **Cabeceras de seguridad** en todas las respuestas (`nosniff`, `SAMEORIGIN`, etc.).
4. **Bomba ZIP.** Las respuestas de SUNAT solo se descomprimen si son XML de hasta 5 MB.
5. **Conexión a la base** cifrada y verificada con el certificado de Supabase (`DATABASE_CA_CERT`).
6. **Respaldos** cifrados (AES-256) antes de salir hacia GitHub.

## Pendiente (con motivo)

| Pendiente | Por qué todavía no | Cuándo |
|---|---|---|
| `node-forge` (aviso GHSA-86w9-cpqp-85rv, sin parche) | El fallo está en *verificar* firmas RSA; aquí solo se usa para *abrir* el `.pfx`. Node no trae lector de PKCS#12. | Reemplazar si aparece una alternativa mantenida o el parche. |
| *Row Level Security* en PostgreSQL | Hoy el aislamiento lo hace la aplicación (probado). RLS sería una segunda barrera. | Antes de vender el servicio a otros negocios. |
| Usuario de base con permisos mínimos | Supabase entrega un usuario con todos los permisos; un usuario sin `TRUNCATE` ni permiso para quitar disparadores reduce el daño si se filtra la conexión. | Al pasar a producción. |
| Panel con verificación en dos pasos y roles | El panel web del facturador aún no existe (hoy: comandos + API). | Fase del panel. |
| Repositorio público | No contiene secretos y los respaldos van cifrados. Se mantiene público porque así GitHub Actions (cola cada 5 min) es gratis. | Hacerlo privado si se pasa a un servidor que no se duerma y la cola se mueve fuera de GitHub. |
