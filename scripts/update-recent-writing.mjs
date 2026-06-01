#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const README_PATH = new URL("../README.md", import.meta.url);
const FEED_URL = "https://yael.m0sh1.cc/rss/";
const START = "<!-- recent-writing:start -->";
const END = "<!-- recent-writing:end -->";
const MAX_ITEMS = 3;
const FETCH_TIMEOUT_MS = 15_000;

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&#x2019;", "'")
    .replaceAll("&#x201C;", "\"")
    .replaceAll("&#x201D;", "\"");
}

function escapeMarkdownLinkText(value) {
  return value.replace(/[\\[\]()]/g, "\\$&");
}

function textFromTag(item, tag) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) {
    return "";
  }

  return decodeEntities(match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim());
}

export function parseFeed(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map(([, item]) => ({
      title: textFromTag(item, "title"),
      link: textFromTag(item, "link"),
      pubDate: textFromTag(item, "pubDate"),
    }))
    .filter((item) => item.title && item.link)
    .slice(0, MAX_ITEMS);
}

export function formatDate(pubDate) {
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function renderItems(items) {
  return items
    .map((item) => {
      const date = formatDate(item.pubDate);
      const title = escapeMarkdownLinkText(item.title);
      return date ? `- [${title}](${item.link}) - ${date}` : `- [${title}](${item.link})`;
    })
    .join("\n");
}

export function replaceBlock(readme, rendered) {
  const startIndex = readme.indexOf(START);
  const endIndex = readme.indexOf(END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`README.md must contain ${START} and ${END} markers`);
  }

  return `${readme.slice(0, startIndex + START.length)}\n${rendered}\n${readme.slice(endIndex)}`;
}

export async function fetchFeed(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Fetching ${url} timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function updateRecentWriting({
  feedUrl = FEED_URL,
  readmePath = README_PATH,
  fetchImpl = fetch,
  readFileImpl = readFile,
  writeFileImpl = writeFile,
  timeoutMs = FETCH_TIMEOUT_MS,
} = {}) {
  const xml = await fetchFeed(fetchImpl, feedUrl, timeoutMs);
  const items = parseFeed(xml);
  if (items.length === 0) {
    throw new Error(`No RSS items found in ${feedUrl}`);
  }

  const readme = await readFileImpl(readmePath, "utf8");
  const updated = replaceBlock(readme, renderItems(items));

  if (updated !== readme) {
    await writeFileImpl(readmePath, updated);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await updateRecentWriting();
}
