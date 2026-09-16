import axios from "axios";
import { createHash } from "crypto";
import { logger } from "../utils/logger.js";

const YTM_DOMAIN = "https://music.youtube.com";
const YTM_BASE_API = `${YTM_DOMAIN}/youtubei/v1/`;
const YTM_PARAMS = "?alt=json";
const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:88.0) Gecko/20100101 Firefox/88.0";

type BrowserJson = {
  "user-agent"?: string;
  accept?: string;
  "accept-encoding"?: string;
  "content-type"?: string;
  origin?: string;
  cookie: string;
};

function requireEnvBrowserJson(): BrowserJson {
  const raw = process.env.BROWSER_JSON;
  if (!raw) throw new Error("BROWSER_JSON environment variable not set.");
  let parsed: BrowserJson;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("BROWSER_JSON is not valid JSON.");
  }
  if (!parsed.cookie || !parsed.cookie.includes("__Secure-3PAPISID=")) {
    throw new Error("BROWSER_JSON.cookie must include __Secure-3PAPISID=...");
  }
  return parsed;
}

function initializeHeaders(browserJson: BrowserJson) {
  const headers: Record<string, string> = {
    "user-agent": browserJson["user-agent"] || DEFAULT_UA,
    accept: browserJson.accept || "*/*",
    "content-type": browserJson["content-type"] || "application/json",
    origin: browserJson.origin || YTM_DOMAIN,
    cookie: browserJson.cookie
  };

  const sapisid = browserJson.cookie
    .split(";").map((c) => c.trim())
    .find((c) => c.startsWith("__Secure-3PAPISID="))
    ?.split("=")[1];

  if (!sapisid) throw new Error("Missing __Secure-3PAPISID in cookies.");

  const timestamp = Math.floor(Date.now() / 1000);
  const hash = createHash("sha1").update(`${timestamp} ${sapisid} ${YTM_DOMAIN}`).digest("hex");
  headers.authorization = `SAPISIDHASH ${timestamp}_${hash}`;

  return headers;
}

function initializeContext() {
  return {
    context: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: `1.${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.01.00`
      }
    }
  };
}

async function getVisitorId(headersBase: Record<string, string>) {
  const res = await axios.get(YTM_DOMAIN, { headers: { "user-agent": headersBase["user-agent"], cookie: headersBase.cookie }, timeout: 15000, maxContentLength: 8000000 });
  const match = res.data.match(/ytcfg\.set\s*\(\s*({.+?})\s*\)\s*;/);
  let visitor_id = "";
  if (match) {
    try {
      const ytcfg = JSON.parse(match[1]);
      visitor_id = ytcfg.VISITOR_DATA || "";
    } catch {}
  }
  return { "X-Goog-Visitor-Id": visitor_id };
}

class YTMusic {
  private context: any;
  private headers: Record<string, string>;
  private browserJson: BrowserJson;

  constructor() {
    logger.debug("YTMusic initialized.");
    const bj = requireEnvBrowserJson();
    this.browserJson = bj;
    this.context = initializeContext();
    this.headers = initializeHeaders(bj);
  }

  private async sendRequest(endpoint: string, body: any, additionalParams: string = "") {
    this.headers = { ...this.headers, ...initializeHeaders(this.browserJson) };
    const payload = { ...body, ...initializeContext() };
    if (!this.headers["X-Goog-Visitor-Id"]) {
      const visitorId = await getVisitorId(this.headers);
      this.headers = { ...this.headers, ...visitorId };
    }

    try {
      logger.debug(`POST ${endpoint}`);
      const url = `${YTM_BASE_API}${endpoint}${YTM_PARAMS}${additionalParams}`;
      const response = await axios.post(url, payload, { headers: this.headers, timeout: 15000, maxContentLength: 8000000 });
      logger.debug(`Response ${endpoint}: ${response.status}`);
      return response.data;
    } catch (error: any) {
      const message = error.response ? `HTTP ${error.response.status}: ${error.response.statusText}` : `Error: ${error.message}`;
      logger.error(`Request failed ${endpoint}: ${message}`);
      throw new Error(message);
    }
  }

  async getHistory() {
    const endpoint = "browse";
    const body = { browseId: "FEmusic_history" };
    logger.debug("Fetching history");
    const data = await this.sendRequest(endpoint, body);

    const results =
      data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
    if (!Array.isArray(results) || results.length === 0) {
      throw new Error("History structure not found");
    }

    const items = results[0]?.musicShelfRenderer?.contents;
    if (!Array.isArray(items)) {
      throw new Error("History items not found");
    }

    const list = items
      .map((item: any) => {
        const renderer = item?.musicResponsiveListItemRenderer;
        const thumbs: any[] = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        const bestThumb =
          thumbs.reduce((max, cur) => ((cur.width || 0) * (cur.height || 0) > (max.width || 0) * (max.height || 0) ? cur : max), thumbs[0]) ||
          {};
        const song = renderer?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || "";
        const author = renderer?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || "";
        const thumbnail = bestThumb.url || "";
        if (!song || !author || !thumbnail) return null;
        return { thumbnail, song, author };
      })
      .filter(Boolean);

    logger.debug(`Fetched ${list.length} items`);
    return list as Array<{ thumbnail: string; song: string; author: string }>;
  }
}

export { YTMusic };