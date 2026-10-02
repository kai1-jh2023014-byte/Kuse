export const MAX_LIBRARY = 200;
export const MAX_PAGES_PER_DOCUMENT = 40;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 80 * 1024 * 1024;
export const VISION_THUMBNAIL_LIMIT = 24;

export const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "jpe",
  "webp",
  "gif",
  "bmp",
  "svg",
  "avif",
  "heic",
  "heif",
  "tif",
  "tiff",
]);

export function fileExtension(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function isImageFileName(name: string): boolean {
  return IMAGE_EXTENSIONS.has(fileExtension(name));
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || fileExtension(file.name) === "pdf";
}

export function isZipLike(file: File): boolean {
  const ext = fileExtension(file.name);
  return (
    ext === "zip" ||
    ext === "pptx" ||
    ext === "ppt" ||
    ext === "docx" ||
    file.type === "application/zip" ||
    file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}
