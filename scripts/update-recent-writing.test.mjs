import assert from "node:assert/strict";
import test from "node:test";

import { renderItems, updateRecentWriting } from "./update-recent-writing.mjs";

test("renderItems escapes Markdown link syntax in feed titles", () => {
  const rendered = renderItems([
    {
      title: "A [draft] about links (and more)",
      link: "https://yael.m0sh1.cc/example/",
      pubDate: "Mon, 01 Jun 2026 00:00:00 GMT",
    },
  ]);

  assert.equal(
    rendered,
    "- [A \\[draft\\] about links \\(and more\\)](https://yael.m0sh1.cc/example/) - 01 Jun 2026",
  );
});

test("updateRecentWriting aborts slow RSS fetches", async () => {
  const fetchImpl = async (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });

  await assert.rejects(
    updateRecentWriting({
      fetchImpl,
      readFileImpl: async () => "",
      writeFileImpl: async () => {},
      timeoutMs: 1,
    }),
    /timed out after 1ms/,
  );
});
