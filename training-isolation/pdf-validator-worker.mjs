import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {inflateSync} from 'node:zlib';
const require=createRequire(import.meta.url);
const {PDFDocument,PDFDict,PDFArray,PDFName,PDFRawStream}=require('pdf-lib');
const decoder=require('pdf-lib/cjs/core/streams/decode.js');
let decodedBytes=0;const decoded=new WeakMap();

// pdf-lib 1.17.1 internal adapter, confined to this worker. Structural streams
// must be raw/Flate; replace its unbounded inflater before parsing ObjStm/XRef.
// Library version is pinned and compressed-stream interoperability is tested.
function boundedDecode(stream){
 if(decoded.has(stream))return decoded.get(stream);
 let filter=stream.dict.lookup(PDFName.of('Filter'));
 if(filter instanceof PDFArray){if(filter.size()!==1)throw Error();filter=filter.lookup(0);}
 let bytes=stream.getContents();
 if(filter){if(!(filter instanceof PDFName)||!['FlateDecode','Fl'].includes(filter.decodeText()))throw Error('Unsupported structural filter');
  const result=inflateSync(bytes,{maxOutputLength:8*1024*1024,info:true});if(result.engine.bytesWritten!==bytes.length)throw Error();bytes=result.buffer;
 }
 decodedBytes+=bytes.length;if(decodedBytes>16*1024*1024)throw Error('Decoded stream limit');decoded.set(stream,bytes);return bytes;
}
decoder.decodePDFRawStream=stream=>({decode:()=>boundedDecode(stream)});
const forbidden=new Set(['JS','JavaScript','AA','OpenAction','AcroForm','Annots','EmbeddedFiles','EF','XFA','RichMediaContent','RichMediaSettings','Launch','URI','SubmitForm','ImportData','GoToR']);
const forbiddenTypes=new Set(['Action','EmbeddedFile','Filespec','RichMedia','Movie','Sound','JavaScript','Launch','URI','GoToR','GoToE','SubmitForm','ImportData','Rendition','RichMediaExecute','Named','ResetForm','Hide']);
const seen=new Set();let visited=0;
function inspect(object,depth=0){
 if(!object||typeof object!=='object'||seen.has(object))return;
 if(depth>50||++visited>25000)throw Error('Object graph limit');seen.add(object);
 if(object instanceof PDFRawStream){
  if(object.dict.has(PDFName.of('F'))||object.dict.has(PDFName.of('FFilter'))||object.dict.has(PDFName.of('FDecodeParms')))throw Error('External stream');
  const filter=object.dict.lookup(PDFName.of('Filter'));
  if(filter instanceof PDFName&&['FlateDecode','Fl'].includes(filter.decodeText()))boundedDecode(object);
  inspect(object.dict,depth+1);
 }else if(object instanceof PDFDict){
  for(const [key,value] of object.entries()){
   const name=key.decodeText();if(name==='Annots'&&value instanceof PDFArray&&value.size()===0)continue;
   if(forbidden.has(name)||name==='A')throw Error('Interactive PDF');
   if(['Type','Subtype','S'].includes(name)&&value instanceof PDFName&&forbiddenTypes.has(value.decodeText()))throw Error('Interactive PDF');
   if(name==='Filter'&&value instanceof PDFName&&value.decodeText()==='Crypt')throw Error('Encrypted PDF');
   inspect(value,depth+1);
  }
 }else if(object instanceof PDFArray){for(let i=0;i<object.size();i++)inspect(object.get(i),depth+1);}
}
try{
 const document=await PDFDocument.load(workerData,{ignoreEncryption:false,throwOnInvalidObject:true,updateMetadata:false});
 if(document.isEncrypted)throw Error();
 const objects=document.context.enumerateIndirectObjects();if(objects.length>12000)throw Error();
 for(const [,object] of objects)inspect(object);
 const pages=document.getPages();if(!pages.length||pages.length>100)throw Error('Page count limit');
 for(const page of pages){const {width,height}=page.getSize();if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>14400||height>14400)throw Error();}
 parentPort.postMessage({ok:true,pages:pages.length});
}catch{parentPort.postMessage({ok:false});}
