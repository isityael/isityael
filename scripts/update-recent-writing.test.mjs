import assert from "node:assert/strict";
import test from "node:test";

import { parseFeed, renderItems, replaceBlock, updateRecentWriting } from "./update-recent-writing.mjs";

test("parseFeed keeps three distinct post links in feed order", () => {
  const xml = `<rss><channel>
    <item><title>First</title><link>https://example.com/first/</link></item>
    <item><title>First again</title><link>https://example.com/first/</link></item>
    <item><title>Missing link</title></item>
    <item><title>Second</title><link>https://example.com/second/</link></item>
    <item><title>Third</title><link>https://example.com/third/</link></item>
    <item><title>Fourth</title><link>https://example.com/fourth/</link></item>
  </channel></rss>`;

  assert.deepEqual(parseFeed(xml).map(({ title }) => title), ["First", "Second", "Third"]);
});

test("replaceBlock rejects missing, reversed, or duplicate markers", () => {
  const start = "<!-- recent-writing:start -->";
  const end = "<!-- recent-writing:end -->";
  for (const readme of ["", start, end, `${end}${start}`, `${start}${start}${end}`, `${start}${end}${end}`]) {
    assert.throws(() => replaceBlock(readme, "new posts"), /markers/);
  }
});

test("replaceBlock preserves surrounding profile text", () => {
  assert.equal(
    replaceBlock("Before\n<!-- recent-writing:start -->\nold posts\n<!-- recent-writing:end -->\nAfter", "new posts"),
    "Before\n<!-- recent-writing:start -->\nnew posts\n<!-- recent-writing:end -->\nAfter",
  );
});

test("an empty feed never overwrites the existing profile", async () => {
  let writes = 0;
  await assert.rejects(updateRecentWriting({
    fetchImpl: async () => ({ ok: true, text: async () => "<rss><channel /></rss>" }),
    readFileImpl: async () => "<!-- recent-writing:start -->\nExisting posts\n<!-- recent-writing:end -->",
    writeFileImpl: async () => { writes += 1; },
  }), /No RSS items/);
  assert.equal(writes, 0);
});

test("a profile without writing markers disables feed fetching and updates", async () => {
  await updateRecentWriting({
    fetchImpl: async () => { throw new Error("Disabled writing must not fetch the feed"); },
    readFileImpl: async () => "Profile with no recent-post section",
    writeFileImpl: async () => { throw new Error("Disabled writing must not write the profile"); },
  });
});

test("a partially removed writing block fails before fetching", async () => {
  await assert.rejects(updateRecentWriting({
    fetchImpl: async () => { throw new Error("Unexpected feed request"); },
    readFileImpl: async () => "<!-- recent-writing:start -->\nExisting posts",
    writeFileImpl: async () => {},
  }), /markers/);
});

test("an unchanged writing block is not rewritten", async () => {
  let writes = 0;
  await updateRecentWriting({
    fetchImpl: async () => ({
      ok: true,
      text: async () => "<rss><channel><item><title>Post</title><link>https://example.com/post/</link></item></channel></rss>",
    }),
    readFileImpl: async () => "Before\n<!-- recent-writing:start -->\n- [Post](https://example.com/post/)\n<!-- recent-writing:end -->\nAfter",
    writeFileImpl: async () => { writes += 1; },
  });
  assert.equal(writes, 0);
});

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
      readFileImpl: async () => "<!-- recent-writing:start --><!-- recent-writing:end -->",
      writeFileImpl: async () => {},
      timeoutMs: 1,
    }),
    /timed out after 1ms/,
  );
});
