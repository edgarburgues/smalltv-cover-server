import { test, expect } from "bun:test";
import sharp from "sharp";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const runtime of ["bun", "node"]) test(runtime + " HTTP transport serves exact bytes and 304", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smalltv-test-"));
  const path = join(dir, "cover.png");
  await sharp({ create: { width: 240, height: 240, channels: 3,
    background: { r: 255, g: 0, b: 0 } } }).png().toFile(path);
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port!; probe.stop(true);
  const child = Bun.spawn(runtime === "bun" ? [process.execPath, "index.ts"] : ["node", "azure/server.mjs"], {
    cwd: join(import.meta.dir, ".."), env: { ...process.env, COVER_FILE: path, PORT: String(port), HOST: "127.0.0.1" },
    stdout: "ignore", stderr: "pipe",
  });
  try {
    const url = "http://127.0.0.1:" + port;
    let ready = false;
    for (let i=0; i<100; i++) {
      try { ready = (await fetch(url + "/health")).ok; } catch {}
      if (ready) break;
      await Bun.sleep(50);
    }
    expect(ready).toBe(true);
    const first = await fetch(url + "/api/cover.rgb565");
    expect(first.status).toBe(200);
    const bytes = Buffer.from(await first.arrayBuffer());
    expect(bytes.length).toBe(115200);
    expect(bytes.readUInt16LE(0)).toBe(0xf800);
    expect(bytes.readUInt16LE(115198)).toBe(0xf800);
    const same = await fetch(url + "/api/cover.rgb565", { headers: { "If-None-Match": first.headers.get("etag")! } });
    expect(same.status).toBe(304);
    expect((await same.arrayBuffer()).byteLength).toBe(0);
  } finally {
    child.kill(); await child.exited;
    await rm(dir, { recursive: true, force: true });
  }
}, 15000);
