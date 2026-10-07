import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { HTTPRequest, Page } from "puppeteer";
import { isPublicAddress } from "../utils/linkPreview";

// Blocks every browser request (navigation, redirects, sub-resources, fetch from scraper or
// page code) that targets something other than a public http(s) address: localhost, private
// networks, cloud metadata, other containers, file:// …

const isLocalName = (host: string) => host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local");

/** Synchronous checks shared with the API, for URLs typed by users (no DNS lookup). */
export const assertScrapableUrl = (input: string): string => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw Object.assign(new Error(`URL invalide : ${input}`), { status: 400 });
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || isLocalName(host) || (isIP(host) && !isPublicAddress(host))) {
    throw Object.assign(new Error(`Seules les adresses http(s) publiques peuvent être scrapées : ${input}`), { status: 400 });
  }
  return url.toString();
};

/** Whether the browser may load `input`; DNS answers are cached per host for the job. */
export const isAllowedRequest = async (input: string, dnsCache: Map<string, Promise<boolean>>): Promise<boolean> => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (url.protocol === "data:" || url.protocol === "blob:" || input === "about:blank") return true;
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isLocalName(host)) return false;
  if (isIP(host)) return isPublicAddress(host);
  let verdict = dnsCache.get(host);
  if (!verdict) {
    verdict = lookup(host, { all: true })
      .then((addresses) => addresses.length > 0 && addresses.every(({ address }) => isPublicAddress(address)))
      .catch(() => false);
    dnsCache.set(host, verdict);
  }
  return verdict;
};

/** Turns on request interception for `page` with the rules above. */
export const guardPageRequests = async (page: Page) => {
  const dnsCache = new Map<string, Promise<boolean>>();
  await page.setRequestInterception(true);
  page.on("request", (request: HTTPRequest) => {
    // continue()/abort() reject when the request is already gone (page closed, redirect…).
    void isAllowedRequest(request.url(), dnsCache)
      .then((allowed) => (allowed ? request.continue() : request.abort("blockedbyclient")))
      .catch(() => {});
  });
};
