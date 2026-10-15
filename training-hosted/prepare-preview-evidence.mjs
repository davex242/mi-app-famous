// Synthetic local files only; no remote access or credentials.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {chromium} from '../training-isolation/node_modules/playwright/index.mjs';
import {imageFixture} from '../training-isolation/image-fixtures.mjs';
import {pdfFixture} from '../training-isolation/pdf-fixtures.mjs';
import {videoFixture} from '../training-isolation/video-fixtures.mjs';
const root=new URL('../',import.meta.url).pathname,out=process.env.TRAINING_QA_OUTPUT||'/workspace/training-qa';
await mkdir(out,{recursive:true});
const {build}=createRequire(join(root,'package.json'))('esbuild');
await build({entryPoints:[join(root,'src/components/training/preparePrivateImage.ts')],bundle:true,format:'iife',globalName:'ImagePreparation',outfile:join(out,'imageprep.js')});
const files={PNG:{image_base64:imageFixture({width:2,height:2}).toString('base64')},PDF:{pdf_base64:(await pdfFixture()).toString('base64')},MP4:{video_base64:videoFixture().toString('base64')}};
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.setContent('<html></html>');await page.addScriptTag({content:await readFile(join(out,'imageprep.js'),'utf8')});
 for(const [label,mime] of [['JPEG','image/jpeg'],['WebP','image/webp']]){
  const converted=await page.evaluate(async mime=>{const c=document.createElement('canvas');c.width=64;c.height=64;c.getContext('2d').fillRect(0,0,64,64);const blob=await(await fetch(c.toDataURL(mime))).blob();return ImagePreparation.preparePrivateImage(new File([blob],'FICTITIOUS',{type:mime}));},mime);
  files[label]={image_base64:converted.base64};
 }
 await writeFile(join(out,'evidence-fixtures.json'),JSON.stringify(files));
 console.log('Synthetic PNG, PDF, MP4 and browser-normalized JPEG/WebP prepared.');
}finally{await browser.close();}
