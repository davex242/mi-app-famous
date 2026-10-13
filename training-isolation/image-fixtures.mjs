import {deflateSync} from 'node:zlib';

// Synthetic test pixels; independent fixture encoder, never a public asset.
export function imageChunk(type,data){
 const label=Buffer.from(type,'latin1'),bytes=Buffer.alloc(data.length+12);bytes.writeUInt32BE(data.length);label.copy(bytes,4);data.copy(bytes,8);
 let crc=0xffffffff;for(const b of Buffer.concat([label,data])){crc^=b;for(let i=0;i<8;i++)crc=(crc&1)?(crc>>>1)^0xedb88320:crc>>>1;}bytes.writeUInt32BE((crc^0xffffffff)>>>0,bytes.length-4);return bytes;
}
export function imageFixture({width=320,height=180,color=6,filter=0,ancillary=true,raw=null,extra=[],headerEdit=null}={}){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=color;headerEdit?.(header);
 if(!raw){raw=Buffer.alloc((width*(color===6?4:3)+1)*height);for(let y=0;y<height;y++){const start=y*(width*(color===6?4:3)+1);raw[start]=filter;for(let x=0;x<width;x++){const i=start+1+x*(color===6?4:3);raw[i]=34;raw[i+1]=139;raw[i+2]=120;if(color===6)raw[i+3]=255;}}}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),imageChunk('IHDR',header),...(ancillary?[imageChunk('tEXt',Buffer.from('Comment\0PRIVATE_METADATA_DEMO <script>not retained</script>'))]:[]),...extra,imageChunk('IDAT',deflateSync(raw)),imageChunk('IEND',Buffer.alloc(0))]);
}
