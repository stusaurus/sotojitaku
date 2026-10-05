import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");

test("CAMP exposes a crawlable CAR STAY navigation link",()=>{
  assert.ok(root.includes('href="car-stay/"'));
  assert.ok(root.includes("CAR STAY｜車中泊をつくる"));
});
