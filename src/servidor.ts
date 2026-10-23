/**
 * Servidor HTTP de la API.   npm run servidor
 * Variables: DATABASE_URL, LLAVE_MAESTRA, ALMACEN_DIR, FIRMA_ALGORITMO, CLAVE_CRON, PUERTO.
 */
import { serve } from '@hono/node-server';
import { crearApp } from './api/app.js';
import { serviciosDesdeEntorno } from './config.js';
import { crearPool } from './db/conexion.js';

const db = crearPool();
// Al emitir, la tienda espera la respuesta: el intento inmediato a SUNAT se corta a los 8 s
// y, si no alcanza, sigue en la cola.
const app = crearApp({
  db,
  servicios: serviciosDesdeEntorno(process.env, { tiempoMaximoSunatMs: 8_000 }),
  ...(process.env.CLAVE_CRON ? { claveCron: process.env.CLAVE_CRON } : {}),
});
const puerto = Number(process.env.PUERTO ?? 3000);
serve({ fetch: app.fetch, port: puerto }, () => console.log(`Facturador escuchando en http://localhost:${puerto}`));
