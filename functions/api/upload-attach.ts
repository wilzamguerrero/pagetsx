import {
  json,
  getSecret,
  type Env,
  NOTION_VERSION,
  NOTION_BASE,
  IMAGE_MIME_TYPES,
  cleanNotionId,
} from "../_shared/notion";

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
}

/**
 * POST /api/upload-attach
 * Appends the previously uploaded files as native Notion blocks inside a block
 * (a toggle list). Images render inline; everything else becomes a file block.
 *
 * Body: { blockId: string, fileRecords: FileRecord[] }
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const notionSecret = getSecret(context.env);
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

  const children = fileRecords.map((f) => {
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
        image: {
          type: "file_upload",
          file_upload: { id: f.uploadId },
          caption,
        },
      };
    }

    if (isVideo) {
      return {
        object: "block",
        type: "video",
        video: {
          type: "file_upload",
          file_upload: { id: f.uploadId },
          caption,
        },
      };
    }

    return {
      object: "block",
      type: "file",
      file: {
        type: "file_upload",
        file_upload: { id: f.uploadId },
        caption,
      },
    };
  });

  try {
    const res = await fetch(`${NOTION_BASE}/blocks/${blockId}/children`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${notionSecret}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ children }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) {
      const msg = data?.message || data?.code || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json({ success: true, count: children.length });
  } catch (err: any) {
    return json(
      { error: `Error al adjuntar archivos en Notion: ${err.message || "Error desconocido"}` },
      500
    );
  }
};
