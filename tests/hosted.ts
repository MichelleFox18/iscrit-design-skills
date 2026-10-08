import nextEnv from '@next/env';
import { Pool } from 'pg';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
nextEnv.loadEnvConfig(process.cwd());
const ownerUrl=new URL(process.env.MIGRATION_DATABASE_URL!);
if(!['127.0.0.1','localhost'].includes(ownerUrl.hostname))throw new Error('Hosted smoke test requires local database');
const owner=new Pool({connectionString:ownerUrl.toString()});
const name=`design_hosted_${Date.now()}`;
const folder=mkdtempSync('/tmp/iscrit-hosted-');
let databaseCreated=false;let containerCreated=false;
function docker(args:string[]){const r=spawnSync('docker',args,{encoding:'utf8'});assert.equal(r.status,0,'Docker smoke operation failed');return r.stdout.trim();}
try {
 await owner.query(`CREATE DATABASE ${name}`);databaseCreated=true;
 const hostedUrl=new URL(ownerUrl);hostedUrl.hostname='db';hostedUrl.port='5432';hostedUrl.pathname='/'+name;
 const password=randomBytes(24).toString('hex');
 writeFileSync(folder+'/hosted.env',[
  `MIGRATION_DATABASE_URL=${hostedUrl}`,`APP_DATABASE_PASSWORD=${process.env.APP_DATABASE_PASSWORD}`,
  'INITIAL_ADMIN_EMAIL=admin@hosted-test.local',`INITIAL_ADMIN_PASSWORD=${password}`,
  'APP_ORIGIN=https://hosted-test.invalid','PORT=3000',
 ].join('\n'),{mode:0o600});
 docker(['run','--detach','--name',name,'--network','iscrit-design-skills_default','-p','127.0.0.1:3101:3000','--env-file',folder+'/hosted.env','iscrit-design-web:local']);containerCreated=true;
 const origin='http://localhost:3101';let ready=false;
 for(let i=0;i<180;i++){try{if((await fetch(origin+'/materials')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 assert.ok(ready,'Hosted container failed to become ready');
 const home=await fetch(origin);assert.ok((await home.text()).includes('пространство'));
 const login=await fetch(origin+'/api/auth',{method:'POST',headers:{Origin:'https://hosted-test.invalid','Content-Type':'application/json'},body:JSON.stringify({email:'admin@hosted-test.local',password})});
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!;
 assert.ok(cookie.includes('HttpOnly')&&cookie.includes('Secure'));
 const app=await fetch(origin+'/app/admin',{headers:{Cookie:cookie.split(';')[0]}});assert.ok((await app.text()).includes('Управление'));
 assert.equal(docker(['exec',name,'node','-e','console.log(process.getuid())']),'1000');
 docker(['exec',name,'sh','-c','test ! -f /app/.env.local']);
 console.log('Hosted image passed: fresh database bootstrap, public pages, real admin login, Secure/HttpOnly cookie, non-root runtime, local secrets excluded. No external publication performed.');
}finally {
 if(containerCreated)docker(['rm','--force',name]);
 if(databaseCreated)await owner.query(`DROP DATABASE ${name} WITH (FORCE)`);
 await owner.end();rmSync(folder,{recursive:true,force:true});
}
