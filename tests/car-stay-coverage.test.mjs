import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";

test("CAR STAY coverage report enumerates every vehicle configuration without enforcing inventory coverage",()=>{
  const out=path.join(os.tmpdir(),"car-stay-coverage-"+process.pid+".json");
  try{
    execFileSync(process.execPath,["car-stay/scripts/report_coverage.mjs",out],{cwd:new URL("..",import.meta.url),stdio:"pipe"});
    const report=JSON.parse(fs.readFileSync(out,"utf8"));
    assert.equal(report.version,1);
    assert.ok(report.summary.configurations>=6);
    assert.ok(Array.isArray(report.holes));
    assert.ok(Array.isArray(report.byVehicle));
    assert.ok(report.byVehicle.some(v=>v.vehicleId==="honda-nbox-jf5-jf6"));
    assert.ok(report.configurations.every(r=>typeof r.privacy.count==="number"&&typeof r.sleep.count==="number"));
  }finally{
    fs.rmSync(out,{force:true});
  }
});

test("FREED coverage counts only real seat/trim variants",()=>{
  const out=path.join(os.tmpdir(),"car-stay-freed-coverage-"+process.pid+".json");
  try{
    execFileSync(process.execPath,["car-stay/scripts/report_coverage.mjs",out],{cwd:new URL("..",import.meta.url),stdio:"pipe"});
    const report=JSON.parse(fs.readFileSync(out,"utf8"));
    const rows=report.configurations.filter(r=>r.vehicleId==="honda-freed-gt");
    const keys=rows.map(r=>r.config.trim+":"+r.config.seatCount).sort();
    assert.deepEqual(keys,["AIR EX:6","AIR EX:7","AIR:6","CROSSTAR:5","CROSSTAR:6"]);
  }finally{
    fs.rmSync(out,{force:true});
  }
});
