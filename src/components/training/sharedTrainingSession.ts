import {HostedTrainingApi,HostedTrainingConfig} from './HostedTrainingApi';

let session: {email:string;url:string;key:string;api:HostedTrainingApi}|undefined;

/** One in-memory training session per current app account; never store passwords. */
export function sharedTrainingApi(config:HostedTrainingConfig|undefined,email?:string) {
  if(!config||!email)return undefined;
  const account=email.trim().toLowerCase();
  if(session&&(session.email!==account||session.url!==config.url||session.key!==config.key)) {
    const old=session.api;session=undefined;void old.logout();
  }
  if(!session)session={email:account,url:config.url,key:config.key,api:new HostedTrainingApi(config)};
  return session.api;
}

export async function logoutSharedTraining() {
  const old=session?.api;session=undefined;
  if(old)await old.logout();
}
