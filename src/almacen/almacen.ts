/**
 * Almacenamiento de archivos (XML firmados, CDR, PDF).
 *
 * Regla: los archivos se escriben UNA vez y nunca se sobrescriben. En producción
 * se usará un almacenamiento tipo S3 con versionado y bloqueo de objetos (fase 4);
 * `AlmacenLocal` sirve para desarrollo y pruebas.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

export interface Almacen {
  /** Guarda el archivo. Falla si ya existe un archivo distinto en esa ruta. */
  guardar(ruta: string, contenido: Buffer): Promise<void>;
  leer(ruta: string): Promise<Buffer>;
}

export class ErrorAlmacen extends Error {}

const RUTA_VALIDA = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export function validarRuta(ruta: string): void {
  if (!RUTA_VALIDA.test(ruta) || ruta.split('/').some((p) => p === '..' || p === '.')) {
    throw new ErrorAlmacen(`Ruta de archivo no permitida: "${ruta}"`);
  }
}

export class AlmacenLocal implements Almacen {
  private readonly base: string;

  constructor(base: string) {
    this.base = resolve(base);
  }

  private absoluta(ruta: string): string {
    validarRuta(ruta);
    const abs = resolve(this.base, ruta);
    if (!abs.startsWith(this.base + sep)) throw new ErrorAlmacen(`Ruta fuera del almacén: "${ruta}"`);
    return abs;
  }

  async guardar(ruta: string, contenido: Buffer): Promise<void> {
    const abs = this.absoluta(ruta);
    await mkdir(dirname(abs), { recursive: true });
    try {
      await writeFile(abs, contenido, { flag: 'wx' }); // wx = falla si ya existe
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      // Reintento tras un fallo: si el contenido es idéntico, no es un problema.
      const existente = await readFile(abs);
      if (!existente.equals(contenido)) throw new ErrorAlmacen(`Ya existe un archivo distinto en "${ruta}"; no se sobrescribe.`);
    }
  }

  async leer(ruta: string): Promise<Buffer> {
    return readFile(this.absoluta(ruta));
  }
}
