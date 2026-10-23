/**
 * Genera una LLAVE_MAESTRA nueva para cifrar certificados y claves.
 * Guárdala en las variables de entorno (Vercel/Supabase) y en un gestor de contraseñas.
 * Si se pierde, los certificados cifrados con ella no se pueden recuperar (habría que volver a cargarlos).
 * Usa una llave distinta para pruebas y para producción.
 */
import { generarLlaveMaestra } from '../src/seguridad/cifrado.js';

console.log(generarLlaveMaestra());
