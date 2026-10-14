import {Buffer} from 'node:buffer';
import {deflate} from 'npm:pako@2.1.0';
import inflater from 'npm:pako@2.1.0/lib/zlib/inflate.js';
import ZStream from 'npm:pako@2.1.0/lib/zlib/zstream.js';

// Supabase's Node compatibility layer does not provide the inflate info contract
// used by the strict PNG/PDF parsers. Preserve both bounded output and exact
// single-stream consumption using the pinned portable inflater.
export function inflateSync(input,options={}) {
  const limit=options.maxOutputLength;
  if(!Number.isSafeInteger(limit)||limit<1||limit>64*1024*1024)throw Error('Explicit bounded inflate limit required');
  const stream=new ZStream();
  if(inflater.inflateInit(stream)!==0)throw Error('Inflater initialization failed');
  stream.input=input;stream.next_in=0;stream.avail_in=input.length;
  const chunks=[];let length=0;
  try {
    while(true) {
      const before=stream.avail_in;
      stream.output=new Uint8Array(Math.min(65536,limit-length+1));
      stream.next_out=0;stream.avail_out=stream.output.length;
      const status=inflater.inflate(stream,0),produced=stream.next_out;
      length+=produced;
      if(length>limit)throw Error('Inflated output exceeds limit');
      if(produced)chunks.push(Buffer.from(stream.output.subarray(0,produced)));
      if(status===1) {
        const buffer=Buffer.concat(chunks,length);
        return options.info?{buffer,engine:{bytesWritten:stream.total_in}}:buffer;
      }
      if(![0,-5].includes(status)||(!produced&&before===stream.avail_in))throw Error('Invalid or incomplete compressed stream');
    }
  } finally {inflater.inflateEnd(stream);}
}

export function deflateSync(input) {return Buffer.from(deflate(input));}
