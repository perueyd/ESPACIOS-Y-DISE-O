/**
 * Configuración desde variables de entorno (ver .env.example). Única fuente para el
 * servidor de la API y los comandos de consola.
 */
import { AlmacenLocal, type Almacen } from './almacen/almacen.js';
import type { ServiciosEnvio } from './cola/procesar.js';
import { algoritmoDesdeEntorno } from './firma/firmar.js';
import { llaveMaestraDesdeEntorno } from './seguridad/cifrado.js';
import { ClienteSunatSoap } from './sunat/cliente.js';

export function serviciosDesdeEntorno(
  entorno: NodeJS.ProcessEnv = process.env,
  opciones: { tiempoMaximoSunatMs?: number } = {},
): ServiciosEnvio & { almacen: Almacen } {
  return {
    almacen: new AlmacenLocal(entorno.ALMACEN_DIR ?? 'almacen'),
    llaveMaestra: llaveMaestraDesdeEntorno(entorno.LLAVE_MAESTRA),
    algoritmo: algoritmoDesdeEntorno(entorno.FIRMA_ALGORITMO),
    entorno,
    crearCliente: (url, credenciales) =>
      new ClienteSunatSoap({ url, credenciales, ...(opciones.tiempoMaximoSunatMs ? { tiempoMaximoMs: opciones.tiempoMaximoSunatMs } : {}) }),
  };
}
