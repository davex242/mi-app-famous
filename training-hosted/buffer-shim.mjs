// Resolve Node Buffer lexically throughout the Edge bundle, including modules
// whose constants initialize before the entrypoint's global setup.
export {Buffer} from 'node:buffer';
