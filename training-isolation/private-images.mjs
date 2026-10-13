import {createHash} from 'node:crypto';
import {inflateSync,deflateSync} from 'node:zlib';

export const MAX_IMAGE_BYTES=2*1024*1024;
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function pngCRC(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
export function pngChunk(type,data){const label=Buffer.from(type,'ascii'),b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);label.copy(b,4);data.copy(b,8);b.writeUInt32BE(pngCRC(Buffer.concat([label,data])),b.length-4);return b;}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

// Narrow raster-only decoder. It accepts 8-bit RGB/RGBA, non-interlaced PNG;
// rebuilds IHDR/IDAT/IEND and drops every ancillary chunk and original filename.
// Specification: https://www.w3.org/TR/png-3/ . No file/network inputs.
export function normalizePNG(base64,fail){
 const invalid=()=>fail(400,'Valid RGB or RGBA PNG required');
 if(typeof base64!=='string'||!base64.length||base64.length>Math.ceil(MAX_IMAGE_BYTES/3)*4)fail(400,'PNG exceeds 2 MiB limit');
 if(base64.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))invalid();
 const bytes=Buffer.from(base64,'base64');if(bytes.toString('base64')!==base64)invalid();
 if(bytes.length>MAX_IMAGE_BYTES)fail(400,'PNG exceeds 2 MiB limit');
 if(bytes.length<57||!bytes.subarray(0,8).equals(signature))invalid();
 let offset=8,header=null,ended=false,inData=false,dataEnded=false,count=0;const parts=[];
 while(offset<bytes.length){
  if(++count>512||offset+12>bytes.length)invalid();
  const length=bytes.readUInt32BE(offset),type=bytes.toString('latin1',offset+4,offset+8);
  if(length>MAX_IMAGE_BYTES||offset+12+length>bytes.length||!/^[A-Za-z]{4}$/.test(type)||type[2]!==type[2].toUpperCase())invalid();
  const payload=bytes.subarray(offset+8,offset+8+length);
  if(pngCRC(bytes.subarray(offset+4,offset+8+length))!==bytes.readUInt32BE(offset+8+length))invalid();
  if(!header&&type!=='IHDR')invalid();
  if(type==='IHDR'){
   if(header||length!==13)invalid();header=Buffer.from(payload);
   const w=header.readUInt32BE(0),h=header.readUInt32BE(4);
   if(!w||!h||w>2048||h>2048||w*h>4_000_000)fail(400,'PNG dimensions exceed sandbox limit');
   if(header[8]!==8||![2,6].includes(header[9])||header[10]!==0||header[11]!==0||header[12]!==0)invalid();
  }else if(type==='IDAT'){
   if(ended||dataEnded)invalid();inData=true;parts.push(payload);
  }else if(type==='IEND'){
   if(length!==0||!inData||offset+12!==bytes.length)invalid();ended=true;
  }else{
   if(['acTL','fcTL','fdAT','tRNS'].includes(type))invalid();
   if(type[0]===type[0].toUpperCase()&&type!=='PLTE')invalid();
   if(type==='PLTE'&&(inData||length===0||length>768||length%3))invalid();
   if(inData)dataEnded=true;
  }
  offset+=12+length;
 }
 if(!ended||!header||!parts.length)invalid();
 const width=header.readUInt32BE(0),height=header.readUInt32BE(4),stride=width*(header[9]===6?4:3),expected=(stride+1)*height;
 let raw;try{const input=Buffer.concat(parts),r=inflateSync(input,{maxOutputLength:expected+1,info:true});if(r.engine.bytesWritten!==input.length)invalid();raw=r.buffer;}catch{invalid();}
 if(raw.length!==expected)invalid();
 for(let row=0;row<height;row++)if(raw[row*(stride+1)]>4)invalid();
 // Recompression removes ancillary metadata and any source compression details.
 const normalized=Buffer.concat([signature,pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(raw)),pngChunk('IEND',Buffer.alloc(0))]);
 if(normalized.length>MAX_IMAGE_BYTES)fail(400,'PNG exceeds 2 MiB limit');
 return {format:'training-private-png-v1',data:normalized.toString('base64'),sha256:digest(normalized),width,height,bytes:normalized.length};
}

export async function loadPrivateImage(tx,id,fail){
 const record=(await tx.query('select body from training_private.local_material_content where material_id=$1',[id])).rows[0];
 let image;try{image=JSON.parse(record?.body);if(image?.format!=='training-private-png-v1')throw Error();
  const normalized=normalizePNG(image.data,()=>{throw Error();});
  const bytes=Buffer.from(image.data,'base64');
  if(digest(bytes)!==image.sha256||bytes.length!==image.bytes||normalized.width!==image.width||normalized.height!==image.height)throw Error();
 }catch{fail(409,'Private image content unavailable');}
 return image;
}
