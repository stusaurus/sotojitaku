import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");

test("FREED coverage uses only real seat/trim combinations",()=>{
  const out=path.join(os.tmpdir(),"sotojitaku-freed-coverage-"+process.pid+".json");
  const run=spawnSync(process.execPath,["car-stay/scripts/report_coverage.mjs",out],{cwd:ROOT,encoding:"utf8"});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const report=JSON.parse(fs.readFileSync(out,"utf8"));
  fs.rmSync(out,{force:true});
  const freed=report.byVehicle.find(x=>x.vehicleId==="honda-freed-gt");
  assert.equal(freed.configurations,6);
  const configs=report.configurations.filter(x=>x.vehicleId==="honda-freed-gt").map(x=>x.config);
  assert.ok(configs.some(x=>x.seatCount===6&&x.trim==="AIR"));
  assert.ok(configs.some(x=>x.seatCount===7&&x.trim==="AIR"));
  assert.ok(configs.some(x=>x.seatCount===6&&x.trim==="AIR EX"));
  assert.ok(configs.some(x=>x.seatCount===7&&x.trim==="AIR EX"));
  assert.ok(configs.some(x=>x.seatCount===5&&x.trim==="CROSSTAR"));
  assert.ok(configs.some(x=>x.seatCount===6&&x.trim==="CROSSTAR"));
  assert.ok(!configs.some(x=>x.seatCount===5&&["AIR","AIR EX"].includes(x.trim)));
  assert.ok(!configs.some(x=>x.seatCount===7&&x.trim==="CROSSTAR"));
});
