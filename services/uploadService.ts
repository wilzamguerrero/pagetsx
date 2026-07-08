// Client-side upload engine. Ports the robust chunked-upload flow used by the
// "upz" project so heavy files (up to 5 GB) can be sent to Notion through the
// Cloudflare Pages Functions (/api/upload-*).

export interface UploadRecord {
  name: string;
  finalName: string;
  size: number;
  uploadId: string;
  extModified: boolean;
  mimeType: string;
}

export interface UploadProgress {
  fileName: string;
  fileIndex: number;
  totalFiles: number;
  percent: number;
  step: string;
}

type ProgressCb = (p: UploadProgress) => void;

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MiB — matches server-side chunk size
const SMALL_FILE_THRESHOLD = 20 * 1024 * 1024; // 20 MiB
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB (Notion limit)

// Extensions accepted by Notion's File Upload API (mirrors the server MIME map).
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
  if (dotIndex === -1) return true; // no extension
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
 * Upload a single file to Notion.
 * - Unsupported extensions → compressed to a real ZIP first
 * - Files ≤ 20MB → single request to /api/upload-file
 * - Files > 20MB → chunked flow (init → parts → complete)
 */
export const uploadOneFile = async (
  file: File,
  fileIndex: number,
  totalFiles: number,
  onProgress?: ProgressCb
): Promise<UploadRecord> => {
  const originalName = file.name;
  const label = `${originalName} (${fileIndex + 1}/${totalFiles})`;

  const report = (percent: number, step: string) =>
    onProgress?.({ fileName: originalName, fileIndex, totalFiles, percent, step });

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`"${originalName}" excede el límite de 5 GB.`);
  }

  // Compress unsupported file types to a real ZIP.
  let uploadFile = file;
  let wasCompressed = false;
  if (needsZipCompression(file.name)) {
    report(0, `Comprimiendo ${label} a ZIP...`);
    uploadFile = await compressFileToZip(file);
    wasCompressed = true;
  }

  // ── Archivo pequeño: una sola petición a /api/upload-file (rápido) ──
  if (uploadFile.size <= SMALL_FILE_THRESHOLD) {
    report(0, `Subiendo ${label}...`);

    const fd = new FormData();
    fd.append("file", uploadFile, uploadFile.name);

    const res = await fetch("/api/upload-file", { method: "POST", body: fd });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Respuesta inesperada del servidor al subir "${originalName}".`);
    }
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Error al subir "${originalName}"`);
    }

    report(100, `Subido ${label}`);

    return {
      name: originalName,
      finalName: data.finalName as string,
      size: file.size,
      uploadId: data.id as string,
      extModified: wasCompressed || !!data.extModified,
      mimeType: file.type || "application/octet-stream",
    };
  }

  // ── Large file: chunked flow ──
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

  const MAX_PART_RETRIES = 6;
  const PART_CONCURRENCY = 3;
  let completedParts = 0;

  const uploadPart = async (partNumber: number): Promise<void> => {
    const start = (partNumber - 1) * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, uploadFile.size);
    const chunk = uploadFile.slice(start, end);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_PART_RETRIES; attempt++) {
      const chunkBlob = new Blob([chunk], { type: contentType || "application/octet-stream" });
      const chunkFd = new FormData();
      if (mode === "multi_part") {
        chunkFd.append("part_number", String(partNumber));
      }
      chunkFd.append("file", chunkBlob, uploadName);

      try {
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
        return;
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_PART_RETRIES) {
          const backoff = Math.min(16000, 1000 * Math.pow(2, attempt - 1));
          await new Promise((r) => setTimeout(r, backoff + Math.random() * 500));
        }
      }
    }

    throw new Error(
      `Error en parte ${partNumber} de "${originalName}" tras ${MAX_PART_RETRIES} intentos: ${
        lastError?.message || "Error de red"
      }`
    );
  };

  report(0, `Subiendo ${label} — 0/${numberOfParts} partes (0%)`);

  let nextPart = 1;
  const runWorker = async (): Promise<void> => {
    while (true) {
      const partNumber = nextPart++;
      if (partNumber > numberOfParts) return;
      await uploadPart(partNumber);
    }
  };

  const workers = Array.from(
    { length: Math.min(PART_CONCURRENCY, numberOfParts) },
    () => runWorker()
  );
  await Promise.all(workers);

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
  };
};

export type FileStatus = "pending" | "uploading" | "done";

// Cuántos archivos se suben a la vez. Varios archivos pequeños en paralelo
// aceleran mucho la subida frente a hacerlos de uno en uno.
const FILE_CONCURRENCY = 4;
const FILE_RETRIES = 3;

const uploadOneFileWithRetry = async (
  file: File,
  index: number,
  total: number,
  onProgress?: ProgressCb
): Promise<UploadRecord> => {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= FILE_RETRIES; attempt++) {
    try {
      return await uploadOneFile(file, index, total, onProgress);
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < FILE_RETRIES) {
        const backoff = Math.min(8000, 800 * Math.pow(2, attempt - 1));
        await new Promise((r) => setTimeout(r, backoff + Math.random() * 400));
      }
    }
  }
  throw lastError || new Error(`No se pudo subir "${file.name}".`);
};

/**
 * Sube todos los archivos (en paralelo, con reintentos) y luego los adjunta
 * como bloques dentro del toggle destino.
 */
export const uploadFilesToBoard = async (
  boardId: string,
  files: File[],
  onFileStatus?: (index: number, status: FileStatus) => void,
  onStep?: (step: string) => void
): Promise<{ count: number }> => {
  const records: UploadRecord[] = new Array(files.length);

  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= files.length) return;
      onFileStatus?.(i, "uploading");
      records[i] = await uploadOneFileWithRetry(files[i], i, files.length, (p) =>
        onStep?.(p.step)
      );
      onFileStatus?.(i, "done");
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(FILE_CONCURRENCY, files.length) }, () => worker())
  );

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
