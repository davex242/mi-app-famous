const MAX_BYTES=2*1024*1024;
const invalid=()=>{throw Error('Selecciona un PNG válido o un JPEG de 8 bits.');};
const dimensions=(width,height)=>{if(!width||!height||width>2048||height>2048||width*height>4_000_000)throw Error('La imagen admite hasta 2048 píxeles por lado y 4 millones de píxeles.');return {width,height};};
const base64=bytes=>{let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);};

// Bounded JPEG header inspection before invoking the browser's raster decoder.
// This is input preparation only: the server still validates every output PNG.
export function jpegDimensions(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)invalid();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=2,found=null,count=0;
 while(offset+1<bytes.length){
  if(++count>512||bytes[offset++]!==255)invalid();while(offset<bytes.length&&bytes[offset]===255)offset++;
  const marker=bytes[offset++];if(marker===undefined||marker===0||marker===216||marker===217||marker===1||(marker>=208&&marker<=215)||offset+2>bytes.length)invalid();
  const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)invalid();
  if([192,193,194].includes(marker)){
   if(found||length<8||bytes[offset+2]!==8)invalid();const components=bytes[offset+7];
   if(![1,3].includes(components)||length!==8+3*components)invalid();
   found=dimensions(view.getUint16(offset+5),view.getUint16(offset+3));
  }else if(marker>=192&&marker<=207&&![196,200,204].includes(marker))invalid();
  if(marker===218){if(!found||length<6)invalid();return found;}
  offset+=length;
 }
 invalid();
}

export async function preparePrivateImage(file){
 if(!file||!file.size||file.size>MAX_BYTES)throw Error('El archivo de imagen debe pesar como máximo 2 MiB.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes.length!==file.size)invalid();
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return {base64:base64(bytes),converted:false};
 const source=jpegDimensions(bytes);let bitmap,canvas;
 try{
  bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}),{imageOrientation:'from-image'});
  dimensions(bitmap.width,bitmap.height);
  if(!((bitmap.width===source.width&&bitmap.height===source.height)||(bitmap.width===source.height&&bitmap.height===source.width)))invalid();
  const scale=Math.min(1,768/Math.max(bitmap.width,bitmap.height));
  const width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
  canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');if(!context)throw Error();context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(bitmap,0,0,width,height);
  const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!png||png.type!=='image/png'||png.size>MAX_BYTES)throw Error('La copia PNG excede 2 MiB; elige una imagen más pequeña.');
  return {base64:base64(new Uint8Array(await png.arrayBuffer())),converted:true,width,height,resized:scale<1};
 }catch(e){if(e.message.startsWith('La ')||e.message.startsWith('Selecciona'))throw e;throw Error('No se pudo convertir este JPEG a PNG.');}
 finally{bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;}}
}
