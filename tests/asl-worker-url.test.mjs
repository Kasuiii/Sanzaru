import assert from 'node:assert/strict';
import {browserWorkerUrls} from '../scripts/check-worker-urls.mjs';
// The exact shape of the broken Vinext client constructor must be rejected.
assert.throws(()=>browserWorkerUrls('new Worker(new URL("/_next/static/asl-onnx.worker-abc.js", "file:///ROOT/lib/asl-browser-model.ts"), {type:"module"})'),/site origin/);
assert.throws(()=>browserWorkerUrls('new Worker("https://other.invalid/worker.js")'),/site origin/);
assert.deepEqual(browserWorkerUrls('var workerUrl="/_next/static/asl-onnx.worker-abc.js"; class Model { constructor(){this.worker=new Worker(workerUrl,{type:"module"})} }'),['/_next/static/asl-onnx.worker-abc.js']);
console.log('PASS: reject the deployed file:/// Worker regression; accept the emitted public Worker URL on HTTPS and localhost.');
