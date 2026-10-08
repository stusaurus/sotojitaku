import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root=fs.readFileSync(new URL("../camp/index.html",import.meta.url),"utf8");

test("CAMP exposes a crawlable CAR STAY navigation link",()=>{
  assert.ok(root.includes('href="../car-stay/"'));
  assert.ok(root.includes("CAR STAY｜車中泊をつくる"));
});

test("CAR STAY footer CAMP navigation points to CAMP rather than HOME",()=>{
  const html=fs.readFileSync(new URL("../car-stay/index.html",import.meta.url),"utf8");
  assert.ok(html.includes('<a href="../camp/">CAMP</a>'));
});
