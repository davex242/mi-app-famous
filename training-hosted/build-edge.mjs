import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
const {build}=createRequire(join(process.env.APP_NODE_MODULES,'_training_build.cjs'))('esbuild');
const root=resolve(new URL('../',import.meta.url).pathname),out=resolve(process.env.TRAINING_EDGE_OUTPUT||join(root,'training-hosted/build'));await mkdir(out,{recursive:true});
await build({entryPoints:[join(root,'training-hosted/index.ts')],bundle:true,platform:'node',format:'esm',target:'es2022',outfile:join(out,'index.js'),external:['npm:*','node:*'],plugins:[{name:'edge-pdf-validator',setup(build){build.onResolve({filter:/\/private-pdfs\.mjs$/},()=>({path:join(root,'training-hosted/private-pdfs.mjs')}));}}]});console.log('Hosted edge bundle built without private bank or credentials.');
