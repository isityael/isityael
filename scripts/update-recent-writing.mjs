#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const README_PATH = new URL("../README.md", import.meta.url);
const FEED_URL = "https://yael.m0sh1.cc/rss/";
const START = "<!-- recent-writing:start -->";
const END = "<!-- recent-writing:end -->";
const MAX_ITEMS = 3;

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

function textFromTag(item, tag) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) {
    return "";
  }

  return decodeEntities(match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim());
}

function parseFeed(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map(([, item]) => ({
      title: textFromTag(item, "title"),
      link: textFromTag(item, "link"),
      pubDate: textFromTag(item, "pubDate"),
    }))
    .filter((item) => item.title && item.link)
    .slice(0, MAX_ITEMS);
}

function formatDate(pubDate) {
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

function renderItems(items) {
  return items
    .map((item) => {
      const date = formatDate(item.pubDate);
      return date ? `- [${item.title}](${item.link}) - ${date}` : `- [${item.title}](${item.link})`;
    })
    .join("\n");
}

function replaceBlock(readme, rendered) {
  const startIndex = readme.indexOf(START);
  const endIndex = readme.indexOf(END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`README.md must contain ${START} and ${END} markers`);
  }

  return `${readme.slice(0, startIndex + START.length)}\n${rendered}\n${readme.slice(endIndex)}`;
}

const response = await fetch(FEED_URL);
if (!response.ok) {
  throw new Error(`Failed to fetch ${FEED_URL}: HTTP ${response.status}`);
}

const xml = await response.text();
const items = parseFeed(xml);
if (items.length === 0) {
  throw new Error(`No RSS items found in ${FEED_URL}`);
}

const readme = await readFile(README_PATH, "utf8");
const updated = replaceBlock(readme, renderItems(items));

if (updated !== readme) {
  await writeFile(README_PATH, updated);
}
