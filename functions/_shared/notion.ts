// Shared helpers for Notion file-upload Pages Functions (Cloudflare).
// The file-upload API requires a recent Notion-Version.
export const NOTION_VERSION = "2026-03-11";
export const NOTION_BASE = "https://api.notion.com/v1";

export interface Env {
  // Same secret name used by the existing Notion proxy.
  NOTION_PORTFOLIO_KEY?: string;
  NOTION_SECRET?: string;
  [key: string]: unknown;
}

/** Resolve the Notion integration secret from the Pages environment. */
export function getSecret(env: Env): string {
  return (env.NOTION_PORTFOLIO_KEY || env.NOTION_SECRET || "") as string;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

const NOTION_MIME_TYPES: Record<string, string> = {
  // Archives & Compressed
  zip: "application/zip",
  gz: "application/gzip",
  gzip: "application/gzip",
  tar: "application/x-tar",
  "7z": "application/x-7z-compressed",
  bz2: "application/x-bzip2",
  rar: "application/vnd.rar",
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  ico: "image/vnd.microsoft.icon",
  heic: "image/heic",
  avif: "image/avif",
  apng: "image/apng",
  psd: "image/vnd.adobe.photoshop",
  psb: "image/vnd.adobe.photoshop",
  ai: "application/postscript",
  eps: "application/postscript",
  indd: "application/x-indesign",
  raw: "image/x-raw",
  cr2: "image/x-canon-cr2",
  nef: "image/x-nikon-nef",
  arw: "image/x-sony-arw",
  dng: "image/x-adobe-dng",
  xcf: "image/x-xcf",
  sketch: "application/zip",
  fig: "application/octet-stream",
  // Audio
  aac: "audio/aac",
  adts: "audio/aac",
  mid: "audio/midi",
  midi: "audio/midi",
  mp3: "audio/mpeg",
  mpga: "audio/mpeg",
  m4a: "audio/mp4",
  m4b: "audio/mp4",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  wma: "audio/x-ms-wma",
  weba: "audio/webm",
  flac: "audio/x-flac",
  // Video
  amv: "video/x-amv",
  asf: "video/x-ms-asf",
  wmv: "video/x-ms-asf",
  avi: "video/x-msvideo",
  f4v: "video/x-f4v",
  flv: "video/x-flv",
  gifv: "video/mp4",
  m4v: "video/mp4",
  mp4: "video/mp4",
  mkv: "video/webm",
  webm: "video/webm",
  mov: "video/quicktime",
  qt: "video/quicktime",
  mpeg: "video/mpeg",
  ogv: "video/ogg",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  // Documents
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  doc: "application/msword",
  dot: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  dotx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  xls: "application/vnd.ms-excel",
  xlt: "application/vnd.ms-excel",
  xla: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xltx: "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  ppt: "application/vnd.ms-powerpoint",
  pot: "application/vnd.ms-powerpoint",
  pps: "application/vnd.ms-powerpoint",
  ppa: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  potx: "application/vnd.openxmlformats-officedocument.presentationml.template",
  rtf: "application/rtf",
  md: "text/markdown",
  markdown: "text/markdown",
  html: "text/html",
  htm: "text/html",
  epub: "application/epub+zip",
  xml: "text/xml",
  css: "text/css",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  ics: "text/calendar",
  yaml: "text/yaml",
  yml: "text/yaml",
  tsv: "text/tab-separated-values",
  // CAD / 3D
  dwg: "application/acad",
  dxf: "application/dxf",
  stl: "model/stl",
  obj: "model/obj",
  fbx: "application/octet-stream",
  blend: "application/x-blender",
  // Programming / data
  js: "text/javascript",
  ts: "text/typescript",
  py: "text/x-python",
  java: "text/x-java",
  c: "text/x-c",
  cpp: "text/x-c++",
  h: "text/x-c",
  rs: "text/x-rust",
  go: "text/x-go",
  rb: "text/x-ruby",
  php: "text/x-php",
  swift: "text/x-swift",
  kt: "text/x-kotlin",
  sql: "application/sql",
  sh: "application/x-sh",
  bat: "application/x-bat",
  ps1: "application/x-powershell",
  log: "text/plain",
  ini: "text/plain",
  cfg: "text/plain",
  conf: "text/plain",
  env: "text/plain",
  toml: "text/plain",
};

/**
 * Compute upload name + content type.
 * Known extensions use a standardized MIME type; unknown extensions are wrapped
 * as .zip (the browser compresses them to real ZIPs before upload).
 */
export function resolveUploadMeta(
  filename: string,
  mimeType: string
): { uploadName: string; contentType: string; extModified: boolean } {
  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex !== -1 ? filename.slice(dotIndex + 1).toLowerCase() : "";
  let uploadName = filename;
  let contentType = mimeType || "application/octet-stream";
  let extModified = false;

  const standardMime = NOTION_MIME_TYPES[ext];
  if (standardMime) {
    contentType = standardMime;
  } else {
    uploadName = filename + ".zip";
    contentType = "application/zip";
    extModified = true;
  }
  return { uploadName, contentType, extModified };
}

export const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
]);

/** Clean a Notion block/page ID from a pasted URL or dashed/plain UUID. */
export function cleanNotionId(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const dashed = trimmed.match(
    /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i
  );
  if (dashed) return dashed[0];
  const plain = trimmed.match(/[a-f0-9]{32}/i);
  if (plain) return plain[0];
  return trimmed;
}
