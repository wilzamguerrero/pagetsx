import { json, type Env, NOTION_VERSION, NOTION_BASE, resolveUploadMeta } from "../_shared/notion";
import { resolveSite } from "../_shared/sites";

// 95 MiB — bajo el límite de 100 MB de body de Cloudflare por request.
const MAX_FILE_SIZE = 95 * 1024 * 1024;

/**
 * POST /api/upload-file
 * Recibe multipart/form-data con un único campo "file", lo sube a Notion
 * (crear + enviar) en UNA sola petición y devuelve el uploadId.
 *
 * Es la vía rápida para archivos pequeños: evita el ida y vuelta extra que
 * supone hacer upload-init y upload-part por separado desde el navegador.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const notionSecret = resolveSite(context.request, context.env).secret;
  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  let formData: FormData;
  try {
    formData = await context.request.formData();
  } catch {
    return json({ error: "No se pudo leer el formulario." }, 400);
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return json({ error: "No se proporcionó ningún archivo." }, 400);
  }
  if (file.size > MAX_FILE_SIZE) {
    return json({ error: `"${file.name}" excede el límite de 95 MB por request.` }, 413);
  }

  const { uploadName, contentType, extModified } = resolveUploadMeta(file.name, file.type);

  try {
    // Paso 1: crear el file upload (single-part)
    const createRes = await fetch(`${NOTION_BASE}/file_uploads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionSecret}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filename: uploadName, content_type: contentType }),
    });
    const upload = (await createRes.json()) as any;
    if (!upload.id) {
      throw new Error(`No se pudo crear el upload: ${JSON.stringify(upload)}`);
    }

    // Paso 2: enviar el contenido (re-envuelto con el content type correcto)
    const buf = await file.arrayBuffer();
    const blob = new Blob([buf], { type: contentType });
    const sendForm = new FormData();
    sendForm.append("file", blob, uploadName);

    const sendUrl = upload.upload_url || `${NOTION_BASE}/file_uploads/${upload.id}/send`;
    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionSecret}`,
        "Notion-Version": NOTION_VERSION,
      },
      body: sendForm,
    });
    const sent = (await sendRes.json()) as any;
    if (sent.status !== "uploaded" && sent.status !== "complete") {
      throw new Error(`Error al enviar archivo a Notion: ${JSON.stringify(sent)}`);
    }

    return json({
      success: true,
      id: upload.id,
      finalName: uploadName,
      extModified,
    });
  } catch (err: any) {
    return json(
      { error: `Error al subir "${file.name}": ${err.message || "Error desconocido"}` },
      500
    );
  }
};
