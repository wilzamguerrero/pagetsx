// Client-side upload engine. Sube archivos pesados (hasta 5 GB) a Notion a
// través de las Cloudflare Pages Functions (/api/upload-*).
//
// Estrategia de rendimiento:
// - Un ÚNICO semáforo global limita el total de subidas simultáneas a Notion
//   (chunks de archivos grandes + archivos pequeños comparten el mismo cupo).
//   Así se mantiene el tubo lleno sin saturar Notion (que responde 503 y obliga
//   a reintentos lentos cuando hay demasiadas peticiones a la vez).
// - Trozos de 16 MiB: menos peticiones por archivo, menos latencia acumulada.
// - Reintentos con backoff corto para no generar parones largos.

export interface UploadRecord {
  name: string;
  finalName: string;
  size: number;
  uploadId: string;
  extModified: boolean;
  mimeType: string;
  /**
   * Ruta relativa dentro del lote, incluyendo carpetas y el nombre del archivo.
   * Ej: "carpeta/subcarpeta/foto.png" o "foto.png" (raíz). El backend la usa
   * para reconstruir el árbol de toggles en Notion.
   */
  path: string;
}

/** Archivo en cola junto a su ruta relativa (para arrastre de carpetas). */
export interface QueuedFile {
  file: File;
  /** Ruta relativa con carpetas + nombre. Sin carpetas es solo el nombre. */
  path: string;
}

export interface UploadProgress {
  fileName: string;
  fileIndex: number;
  totalFiles: number;
  percent: number;
  step: string;
}

type ProgressCb = (p: UploadProgress) => void;
export type FileStatus = "pending" | "uploading" | "done";

// IMPORTANTE: CHUNK_SIZE debe coincidir con el de functions/api/upload-init.ts
const CHUNK_SIZE = 16 * 1024 * 1024; // 16 MiB
const SMALL_FILE_THRESHOLD = 20 * 1024 * 1024; // 20 MiB
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB (Notion limit)

// Total de subidas simultáneas a Notion (compartido por TODOS los archivos).
const GLOBAL_CONCURRENCY = 6;
// Cuántos archivos pueden estar "en curso" a la vez (adaptado al tamaño).
const SMALL_FILE_POOL = 6;
const LARGE_FILE_POOL = 3;

const MAX_PART_RETRIES = 6;
const MAX_SMALL_RETRIES = 4;

/** Semáforo simple para limitar concurrencia. */
class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ejecuta una operación de red con reintentos y backoff corto. */
async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        const backoff = Math.min(5000, 400 * Math.pow(2, attempt - 1));
        await sleep(backoff + Math.random() * 300);
      }
    }
  }
  throw lastError || new Error("Operación fallida.");
}

// Extensiones aceptadas por Notion (mirror del mapa MIME del servidor).
const NOTION_SUPPORTED_EXTENSIONS = new Set([
  "zip", "gz", "gzip", "tar", "7z", "bz2", "rar",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "tif", "ico", "heic", "avif", "apng",
  "aac", "adts", "mid", "midi", "mp3", "mpga", "m4a", "m4b", "oga", "ogg", "opus", "wav", "wma", "weba", "flac",
  "amv", "asf", "wmv", "avi", "f4v", "flv", "gifv", "m4v", "mp4", "mkv", "webm", "mov", "qt", "mpeg", "ogv", "3gp", "3g2",
  "pdf", "txt", "csv", "json", "doc", "dot", "docx", "dotx", "xls", "xlt", "xla", "xlsx", "xltx",
  "ppt", "pot", "pps", "ppa", "pptx", "potx", "rtf", "md", "markdown", "html", "htm", "epub", "xml", "css",
  "odt", "ods", "odp", "ics", "yaml", "yml", "tsv",
]);

const needsZipCompression = (filename: string): boolean => {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) return true;
  const ext = filename.slice(dotIndex + 1).toLowerCase();
  return !NOTION_SUPPORTED_EXTENSIONS.has(ext);
};

const compressFileToZip = async (file: File): Promise<File> => {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file(file.name, file);
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return new File([blob], file.name + ".zip", { type: "application/zip" });
};

/**
 * Sube un solo archivo a Notion, usando el semáforo global para cada operación
 * de red (así el cupo total es compartido entre todos los archivos del lote).
 */
