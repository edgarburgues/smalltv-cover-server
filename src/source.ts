import axios from "axios";
import { readFile } from "node:fs/promises";
import { YTMusic } from "./ytmusic/ytmusic";

export function createCoverSource() {
const fixture = process.env.COVER_FILE;
const music = fixture ? undefined : new YTMusic();
let previousUrl = "";
let previousImage: Buffer | undefined;
const load = async () => {
  if (fixture) return await readFile(fixture);
  const first = (await music!.getHistory())[0];
  if (!first) throw new Error("Empty history");
  if (first.thumbnail === previousUrl && previousImage) return previousImage;
  const response = await axios.get(first.thumbnail, { responseType: "arraybuffer", timeout: 15000,
    maxContentLength: 8 * 1024 * 1024 });
  previousImage = Buffer.from(response.data);
  previousUrl = first.thumbnail;
  return previousImage;
};
return load;
}
