import { createInterface } from 'node:readline';

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
