// Check the actual emitted client constructor, not a rewritten test launcher.
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

export function browserWorkerUrls(source,filename='client.js') {
 const ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const bindings=new Map(),urls=[];
 for(const statement of ast.statements)if(ts.isVariableStatement(statement)){
  for(const declaration of statement.declarationList.declarations){
   if(ts.isIdentifier(declaration.name)&&declaration.initializer)bindings.set(declaration.name.text,declaration.initializer);
  }
 }
 function value(node,seen=new Set()){
  if(!node)throw Error('Worker URL is missing in '+filename);
  if(ts.isStringLiteralLike(node))return node.text;
  if(ts.isParenthesizedExpression(node))return value(node.expression,seen);
  if(ts.isIdentifier(node)&&bindings.has(node.text)&&!seen.has(node.text))return value(bindings.get(node.text),new Set([...seen,node.text]));
  if(ts.isNewExpression(node)&&node.expression.getText(ast)==='URL')return new URL(...node.arguments.map(arg=>value(arg,seen))).href;
  throw Error('Cannot verify emitted Worker URL in '+filename+': '+node.getText(ast));
 }
 function visit(node){
  if(ts.isNewExpression(node)&&node.expression.getText(ast)==='Worker'){
   const target=value(node.arguments?.[0]);
   for(const base of ['https://worker-url-test.invalid/play','http://localhost:8787/lab']){
    const url=new URL(target,base);
    if(url.origin!==new URL(base).origin||!['http:','https:'].includes(url.protocol))throw Error('Worker must load from the site origin: '+target+' in '+filename);
   }
   urls.push(new URL(target,'https://worker-url-test.invalid/play').pathname);
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);
 return urls;
}

export async function checkBrowserWorkerUrls(assetRoot){
 const checked=[];
 async function visit(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
   const file=path.join(directory,entry.name);
   if(entry.isDirectory())await visit(file);
   else if(entry.name.endsWith('.js')){
    const source=await readFile(file,'utf8');
    if(!/new\s+Worker\s*\(/.test(source))continue;
    for(const url of browserWorkerUrls(source,path.relative(assetRoot,file))){
     const target=path.resolve(assetRoot,'.'+url);
     const relative=path.relative(assetRoot,target);
     if(relative.startsWith('..')||path.isAbsolute(relative)||(await stat(target)).size===0)throw Error('Worker asset missing or outside build: '+url);
     checked.push({client:path.relative(assetRoot,file).replaceAll('\\','/'),worker:url});
    }
   }
  }
 }
 await visit(path.join(assetRoot,'_next/static'));
 if(!checked.some(item=>/\/asl-onnx\.worker-[^/]+\.js$/.test(item.worker)))throw Error('No verifiable ASL Worker constructor in the built client');
 return checked;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const results=await checkBrowserWorkerUrls(fileURLToPath(new URL('../dist/client',import.meta.url)));
 console.log('PASS: emitted client Worker URLs resolve to the page origin over HTTPS/localhost; all worker assets exist.',results);
}
