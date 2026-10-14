const MAX_BYTES=2*1024*1024;
const invalid=():never=>{throw Error('Selecciona una imagen PNG, JPEG o WebP estática válida.');};
const dimensions=(width:number,height:number)=>{if(!width||!height||width>2048||height>2048||width*height>4_000_000)throw Error('La imagen admite hasta 2048 píxeles por lado y 4 millones de píxeles.');return {width,height};};
const base64=(bytes:Uint8Array)=>{let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);};

// Bounded JPEG header inspection before invoking the browser's raster decoder.
// This is input preparation only: the server still validates every output PNG.
export function jpegDimensions(bytes:Uint8Array):{width:number;height:number}{
 if(!(bytes instanceof Uint8Array)||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)invalid();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=2,found:{width:number;height:number}|null=null,count=0;
 while(offset+1<bytes.length){
  if(++count>512||bytes[offset++]!==255)invalid();while(offset<bytes.length&&bytes[offset]===255)offset++;
  const marker=bytes[offset++];if(marker===undefined||marker===0||marker===216||marker===217||marker===1||(marker>=208&&marker<=215)||offset+2>bytes.length)invalid();
  const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)invalid();
  if([192,193,194].includes(marker)){
   if(found||length<8||bytes[offset+2]!==8)invalid();const components=bytes[offset+7];
   if(![1,3].includes(components)||length!==8+3*components)invalid();
   found=dimensions(view.getUint16(offset+5),view.getUint16(offset+3));
  }else if(marker>=192&&marker<=207&&![196,200,204].includes(marker))invalid();
  if(marker===218){if(!found||length<6)return invalid();return found;}
  offset+=length;
 }
 return invalid();
}

export function rasterSource(bytes:Uint8Array):{width:number;height:number;mime:string}{
 if(bytes.length>=33&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(8)!==13||String.fromCharCode(...bytes.subarray(12,16))!=='IHDR')invalid();
  const size=dimensions(view.getUint32(16),view.getUint32(20));let offset=8,count=0,ended=false;
  while(offset+12<=bytes.length){
   if(++count>512)invalid();const length=view.getUint32(offset),type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
   if(offset+12+length>bytes.length||['acTL','fcTL','fdAT'].includes(type))invalid();
   offset+=12+length;if(type==='IEND'){if(length!==0||offset!==bytes.length)invalid();ended=true;break;}
  }
  if(!ended)invalid();return {...size,mime:'image/png'};
 }
 if(bytes[0]===255&&bytes[1]===216)return {...jpegDimensions(bytes),mime:'image/jpeg'};
 if(bytes.length>=20&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP'){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(4,true)+8!==bytes.length)invalid();let offset=12,count=0,pixels=0;const detected:{size?:{width:number;height:number}}={};
  const accept=(width:number,height:number)=>{const candidate=dimensions(width,height);if(detected.size&&(detected.size.width!==width||detected.size.height!==height))invalid();detected.size=candidate;};
  while(offset+8<=bytes.length){
   if(++count>512)invalid();const type=String.fromCharCode(...bytes.subarray(offset,offset+4)),length=view.getUint32(offset+4,true),data=offset+8,end=data+length;
   if(end+(length%2)>bytes.length||['ANIM','ANMF'].includes(type))invalid();
   if(type==='VP8X'){if(length!==10||(bytes[data]&2))invalid();accept(1+bytes[data+4]+(bytes[data+5]<<8)+(bytes[data+6]<<16),1+bytes[data+7]+(bytes[data+8]<<8)+(bytes[data+9]<<16));}
   if(type==='VP8 '){if(++pixels!==1||length<10||(bytes[data]&1)||bytes[data+3]!==157||bytes[data+4]!==1||bytes[data+5]!==42)invalid();accept(view.getUint16(data+6,true)&16383,view.getUint16(data+8,true)&16383);}
   if(type==='VP8L'){if(++pixels!==1||length<5||bytes[data]!==47)invalid();const bits=view.getUint32(data+1,true);if(bits>>>29)invalid();accept((bits&16383)+1,((bits>>>14)&16383)+1);}
   offset=end+(length%2);
  }
  if(offset!==bytes.length||pixels!==1||!detected.size)return invalid();return {width:detected.size.width,height:detected.size.height,mime:'image/webp'};
 }
 return invalid();
}

export async function preparePrivateImage(file:File){
 if(!file||!file.size||file.size>MAX_BYTES)throw Error('El archivo de imagen debe pesar como máximo 2 MiB.');
 const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length!==file.size)invalid();
 const source=rasterSource(bytes);let bitmap:ImageBitmap|undefined,canvas:HTMLCanvasElement|undefined;
 try{
  bitmap=await createImageBitmap(new Blob([bytes],{type:source.mime}),{imageOrientation:'from-image'});
  dimensions(bitmap.width,bitmap.height);
  if(!((bitmap.width===source.width&&bitmap.height===source.height)||(bitmap.width===source.height&&bitmap.height===source.width)))invalid();
  const scale=Math.min(1,768/Math.max(bitmap.width,bitmap.height));
  const width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
  canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');if(!context)throw Error();context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(bitmap,0,0,width,height);
  const png=await new Promise<Blob|null>(resolve=>canvas!.toBlob(resolve,'image/png'));
  if(!png||png.type!=='image/png'||png.size>MAX_BYTES)throw Error('La copia PNG excede 2 MiB; elige una imagen más pequeña.');
  return {base64:base64(new Uint8Array(await png.arrayBuffer())),converted:true,width,height,resized:scale<1};
 }catch(e){if(e instanceof Error&&(e.message.startsWith('La ')||e.message.startsWith('Selecciona')))throw e;throw Error('No se pudo convertir esta imagen a PNG.');}
 finally{bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;}}
}