export const uploadOneFile = async (
  file: File,
  fileIndex: number,
  totalFiles: number,
  sem: Semaphore,
  onProgress?: ProgressCb,
  relativePath?: string
): Promise<UploadRecord> => {
  const originalName = file.name;
  const path = relativePath || originalName;
  const label = `${originalName} (${fileIndex + 1}/${totalFiles})`;
  const report = (percent: number, step: string) =>
    onProgress?.({ fileName: originalName, fileIndex, totalFiles, percent, step });

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`"${originalName}" excede el límite de 5 GB.`);
  }

  // Comprimir tipos no soportados a ZIP real.
  let uploadFile = file;
  let wasCompressed = false;
  if (needsZipCompression(file.name)) {
    report(0, `Comprimiendo ${label} a ZIP...`);
    uploadFile = await compressFileToZip(file);
    wasCompressed = true;
  }

  // ── Archivo pequeño: una sola petición a /api/upload-file ──
  if (uploadFile.size <= SMALL_FILE_THRESHOLD) {
    report(0, `Subiendo ${label}...`);
    const data = await withRetry(async () => {
      const release = await sem.acquire();
      try {
        const fd = new FormData();
        fd.append("file", uploadFile, uploadFile.name);
        const res = await fetch("/api/upload-file", { method: "POST", body: fd });
        const text = await res.text();
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`Respuesta inesperada al subir "${originalName}".`);
        }
        if (!res.ok || !parsed.success) {
          throw new Error(parsed.error || `Error al subir "${originalName}"`);
        }
        return parsed;
      } finally {
        release();
      }
    }, MAX_SMALL_RETRIES);

    report(100, `Subido ${label}`);
    return {
      name: originalName,
      finalName: data.finalName as string,
      size: file.size,
      uploadId: data.id as string,
      extModified: wasCompressed || !!data.extModified,
      mimeType: file.type || "application/octet-stream",
      path,
    };
  }

  // ── Archivo grande: multi-part ──
  const numberOfParts = Math.ceil(uploadFile.size / CHUNK_SIZE);
  report(0, `Inicializando ${label} (${numberOfParts} partes)...`);

  const initRes = await fetch("/api/upload-init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: uploadFile.name,
      mimeType: uploadFile.type,
      fileSize: uploadFile.size,
    }),
  });
  const initData = await initRes.json();
  if (!initRes.ok || !initData.success) {
    throw new Error(initData.error || `Error al inicializar upload de "${originalName}"`);
  }

  const { id: uploadId, uploadName, contentType, mode } = initData;
  let completedParts = 0;

  const uploadPart = (partNumber: number): Promise<void> =>
    withRetry(async () => {
      const release = await sem.acquire();
      try {
        const start = (partNumber - 1) * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, uploadFile.size);
        const chunk = uploadFile.slice(start, end);

        const chunkBlob = new Blob([chunk], { type: contentType || "application/octet-stream" });
        const chunkFd = new FormData();
        if (mode === "multi_part") chunkFd.append("part_number", String(partNumber));
        chunkFd.append("file", chunkBlob, uploadName);

        const partRes = await fetch(`/api/upload-part?upload_id=${encodeURIComponent(uploadId)}`, {
          method: "POST",
          body: chunkFd,
        });
        const partText = await partRes.text();
        let partData: any;
        try {
          partData = JSON.parse(partText);
        } catch {
          throw new Error(`Respuesta inesperada al subir parte ${partNumber} de "${originalName}".`);
        }
        if (!partRes.ok || (!partData.success && !partData.id)) {
          throw new Error(partData.error || partData.message || `Error en parte ${partNumber}`);
        }

        completedParts++;
        const pct = Math.min(98, Math.round((completedParts / numberOfParts) * 100));
        report(pct, `Subiendo ${label} — ${completedParts}/${numberOfParts} partes (${pct}%)`);
      } finally {
        release();
      }
    }, MAX_PART_RETRIES);

  report(0, `Subiendo ${label} — 0/${numberOfParts} partes (0%)`);

  // Lanza todas las partes: cada una compite por un hueco del semáforo global.
  await Promise.all(
    Array.from({ length: numberOfParts }, (_, i) => uploadPart(i + 1))
  );

  if (mode === "multi_part") {
    report(99, `Finalizando ${label}...`);
    const completeRes = await fetch("/api/upload-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId }),
    });
    const completeData = await completeRes.json();
    if (!completeRes.ok || !completeData.success) {
      throw new Error(completeData.error || `Error al completar upload de "${originalName}"`);
    }
  }

  report(100, `Subido ${label}`);
  return {
    name: originalName,
    finalName: uploadName,
    size: file.size,
    uploadId,
    extModified: wasCompressed || !!initData.extModified,
    mimeType: file.type || "application/octet-stream",
    path,
  };
};

/**
 * Sube todos los archivos y luego los adjunta como bloques dentro del toggle.
 */
export const uploadFilesToBoard = async (
  boardId: string,
  items: QueuedFile[],
  onFileStatus?: (index: number, status: FileStatus) => void,
  onStep?: (step: string) => void
): Promise<{ count: number }> => {
  const records: UploadRecord[] = new Array(items.length);
  const sem = new Semaphore(GLOBAL_CONCURRENCY);

  // Pool de archivos adaptado: pocos archivos grandes a la vez (para que cada
  // uno acapare más huecos y termine antes) o muchos pequeños en paralelo.
  const hasLarge = items.some((it) => it.file.size > SMALL_FILE_THRESHOLD);
  const filePool = Math.min(hasLarge ? LARGE_FILE_POOL : SMALL_FILE_POOL, items.length);

  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      onFileStatus?.(i, "uploading");
      records[i] = await uploadOneFile(
        items[i].file,
        i,
        items.length,
        sem,
        (p) => onStep?.(p.step),
        items[i].path
      );
      onFileStatus?.(i, "done");
    }
  };

  await Promise.all(Array.from({ length: filePool }, () => worker()));

  onStep?.("Adjuntando a Notion...");

  const res = await fetch("/api/upload-attach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blockId: boardId, fileRecords: records }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Error al adjuntar los archivos en Notion.");
  }

  return { count: data.count };
};
