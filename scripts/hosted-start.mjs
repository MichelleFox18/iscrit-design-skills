import { spawnSync,spawn } from 'node:child_process';
const env={...process.env,NODE_ENV:'production',SEED_DEMO:'false'};
if(!env.APP_ORIGIN&&env.RENDER_EXTERNAL_URL)env.APP_ORIGIN=env.RENDER_EXTERNAL_URL;
if(env.MIGRATION_DATABASE_URL){
 if(!env.APP_DATABASE_PASSWORD)throw new Error('APP_DATABASE_PASSWORD required for hosted bootstrap');
 const database=new URL(env.MIGRATION_DATABASE_URL);
 database.username='design_app';database.password=env.APP_DATABASE_PASSWORD;
 env.DATABASE_URL=database.toString();
 const migration=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/setup.ts'],{env,stdio:'inherit'});
 if(migration.status!==0)process.exit(migration.status??1);
}
if(!env.DATABASE_URL||!env.APP_ORIGIN)throw new Error('DATABASE_URL and canonical HTTPS APP_ORIGIN required');
if(!env.APP_ORIGIN.startsWith('https://'))throw new Error('Hosted site requires HTTPS origin');
for(const name of ['MIGRATION_DATABASE_URL','APP_DATABASE_PASSWORD','INITIAL_ADMIN_EMAIL','INITIAL_ADMIN_PASSWORD','DEMO_PASSWORD'])delete env[name];
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port',env.PORT??'3000'],{env,stdio:'inherit'});
process.on('SIGTERM',()=>child.kill('SIGTERM'));process.on('SIGINT',()=>child.kill('SIGINT'));
child.on('exit',(code)=>process.exit(code??1));
