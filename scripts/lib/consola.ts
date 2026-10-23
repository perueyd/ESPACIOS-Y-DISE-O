import { createInterface } from 'node:readline';
import type { Db } from '../../src/db/conexion.js';

/** Pide un dato por teclado sin mostrarlo en pantalla (para contraseñas). */
export function pedirOculto(pregunta: string): Promise<string> {
  if (process.env.CLAVE_PFX !== undefined) return Promise.resolve(process.env.CLAVE_PFX); // solo para automatizar
  return new Promise((ok) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const escribir = rl as unknown as { _writeToOutput: (s: string) => void };
    process.stdout.write(pregunta);
    escribir._writeToOutput = () => undefined; // no mostrar lo que se escribe
    rl.question('', (r) => {
      rl.close();
      process.stdout.write('\n');
      ok(r);
    });
  });
}

/** Empresa por su RUC, o un error claro si no existe. */
export async function empresaPorRuc(db: Db, ruc: string | undefined): Promise<{ id: string; razonSocial: string }> {
  const r = await db.query(`SELECT id, razon_social FROM empresas WHERE ruc = $1`, [ruc ?? '']);
  if (!r.rows[0]) throw new Error(`No existe la empresa ${ruc}. Créala con npm run empresa:configurar.`);
  return { id: r.rows[0].id, razonSocial: r.rows[0].razon_social };
}
