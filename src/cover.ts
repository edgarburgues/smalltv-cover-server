import sharp from "sharp";
import { createHash } from "node:crypto";

export async function encodeCover(input: Buffer) {
  const rgb = await sharp(input, { limitInputPixels: 16000000 })
    .rotate().resize(240, 240, { fit: "cover" }).flatten({ background: "black" })
    .toColourspace("srgb").removeAlpha().raw().toBuffer();
  const frame = Buffer.alloc(240 * 240 * 2);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 2)
    frame.writeUInt16LE(((rgb[i]! >> 3) << 11) | ((rgb[i + 1]! >> 2) << 5) | (rgb[i + 2]! >> 3), j);
  return { frame, etag: '"' + createHash("sha256").update(frame).digest("hex") + '"' };
}

export function createCoverHandler(load: () => Promise<Buffer>, interval = 10000) {
  let cached: Awaited<ReturnType<typeof encodeCover>> | undefined;
  let nextCheck = 0;
  let pending: Promise<void> | undefined;
  let failed = false;
  return async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (path === "/health") return Response.json({ ready: !!cached, stale: failed });
    if (path !== "/api/cover.rgb565") return new Response("Not found", { status: 404 });
    if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
    if (Date.now() >= nextCheck && !pending) {
      pending = (async () => {
        try { cached = await encodeCover(await load()); failed = false; }
        catch { failed = true; console.error("Cover refresh failed; check YouTube credentials and connectivity."); }
        finally { nextCheck = Date.now() + interval; pending = undefined; }
      })();
    }
    await pending;
    if (!cached) return new Response("Cover unavailable", { status: 503, headers: { "Retry-After": "10" } });
    const headers = { ETag: cached.etag, "Cache-Control": "no-cache", "X-Cover-Stale": String(failed) };
    if (request.headers.get("If-None-Match") === cached.etag) return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(cached.frame), { headers: { ...headers,
      "Content-Type": "application/octet-stream", "Content-Length": String(cached.frame.length),
      "X-Cover-Format": "rgb565le-240x240-v1" } });
  };
}
