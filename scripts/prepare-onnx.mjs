import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const source = new URL("../node_modules/onnxruntime-web/", import.meta.url);
const { version } = JSON.parse(await readFile(new URL("package.json", source), "utf8"));
const output = new URL(`../public/onnx/${version}/`, import.meta.url);
await mkdir(output, { recursive: true });
const entry = "ort.webgpu.bundle.min.mjs", module = "ort-wasm-simd-threaded.jsep.mjs";
for (const file of [entry, module]) await copyFile(new URL("dist/" + file, source), new URL(file, output));
await copyFile(new URL("../vendor/onnxruntime-LICENSE.txt", import.meta.url), new URL("LICENSE.txt", output));
// Cloudflare static assets have a per-file size limit. Reassemble losslessly in the worker.
const wasm = await readFile(new URL("dist/ort-wasm-simd-threaded.jsep.wasm", source));
const parts = [], chunkSize = 20 * 1024 * 1024;
for (let offset = 0; offset < wasm.length; offset += chunkSize) {
    const name = `runtime-${parts.length}.bin`;
    await writeFile(new URL(name, output), wasm.subarray(offset, offset + chunkSize));
    parts.push(name);
}
await writeFile(new URL("../public/onnx/runtime.json", import.meta.url), JSON.stringify({
    version, base: `/onnx/${version}/`, entry, module, parts,
    sha256: createHash("sha256").update(wasm).digest("hex"),
}, null, 2) + "\n");
console.log(`Prepared ONNX Runtime Web ${version}: ${parts.length} WASM parts, local JS and license.`);
