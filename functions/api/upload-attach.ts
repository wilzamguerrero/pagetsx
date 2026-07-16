import {
  json,
  type Env,
  NOTION_VERSION,
  NOTION_BASE,
  IMAGE_MIME_TYPES,
  cleanNotionId,
} from "../_shared/notion";
import { resolveSite } from "../_shared/sites";

// Extensiones de video que Notion acepta como bloque "video" reproducible.
const VIDEO_EXTENSIONS = new Set([
  "mp4", "mov", "webm", "m4v", "ogv", "avi", "wmv", "asf",
  "flv", "f4v", "amv", "mpeg", "qt", "mkv", "3gp", "3g2",
]);

const getExt = (name: string): string => {
  const i = name.lastIndexOf(".");
  return i !== -1 ? name.slice(i + 1).toLowerCase() : "";
};

interface FileRecord {
  name: string;
  finalName: string;
  size: number;
  uploadId: string;
  extModified: boolean;
  mimeType: string;
  /** Ruta relativa (carpetas + nombre). Opcional para compatibilidad. */
  path?: string;
}

/** Construye el bloque nativo de Notion (image/video/file) para un archivo. */
function buildFileBlock(f: FileRecord): any {
  const ext = getExt(f.name);
  const isImage = IMAGE_MIME_TYPES.has(f.mimeType) || f.mimeType.startsWith("image/");
  // Los videos comprimidos a .zip (extModified) ya no son reproducibles.
  const isVideo = !f.extModified && (f.mimeType.startsWith("video/") || VIDEO_EXTENSIONS.has(ext));
  const caption = f.extModified
    ? [{ type: "text", text: { content: `${f.name} (.zip)` } }]
    : [{ type: "text", text: { content: f.name } }];

  if (isImage) {
    return {
      object: "block",
      type: "image",
      image: { type: "file_upload", file_upload: { id: f.uploadId }, caption },
    };
  }
  if (isVideo) {
    return {
      object: "block",
      type: "video",
      video: { type: "file_upload", file_upload: { id: f.uploadId }, caption },
    };
  }
  return {
    object: "block",
    type: "file",
    file: { type: "file_upload", file_upload: { id: f.uploadId }, caption },
  };
}

/** Bloque toggle vacío con el nombre de la carpeta como título. */
function buildToggleBlock(name: string): any {
  return {
    object: "block",
    type: "toggle",
    toggle: {
      rich_text: [{ type: "text", text: { content: name } }],
    },
  };
}

// ── Árbol de carpetas reconstruido a partir de las rutas relativas ──
interface TreeNode {
  files: FileRecord[];
  folders: Map<string, TreeNode>;
}

const newNode = (): TreeNode => ({ files: [], folders: new Map() });

/** Divide una ruta en segmentos, ignorando vacíos y separadores mixtos. */
function splitPath(path: string): string[] {
  return path.split(/[\\/]+/).filter((seg) => seg && seg !== "." && seg !== "..");
}

/** Inserta un archivo en el árbol según su ruta relativa. */
function insertIntoTree(root: TreeNode, record: FileRecord): void {
  const segments = splitPath(record.path || record.name);
  // El último segmento es el nombre del archivo; los previos son carpetas.
  const folderSegments = segments.slice(0, -1);
  let node = root;
  for (const folder of folderSegments) {
    let child = node.folders.get(folder);
    if (!child) {
      child = newNode();
      node.folders.set(folder, child);
    }
    node = child;
  }
  node.files.push(record);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const notionSecret = resolveSite(context.request, context.env).secret;
  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  let body: { blockId?: string; fileRecords?: FileRecord[] };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido." }, 400);
  }

  const blockId = cleanNotionId(body.blockId || "");
  const fileRecords = body.fileRecords || [];

  if (!blockId) {
    return json({ error: "Se requiere el bloque destino." }, 400);
  }
  if (fileRecords.length === 0) {
    return json({ error: "No se han subido archivos." }, 400);
  }

  const headers = {
    Authorization: `Bearer ${notionSecret}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };

  /** Añade bloques hijos a un padre en lotes de 100. Devuelve los bloques creados. */
  async function appendChildren(parentId: string, blocks: any[]): Promise<any[]> {
    const created: any[] = [];
    for (let i = 0; i < blocks.length; i += 100) {
      const batch = blocks.slice(i, i + 100);
      const res = await fetch(`${NOTION_BASE}/blocks/${parentId}/children`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ children: batch }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        const msg = data?.message || data?.code || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      if (Array.isArray(data.results)) created.push(...data.results);
    }
    return created;
  }

  let totalBlocks = 0;

  /** Recorre un nodo del árbol: sube archivos y crea toggles para subcarpetas. */
  async function attachNode(parentId: string, node: TreeNode): Promise<void> {
    // 1. Archivos directos de este nivel.
    if (node.files.length > 0) {
      const fileBlocks = node.files.map(buildFileBlock);
      await appendChildren(parentId, fileBlocks);
      totalBlocks += fileBlocks.length;
    }

    // 2. Subcarpetas: crea todos los toggles de este nivel y luego rellena cada uno.
    const folderEntries = Array.from(node.folders.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    if (folderEntries.length > 0) {
      const toggleBlocks = folderEntries.map(([name]) => buildToggleBlock(name));
      const createdToggles = await appendChildren(parentId, toggleBlocks);
      totalBlocks += toggleBlocks.length;

      for (let i = 0; i < folderEntries.length; i++) {
        const childNode = folderEntries[i][1];
        const toggle = createdToggles[i];
        if (toggle?.id) {
          await attachNode(toggle.id, childNode);
        }
      }
    }
  }

  try {
    const root = newNode();
    for (const record of fileRecords) insertIntoTree(root, record);
    await attachNode(blockId, root);
    return json({ success: true, count: totalBlocks });
  } catch (err: any) {
    return json(
      { error: `Error al adjuntar archivos en Notion: ${err.message || "Error desconocido"}` },
      500
    );
  }
};
