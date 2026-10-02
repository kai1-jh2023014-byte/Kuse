function view(buffer: Uint8Array) {
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function readString(buffer: Uint8Array, start: number, length: number): string {
  return new TextDecoder("utf-8").decode(buffer.subarray(start, start + length));
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("この環境では圧縮ZIPを解けません");
  }
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** ZIP/PPTX/DOCX local-file entries. Supports store (0) and deflate (8). */
export async function unzipEntries(buffer: Uint8Array): Promise<Array<{ path: string; data: Uint8Array }>> {
  const files: Array<{ path: string; data: Uint8Array }> = [];
  let offset = 0;
  const data = view(buffer);
  while (offset + 30 <= buffer.length) {
    const signature = data.getUint32(offset, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) break;
    const method = data.getUint16(offset + 8, true);
    const compressedSize = data.getUint32(offset + 18, true);
    const nameLength = data.getUint16(offset + 26, true);
    const extraLength = data.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const path = readString(buffer, nameStart, nameLength);
    const dataStart = nameStart + nameLength + extraLength;
    const payload = buffer.subarray(dataStart, dataStart + compressedSize);
    offset = dataStart + compressedSize;
    if (!path || path.endsWith("/")) continue;
    let raw: Uint8Array;
    if (method === 0) raw = payload.slice();
    else if (method === 8) raw = await inflateRaw(payload);
    else continue;
    files.push({ path, data: raw });
  }
  return files;
}

export function zipStore(entries: Record<string, Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const encoder = new TextEncoder();
  for (const [path, body] of Object.entries(entries)) {
    const name = encoder.encode(path);
    const local = new Uint8Array(30 + name.length + body.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(18, body.length, true);
    localView.setUint32(22, body.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    chunks.push(local);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint32(20, body.length, true);
    centralView.setUint32(24, body.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralStart = offset;
  const centralBlob = concat(centrals);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centrals.length, true);
  endView.setUint16(10, centrals.length, true);
  endView.setUint32(12, centralBlob.length, true);
  endView.setUint32(16, centralStart, true);
  return concat([...chunks, centralBlob, end]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
