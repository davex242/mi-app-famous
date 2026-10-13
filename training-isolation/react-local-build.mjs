import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export async function buildLocalReact() {
  const root=fileURLToPath(new URL('../',import.meta.url));
  const moduleRoot=process.env.APP_NODE_MODULES || join(root,'node_modules');
  const {build}=createRequire(join(moduleRoot,'_training_build.cjs'))('esbuild');
  const directory=await mkdtemp(join(tmpdir(),'training-react-api-'));
  try {
    await writeFile(join(directory,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import Workspace from ${JSON.stringify(join(root,'src/components/training/TrainingSandboxWorkspace.tsx'))};createRoot(document.getElementById('root')).render(<Workspace/>);`);
    await build({entryPoints:[join(directory,'entry.tsx')],bundle:true,outfile:join(directory,'bundle.js'),nodePaths:[moduleRoot]});
    await writeFile(join(directory,'index.html'),'<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Training · prueba local</title><link rel="stylesheet" href="/react-training/bundle.css"><div id="root"></div><script src="/react-training/bundle.js"></script></html>');
    return {assets:pathToFileURL(directory+'/'),cleanup:()=>rm(directory,{recursive:true,force:true})};
  } catch(error) {await rm(directory,{recursive:true,force:true});throw error;}
}
