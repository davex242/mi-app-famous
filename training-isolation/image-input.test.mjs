import test from 'node:test';
import assert from 'node:assert/strict';
import {jpegDimensions} from './web/image-input.mjs';

// Header fixtures inspect bounds only; browser tests use actual encoded JPEGs.
function segment(marker,data){return Buffer.concat([Buffer.from([255,marker,(data.length+2)>>8,(data.length+2)&255]),data]);}
function header({width=640,height=360,precision=8,components=3,marker=192,extra=[]}={}){
 const frame=Buffer.alloc(6+3*components);frame[0]=precision;frame.writeUInt16BE(height,1);frame.writeUInt16BE(width,3);frame[5]=components;
 return Buffer.concat([Buffer.from([255,216]),...extra,segment(marker,frame),segment(218,Buffer.from([1,1,0,0,63,0])),Buffer.from([255,217])]);
}
test('JPEG preparation inspects bounded dimensions before browser decoding',async t=>{
 await t.test('baseline, extended sequential, progressive and grayscale headers are supported',()=>{for(const marker of [192,193,194])assert.deepEqual(jpegDimensions(header({marker})),{width:640,height:360});assert.deepEqual(jpegDimensions(header({components:1})),{width:640,height:360});});
 await t.test('metadata and harmless marker padding do not alter dimensions',()=>{assert.deepEqual(jpegDimensions(header({extra:[segment(225,Buffer.from('EXIF_PRIVATE_DEMO')),segment(254,Buffer.from('COMMENT'))]})),{width:640,height:360});const bytes=header();assert.deepEqual(jpegDimensions(Buffer.concat([bytes.subarray(0,2),Buffer.from([255]),bytes.subarray(2)])),{width:640,height:360});});
 await t.test('fake formats, missing end marker and appended payload are rejected',()=>{for(const bytes of [Buffer.from('<svg/>'),header().subarray(0,-1),Buffer.concat([header(),Buffer.from('tail')])])assert.throws(()=>jpegDimensions(bytes));});
 await t.test('oversized and zero dimensions are rejected before allocation',()=>{for(const sizes of [{width:0},{height:0},{width:2049},{height:2049},{width:2048,height:2048}])assert.throws(()=>jpegDimensions(header(sizes)),/2048/);});
 await t.test('unsupported precision, components and frame coding are rejected',()=>{for(const attrs of [{precision:12},{components:4},{marker:195},{marker:201}])assert.throws(()=>jpegDimensions(header(attrs)));});
 await t.test('truncated or inconsistent segment lengths and repeated frames are rejected',()=>{const bytes=header();bytes[4]=255;assert.throws(()=>jpegDimensions(bytes));const frame=header().subarray(2,21);assert.throws(()=>jpegDimensions(header({extra:[frame]})));assert.throws(()=>jpegDimensions(Buffer.from([255,216,255,218,0,1,255,217])));});
 await t.test('segment-count guard rejects excessive metadata and scan before frame',()=>{assert.throws(()=>jpegDimensions(header({extra:Array.from({length:513},()=>segment(254,Buffer.alloc(0)))})));assert.throws(()=>jpegDimensions(Buffer.concat([Buffer.from([255,216]),segment(218,Buffer.alloc(6)),Buffer.from([255,217])])));});
});
