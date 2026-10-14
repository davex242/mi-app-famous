import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {deflateSync as nativeDeflate} from 'node:zlib';
import {pdfFixture} from '../training-isolation/pdf-fixtures.mjs';
import {imageFixture,imageChunk} from '../training-isolation/image-fixtures.mjs';
import {chromium} from '../training-isolation/node_modules/playwright/index.mjs';
const root=new URL('../',import.meta.url).pathname;
const require=createRequire(join(root,'training-isolation/package.json'));
const {build}=createRequire(join(process.env.APP_NODE_MODULES,'_image_runtime.cjs'))('esbuild');
const dir=await mkdtemp(join(tmpdir(),'training-images-'));let browser;
try {
 const server=join(dir,'server.mjs');
 await build({stdin:{contents:`export {normalizePNG} from ${JSON.stringify(join(root,'training-isolation/private-images.mjs'))};export {inflateSync} from ${JSON.stringify(join(root,'training-hosted/bounded-zlib.mjs'))};export {validatePDF} from ${JSON.stringify(join(root,'training-hosted/private-pdfs.mjs'))};`,resolveDir:root},bundle:true,format:'esm',platform:'node',outfile:server,external:['node:*'],plugins:[{name:'portable-image-runtime',setup(b){
  b.onResolve({filter:/^node:zlib$/},()=>({path:join(root,'training-hosted/bounded-zlib.mjs')}));
  b.onResolve({filter:/^npm:pako@2\.1\.0/},args=>({path:require.resolve(args.path.replace('npm:pako@2.1.0','pako'))}));
  b.onResolve({filter:/^npm:pdf-lib@1\.17\.1/},args=>({path:require.resolve(args.path.replace('npm:pdf-lib@1.17.1','pdf-lib'))}));
 }}]});
 const {normalizePNG,inflateSync,validatePDF}=await import(pathToFileURL(server));
 const fail=(_status,message)=>{throw Error(message);};
 assert.ok((await validatePDF((await pdfFixture()).toString('base64'),fail)).pages>0);
 for(const color of [2,6])assert.equal(normalizePNG(imageFixture({width:2,height:2,color}).toString('base64'),fail).width,2);
 const compressed=nativeDeflate(Buffer.from('bounded fixture'));
 assert.equal(inflateSync(compressed,{maxOutputLength:30,info:true}).engine.bytesWritten,compressed.length);
 assert.throws(()=>inflateSync(nativeDeflate(Buffer.alloc(10000)),{maxOutputLength:20}));
 assert.throws(()=>inflateSync(compressed.subarray(0,compressed.length-1),{maxOutputLength:30}));
 assert.equal(inflateSync(Buffer.concat([compressed,Buffer.from([0])]),{maxOutputLength:30,info:true}).engine.bytesWritten,compressed.length);
 const client=join(dir,'client.js');await build({entryPoints:[join(root,'src/components/training/preparePrivateImage.ts')],bundle:true,format:'iife',globalName:'ImagePreparation',outfile:client});
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader']});
 const page=await browser.newPage();await page.setContent('<html><body></body></html>');await page.addScriptTag({content:await readFile(client,'utf8')});
 async function convert(bytes,mime){return page.evaluate(async({data,mime})=>{const raw=Uint8Array.from(atob(data),c=>c.charCodeAt(0));return ImagePreparation.preparePrivateImage(new File([raw],'source',{type:mime}));},{data:bytes.toString('base64'),mime});}
 const signature=Buffer.from([137,80,78,71,13,10,26,10]);
 function png(color,depth,raw,extra=[]){const header=Buffer.alloc(13);header.writeUInt32BE(2);header.writeUInt32BE(1,4);header[8]=depth;header[9]=color;return Buffer.concat([signature,imageChunk('IHDR',header),...extra,imageChunk('IDAT',nativeDeflate(raw)),imageChunk('IEND',Buffer.alloc(0))]);}
 const sources=[imageFixture({width:2,height:2}),png(3,8,Buffer.from([0,0,1]),[imageChunk('PLTE',Buffer.from([255,0,0,0,255,0])),imageChunk('tRNS',Buffer.from([255,128]))]),png(0,16,Buffer.from([0,0,0,255,255]))];
 for(const source of sources){const result=await convert(source,'image/png');assert.equal(result.converted,true);assert.ok([2,6].includes(Buffer.from(result.base64,'base64')[25]));normalizePNG(result.base64,fail);}
 for(const mime of ['image/jpeg','image/webp']){
  const source=await page.evaluate(async mime=>{const c=document.createElement('canvas');c.width=900;c.height=600;c.getContext('2d').fillRect(0,0,900,600);return c.toDataURL(mime).split(',')[1];},mime);
  const result=await convert(Buffer.from(source,'base64'),mime);assert.equal(result.width,768);assert.equal(result.height,512);normalizePNG(result.base64,fail);
 }
 await assert.rejects(convert(Buffer.from('<svg/>'),'image/png'));
 console.log('Image runtime/browser checks passed: bounded inflate, RGB/RGBA, palette/transparency, grayscale 16-bit, JPEG, WebP, proportional resize and malformed-input rejection.');
} finally {if(browser)await browser.close();await rm(dir,{recursive:true,force:true});}
