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
    assert.equal(report.summary.privacyCoveragePct,100,"all supported configurations must keep a verified privacy product");
    assert.ok(report.summary.sleepCoveragePct>=90,"exact-fit sleep/floor coverage should remain high without inventing vehicle compatibility");
    assert.ok(report.summary.measurementFallbackProducts>=1,"measurement-based fallback should exist for exact-fit sleep holes");
    assert.equal(report.summary.unmonetizedHoles,0,"every remaining revenue hole must have a conditional QUICK MEASURE fallback");
    assert.ok(report.holes.every(h=>h.type!=="privacy_full"&&h.measurementFallback===true),"only conditional sleep holes may remain");
    assert.ok(report.byVehicle.some(v=>v.vehicleId==="honda-nbox-jf5-jf6"));
    assert.ok(report.configurations.every(r=>typeof r.privacy.count==="number"&&typeof r.sleep.count==="number"));
    const freed=report.configurations.filter(r=>r.vehicleId==="honda-freed-gt").map(r=>r.config);
    assert.equal(freed.length,5);
    assert.deepEqual(freed,[
      {seatCount:6,trim:"AIR"},
      {seatCount:6,trim:"AIR EX"},
      {seatCount:7,trim:"AIR EX"},
      {seatCount:5,trim:"CROSSTAR"},
      {seatCount:6,trim:"CROSSTAR"}
    ]);
    assert.ok(!freed.some(c=>c.seatCount===5&&c.trim==="AIR"));
    assert.ok(!freed.some(c=>c.seatCount===7&&c.trim==="CROSSTAR"));
  }finally{
    fs.rmSync(out,{force:true});
  }
});
