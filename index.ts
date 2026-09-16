import axios from "axios";
import { YTMusic } from "./src/ytmusic/ytmusic";
import { createCoverHandler } from "./src/cover";

const fixture = process.env.COVER_FILE;
const music = fixture ? undefined : new YTMusic();
let previousUrl = "";
let previousImage: Buffer | undefined;
const load = async () => {
  if (fixture) return Buffer.from(await Bun.file(fixture).arrayBuffer());
  const first = (await music!.getHistory())[0];
  if (!first) throw new Error("Empty history");
  if (first.thumbnail === previousUrl && previousImage) return previousImage;
  const response = await axios.get(first.thumbnail, { responseType: "arraybuffer", timeout: 15000,
    maxContentLength: 8 * 1024 * 1024 });
  previousImage = Buffer.from(response.data);
  previousUrl = first.thumbnail;
  return previousImage;
};
const server = Bun.serve({ hostname: process.env.HOST || "0.0.0.0", port: Number(process.env.PORT || 3000),
  idleTimeout: 60, fetch: createCoverHandler(load) });
console.log("SmallTV cover server listening on port " + server.port);
