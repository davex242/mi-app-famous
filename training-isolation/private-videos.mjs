import {createHash} from 'node:crypto';
const MAX_BYTES=2*1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

// Bounded structural inspection of progressive MP4. No codec execution or
// external process; bitstream decoding remains the browser's responsibility.
export function validateMP4(base64,fail){
 const invalid=()=>fail(400,'Compatible MP4 H264 with optional AAC required');
 if(typeof base64!=='string'||!base64.length||base64.length>Math.ceil(MAX_BYTES/3)*4)fail(400,'Video exceeds 2 MiB limit');
 if(base64.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))invalid();
 const bytes=Buffer.from(base64,'base64');if(bytes.length>MAX_BYTES)fail(400,'Video exceeds 2 MiB limit');if(bytes.toString('base64')!==base64)invalid();
 let boxCount=0;
 function boxes(start,end){const result=[];while(start<end){
  if(++boxCount>5000||start+8>end)invalid();let size=bytes.readUInt32BE(start),header=8;
  if(size===1){if(start+16>end)invalid();const big=bytes.readBigUInt64BE(start+8);if(big>BigInt(MAX_BYTES))invalid();size=Number(big);header=16;}
  if(size<header||start+size>end)invalid();result.push({type:bytes.toString('latin1',start+4,start+8),start,data:start+header,end:start+size});start+=size;
 }return result;}
 function one(list,type){const matches=list.filter(b=>b.type===type);if(matches.length!==1)invalid();return matches[0];}
 function payload(box,min=0){if(box.end-box.data<min)invalid();return bytes.subarray(box.data,box.end);}
 function time(box){const p=payload(box,20);let scale,duration;if(p[0]===0){scale=p.readUInt32BE(12);duration=p.readUInt32BE(16);}else if(p[0]===1){if(p.length<32)invalid();scale=p.readUInt32BE(20);const d=p.readBigUInt64BE(24);if(d>BigInt(Number.MAX_SAFE_INTEGER))invalid();duration=Number(d);}else invalid();if(!scale||!duration)invalid();return {scale,duration,seconds:duration/scale};}
 const top=boxes(0,bytes.length);if(top[0]?.type!=='ftyp'||top.some(b=>!['ftyp','moov','mdat','free','wide'].includes(b.type)))invalid();
 const brand=payload(one(top,'ftyp'),8);if((brand.length-8)%4||!['isom','iso2','iso4','iso5','iso6','mp41','mp42','avc1'].includes(brand.toString('latin1',0,4)))invalid();
 const movie=boxes(one(top,'moov').data,one(top,'moov').end),media=one(top,'mdat');if(media.end-media.data<4||movie.some(b=>!['mvhd','trak','udta'].includes(b.type)))invalid();
 const movieTime=time(one(movie,'mvhd'));if(movieTime.seconds>60)fail(400,'Video duration exceeds 60 seconds');
 const tracks=movie.filter(b=>b.type==='trak');if(!tracks.length||tracks.length>2)invalid();let video=null,audio=false,durationSeconds=movieTime.seconds;const occupied=[];
 for(const track of tracks){
  const trackBoxes=boxes(track.data,track.end);if(trackBoxes.some(b=>!['tkhd','mdia','edts'].includes(b.type)))invalid();one(trackBoxes,'tkhd');
  const mdia=one(trackBoxes,'mdia'),parts=boxes(mdia.data,mdia.end),clock=time(one(parts,'mdhd'));if(clock.seconds>60)fail(400,'Video duration exceeds 60 seconds');durationSeconds=Math.max(durationSeconds,clock.seconds);
  const handler=payload(one(parts,'hdlr'),12).toString('latin1',8,12);if(!['vide','soun'].includes(handler))invalid();if(handler==='vide'&&clock.seconds>60)fail(400,'Video duration exceeds 60 seconds');
  const minf=one(parts,'minf'),info=boxes(minf.data,minf.end),dinf=one(info,'dinf'),drefs=boxes(dinf.data,dinf.end),dref=payload(one(drefs,'dref'),8);
  if(dref.readUInt32BE(4)!==1)invalid();const locations=boxes(one(drefs,'dref').data+8,one(drefs,'dref').end);if(locations.length!==1||locations[0].type!=='url '||payload(locations[0],4).readUInt32BE(0)!==1)invalid();
  const stbl=one(info,'stbl'),tables=boxes(stbl.data,stbl.end),stsd=one(tables,'stsd'),description=payload(stsd,8);if(description.readUInt32BE(4)!==1)invalid();
  const samples=boxes(stsd.data+8,stsd.end);if(samples.length!==1)invalid();const entry=samples[0],config=payload(entry,8);if(config.readUInt16BE(6)!==1)invalid();
  if(handler==='vide'){
   if(video||entry.type!=='avc1')invalid();const p=payload(entry,78),width=p.readUInt16BE(24),height=p.readUInt16BE(26);
   if(!width||!height||width>1280||height>1280||width*height>921600)fail(400,'Video dimensions exceed sandbox limit');
   const avc=payload(one(boxes(entry.data+78,entry.end),'avcC'),7);if(avc[0]!==1||![66,77,100].includes(avc[1])||(avc[4]&3)!==3)invalid();
   let cursor=6;const sps=avc[5]&31;if(!sps)invalid();
   function parameterSets(count,type){for(let i=0;i<count;i++){if(cursor+2>avc.length)invalid();const size=avc.readUInt16BE(cursor);cursor+=2;if(!size||cursor+size>avc.length||(avc[cursor]&31)!==type||(avc[cursor]&128))invalid();cursor+=size;}}
   parameterSets(sps,7);if(cursor>=avc.length)invalid();const pps=avc[cursor++];if(!pps)invalid();parameterSets(pps,8);video={width,height};
  }else{
   if(audio||entry.type!=='mp4a')invalid();const p=payload(entry,28);if(p.readUInt16BE(8)!==0||![1,2].includes(p.readUInt16BE(16)))invalid();
   const esds=payload(one(boxes(entry.data+28,entry.end),'esds'),8);if(esds[0]!==0)invalid();
   // AAC object type 0x40 is required in the DecoderConfig descriptor.
   let found=false,asc=false;function descriptors(start,end,depth=0){if(depth>4)invalid();while(start<end){const tag=esds[start++];let size=0,n=0,last;do{if(start>=end||++n>4)invalid();last=esds[start++];size=(size<<7)|(last&127);}while(last&128);const stop=start+size;if(stop>end)invalid();if(tag===3){if(size<3||esds[start+2]!==0)invalid();descriptors(start+3,stop,depth+1);}else if(tag===4){if(size<13||esds[start]!==64)invalid();found=true;descriptors(start+13,stop,depth+1);}else if(tag===5){if(size<2||(esds[start]>>3)!==2||!([1,2].includes((esds[start+1]>>3)&15)))invalid();asc=true;}start=stop;}}
   descriptors(4,esds.length);if(!found||!asc)invalid();audio=true;
  }
  const sizes=payload(one(tables,'stsz'),12),fixed=sizes.readUInt32BE(4),count=sizes.readUInt32BE(8);if(!count||count>20000||sizes.length!==12+(fixed?0:4*count))invalid();
  if(handler==='vide'&&count/clock.seconds>60.01)invalid();
  const lengths=Array.from({length:count},(_,i)=>fixed||sizes.readUInt32BE(12+4*i));if(lengths.some(n=>!n||n>MAX_BYTES))invalid();
  const timing=payload(one(tables,'stts'),8),entries=timing.readUInt32BE(4);if(entries>count||timing.length!==8+8*entries)invalid();let timingCount=0,ticks=0;
  for(let i=0;i<entries;i++){const n=timing.readUInt32BE(8+8*i),delta=timing.readUInt32BE(12+8*i);if(!n||!delta)invalid();timingCount+=n;ticks+=n*delta;}if(timingCount!==count||ticks!==clock.duration)invalid();
  const chunkTable=tables.filter(b=>['stco','co64'].includes(b.type));if(chunkTable.length!==1)invalid();const offsets=payload(chunkTable[0],8),chunks=offsets.readUInt32BE(4),step=chunkTable[0].type==='stco'?4:8;
  if(!chunks||chunks>count||offsets.length!==8+step*chunks)invalid();
  const mapping=payload(one(tables,'stsc'),8),maps=mapping.readUInt32BE(4);if(!maps||maps>chunks||mapping.length!==8+12*maps)invalid();const rules=[];
  for(let i=0;i<maps;i++){const first=mapping.readUInt32BE(8+12*i),n=mapping.readUInt32BE(12+12*i),index=mapping.readUInt32BE(16+12*i);if(!first||first>chunks||!n||n>count||index!==1||(i===0&&first!==1)||(i>0&&first<=rules.at(-1).first))invalid();rules.push({first,n});}
  let sample=0,rule=0;for(let i=0;i<chunks;i++){while(rule+1<rules.length&&rules[rule+1].first<=i+1)rule++;let offset;
   if(step===4)offset=offsets.readUInt32BE(8+4*i);else{const big=offsets.readBigUInt64BE(8+8*i);if(big>BigInt(MAX_BYTES))invalid();offset=Number(big);}
   let length=0;for(let j=0;j<rules[rule].n;j++){if(sample>=count)invalid();length+=lengths[sample++];}
   if(offset<media.data||offset+length>media.end)invalid();occupied.push({start:offset,end:offset+length});
  }if(sample!==count)invalid();
 }
 if(!video)invalid();occupied.sort((a,b)=>a.start-b.start);for(let i=1;i<occupied.length;i++)if(occupied[i].start<occupied[i-1].end)invalid();
 return {format:'training-private-mp4-v1',data:base64,sha256:digest(bytes),bytes:bytes.length,duration_seconds:durationSeconds,...video,audio,codec:'avc1'};
}
export async function loadPrivateVideo(tx,id,fail){
 const row=(await tx.query('select body from training_private.local_material_content where material_id=$1',[id])).rows[0];let video;
 try{video=JSON.parse(row?.body);if(video?.format!=='training-private-mp4-v1')throw Error();const checked=validateMP4(video.data,()=>{throw Error();});for(const field of ['sha256','bytes','width','height','duration_seconds','audio','codec'])if(video[field]!==checked[field])throw Error();}
 catch{fail(409,'Private video content unavailable');}return video;
}
