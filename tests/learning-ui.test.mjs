// Server rendering checks. These do not replace browser, input, or camera testing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=new Map(),external=createRequire(import.meta.url);
function load(file){
 const absolute=path.resolve(root,file);if(cache.has(absolute))return cache.get(absolute).exports;
 const module={exports:{}};cache.set(absolute,module);
 const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 function resolve(name){if(name.endsWith('?worker&url'))return {__esModule:true,default:'/ssr-test-worker.js'};if(!name.startsWith('.')&&!name.startsWith('@/'))return external(name);const base=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(absolute),name);const target=['','.tsx','.ts','.js'].map(ext=>base+ext).find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());if(!target)throw new Error('Missing module '+name);return load(target);}
 vm.runInThisContext('(function(require,module,exports){'+code.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(absolute).href))+'\n})',{filename:absolute})(resolve,module,module.exports);return module.exports;
}
for(const [route,file,expected] of [['/','app/page.tsx','HAND TO HEART'],['/chronicle','app/chronicle/page.tsx','ASL'],['/lab','app/lab/page.tsx','10 ครั้ง'],['/workshop','app/workshop/page.tsx','SESSION'],['/play','app/play/page.tsx','สามมือ สามใจ']]){
 const html=renderToStaticMarkup(React.createElement(load(file).default));assert.ok(html.includes(expected),route+' content renders');assert.ok(html.includes('id="asl-main"'));assert.ok(html.includes('aria-current="page"'));assert.ok(!html.includes('undefined'));
 for(const [,href] of html.matchAll(/href="(\/[^"]*)"/g)){const clean=href.split(/[?#]/)[0];assert.ok(fs.existsSync(path.join(root,'app',clean,'page.tsx'))||fs.existsSync(path.join(root,'public',clean)),route+' broken local link '+href);}
 for(const [,src] of html.matchAll(/src="(\/[^"]*)"/g))assert.ok(fs.existsSync(path.join(root,'public',src)),route+' missing asset '+src);
}
console.log('PASS: five ASL pages render on the server; navigation, download targets, and local artwork exist. Browser interaction and layout have not been exercised.');
