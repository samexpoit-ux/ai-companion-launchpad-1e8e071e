export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_CHARS = 60_000;

export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: "image" | "text";
  content: string;
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "csv", "json", "xml", "yaml", "yml", "toml", "js", "jsx", "ts", "tsx",
  "css", "scss", "html", "php", "py", "rb", "go", "java", "kt", "sql", "sh", "env", "log",
]);

function extension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function acceptsAttachment(file: File) {
  return file.type.startsWith("image/") || file.type.startsWith("text/") || TEXT_EXTENSIONS.has(extension(file.name));
}

function readAsDataUrl(file: File, onProgress?: (progress: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function prepareAttachment(file: File, onProgress?: (progress: number) => void): Promise<ChatAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} is larger than 5 MB.`);
  if (!acceptsAttachment(file)) throw new Error(`${file.name} is not a supported image or text/code file.`);
  const kind = file.type.startsWith("image/") ? "image" : "text";
  onProgress?.(5);
  const content = kind === "image" ? await readAsDataUrl(file, onProgress) : (await file.text()).slice(0, MAX_TEXT_CHARS);
  onProgress?.(100);
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name.slice(0, 180),
    type: file.type || "text/plain",
    size: file.size,
    kind,
    content,
  };
}

export function attachmentSummary(attachments: ChatAttachment[]) {
  return attachments.length ? `\n\nAttachments: ${attachments.map((item) => item.name).join(", ")}` : "";
}