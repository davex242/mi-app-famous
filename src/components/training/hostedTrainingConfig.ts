import {HostedTrainingConfig,hostedTrainingEnabled} from './HostedTrainingApi';
export function hostedTrainingConfig():HostedTrainingConfig|undefined{
 const env=(import.meta as ImportMeta&{env?:Record<string,string>}).env;
 const config={enabled:env?.VITE_TRAINING_PREVIEW_ENABLED==='true',url:env?.VITE_TRAINING_SUPABASE_URL||'',key:env?.VITE_TRAINING_PUBLISHABLE_KEY||''};
 return hostedTrainingEnabled(config)?config:undefined;
}
