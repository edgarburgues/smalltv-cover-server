import { describe, test, expect } from "bun:test";
import sharp from "sharp";
import { encodeCover, createCoverHandler } from "./cover";

const request = (etag?: string) => new Request("http://localhost/api/cover.rgb565",
  { headers: etag ? { "If-None-Match": etag } : {} });
async function solid(r: number, g: number, b: number) {
  return sharp({ create: { width: 17, height: 31, channels: 3, background: { r, g, b } } }).png().toBuffer();
}
describe("ESP8266 wire contract", () => {
  test("resizes and sends exact RGB565 little-endian primary colours", async () => {
    for (const [r,g,b,expected] of [[255,0,0,0xf800],[0,255,0,0x07e0],[0,0,255,0x001f]]) {
      const { frame } = await encodeCover(await solid(r!,g!,b!));
      expect(frame.length).toBe(115200);
      for (let i=0;i<frame.length;i+=2) expect(frame.readUInt16LE(i)).toBe(expected!);
    }
  });
  test("coalesces concurrent loads, returns ETag and suppresses unchanged frames", async () => {
    let calls=0;
    const png=await solid(255,0,0);
    const handle=createCoverHandler(async()=>{calls++; await Bun.sleep(5);return png;});
    const responses=await Promise.all([handle(request()),handle(request()),handle(request())]);
    expect(calls).toBe(1);
    const first=responses[0]!;
    expect(first.headers.get("content-length")).toBe("115200");
    expect(first.headers.get("x-cover-format")).toBe("rgb565le-240x240-v1");
    expect((await first.arrayBuffer()).byteLength).toBe(115200);
    const same=await handle(request(first.headers.get("etag")!));
    expect(same.status).toBe(304);
    expect((await same.arrayBuffer()).byteLength).toBe(0);
  });
  test("changed art produces a new ETag and frame", async () => {
    let png=await solid(255,0,0);
    const handle=createCoverHandler(async()=>png,0);
    const first=await handle(request());
    png=await solid(0,0,255);
    const second=await handle(request(first.headers.get("etag")!));
    expect(second.status).toBe(200);
    expect(second.headers.get("etag")).not.toBe(first.headers.get("etag"));
  });
  test("keeps last good frame on upstream failure and recovers",async()=>{
    let broken=false;
    const png=await solid(0,255,0);
    const handle=createCoverHandler(async()=>{if(broken)throw Error();return png;},0);
    const first=await handle(request());
    broken=true;
    const stale=await handle(request());
    expect(stale.status).toBe(200);
    expect(stale.headers.get("x-cover-stale")).toBe("true");
    expect(stale.headers.get("etag")).toBe(first.headers.get("etag"));
    broken=false;
    expect((await handle(request())).headers.get("x-cover-stale")).toBe("false");
  });
  test("rejects corrupt images and throttles failed refreshes",async()=>{
    let calls=0;
    const handle=createCoverHandler(async()=>{calls++;return Buffer.from("not an image");});
    expect((await handle(request())).status).toBe(503);
    expect((await handle(request())).status).toBe(503);
    expect(calls).toBe(1);
  });
});
