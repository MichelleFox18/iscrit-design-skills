import nextEnv from '@next/env';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { spawn,spawnSync,type ChildProcess } from 'node:child_process';
import assert from 'node:assert/strict';
import { hashPassword } from '../src/lib/password';
import { AREA_NAMES,TRACK_NAMES,type Matrix } from '../src/lib/model';
nextEnv.loadEnvConfig(process.cwd());
const ownerUrl=new URL(process.env.MIGRATION_DATABASE_URL!);
if(!['localhost','127.0.0.1'].includes(ownerUrl.hostname))throw new Error('Integration test requires local PostgreSQL');
const database=`design_test_${Date.now()}`;
const admin=new Pool({connectionString:ownerUrl.toString()});
const testOwnerUrl=new URL(ownerUrl);testOwnerUrl.pathname='/'+database;
const appUrl=new URL(process.env.DATABASE_URL!);appUrl.pathname='/'+database;
let owner:Pool|undefined;let app:Pool|undefined;let server:ChildProcess|undefined;let created=false;
const port=3100;const origin=`http://localhost:${port}`;
let passed=0;
function ok(label:string){passed++;console.log(`PASS ${label}`);}
try {
 await admin.query(`CREATE DATABASE ${database}`);created=true;
 owner=new Pool({connectionString:testOwnerUrl.toString()});
 await owner.query(readFileSync('db/001_schema.sql','utf8'));
 app=new Pool({connectionString:appUrl.toString()});
 const password='Integration-test-password!';
 for(const initialPassword of [password,'Another-test-password!']) {
  const bootstrap=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/setup.ts'],{env:{...process.env,NODE_ENV:'production',SEED_DEMO:'false',MIGRATION_DATABASE_URL:testOwnerUrl.toString(),INITIAL_ADMIN_EMAIL:'admin@test.local',INITIAL_ADMIN_PASSWORD:initialPassword},encoding:'utf8'});
  assert.equal(bootstrap.status,0,'Hosted bootstrap failed');
 }
 assert.equal((await owner.query("SELECT count(*)::int n FROM users WHERE role='admin'")).rows[0].n,1);
 ok('non-demo administrator bootstrap is repeatable and preserves credentials');
 const ids:Record<string,string>={};
 for(const role of ['admin','manager','designer','other']){
  if(role==='admin')ids[role]=(await owner.query("SELECT id FROM users WHERE email='admin@test.local'")).rows[0].id;
  else ids[role]=(await owner.query('INSERT INTO users(email,name,role,password_hash) VALUES($1,$2,$3,$4) RETURNING id',[`${role}@test.local`,`TEST ONLY ${role}`,role==='other'?'designer':role,hashPassword(password)])).rows[0].id;
 }
 await owner.query('UPDATE users SET manager_id=$1 WHERE id=$2',[ids.manager,ids.designer]);
 const c=(id:string)=>({id,name:`TEST ONLY ${id}`,description:'Synthetic automated test fixture; never production methodology',levels:['TEST 1','TEST 2','TEST 3','TEST 4'] as [string,string,string,string]});
 const matrix:Matrix={areas:AREA_NAMES.map((name,i)=>({id:`area-${i}`,name,competencies:Array.from({length:i===0?4:3},(_,j)=>c(`a${i}c${j}`))})),tracks:TRACK_NAMES.map((name,i)=>({id:`t${i}`,name,management:i===4,competencies:[c(`t${i}c0`)]}))};
 const mid=(await owner.query('INSERT INTO matrices(title,data,published,source_note) VALUES($1,$2,true,$3) RETURNING id',['TEST ONLY',JSON.stringify(matrix),'Isolated test fixture'])).rows[0].id;
 const cycle=(await owner.query("INSERT INTO cycles(title,matrix_id,review_date) VALUES('TEST ONLY',$1,'2027-01-15') RETURNING id",[mid])).rows[0].id;
 const aid=(await owner.query('INSERT INTO assessments(cycle_id,user_id) VALUES($1,$2) RETURNING id',[cycle,ids.designer])).rows[0].id;
 const otherAid=(await owner.query('INSERT INTO assessments(cycle_id,user_id) VALUES($1,$2) RETURNING id',[cycle,ids.other])).rows[0].id;
 const privateId=(await owner.query("INSERT INTO materials(title,description,url,type,internal) VALUES('PRIVATE TEST ONLY','internal','https://example.org/private','article',true) RETURNING id")).rows[0].id;
 async function queryAs(actor:string|null,sql:string,args:unknown[]=[]) {
  const db=await app!.connect();try{await db.query('BEGIN');await db.query("SELECT set_config('app.user_id',$1,true)",[actor??'']);const rows=await db.query(sql,args);await db.query('ROLLBACK');return rows;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 assert.equal((await queryAs(ids.designer,'SELECT id FROM assessments')).rows.length,1);
 assert.equal((await queryAs(ids.manager,'SELECT id FROM assessments')).rows.length,1);
 assert.equal((await queryAs(ids.other,'SELECT id FROM assessments WHERE id=$1',[aid])).rows.length,0);
 assert.equal((await queryAs(null,'SELECT id FROM materials WHERE id=$1',[privateId])).rows.length,0);
 await assert.rejects(()=>queryAs(ids.designer,"UPDATE users SET role='admin' WHERE id=$1",[ids.designer]).then(r=>{if(r.rowCount===0)throw new Error('RLS denied');}));
 ok('RLS restricts personal cards, team assignments, internal materials and role escalation');
 const authCookie:Record<string,string>={};
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port',String(port)],{env:{...process.env,DATABASE_URL:appUrl.toString(),APP_ORIGIN:origin,NODE_ENV:'production',SEED_DEMO:'false'},stdio:['ignore','pipe','pipe']});
 let serverError='';server.stderr?.on('data',chunk=>{serverError+=chunk.toString()});
 for(let attempt=0;attempt<120;attempt++){try{if((await fetch(origin)).ok)break;}catch{}if(server.exitCode!==null)throw new Error('Test server exited: '+serverError);await new Promise(resolve=>setTimeout(resolve,250));}
 async function login(role:string){const res=await fetch(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:`${role}@test.local`,password})});assert.equal(res.status,200,await res.clone().text());authCookie[role]=res.headers.get('set-cookie')!.split(';')[0];}
 for(const role of ['admin','manager','designer','other'])await login(role);
 ok('real password authentication for all roles');
 async function action(role:string,action:string,payload:unknown,expected=200,reason?:string){const res=await fetch(origin+'/api/actions',{method:'POST',headers:{Origin:origin,Cookie:authCookie[role],'Content-Type':'application/json'},body:JSON.stringify({action,payload,reason})});assert.equal(res.status,expected,`${action}: ${await res.clone().text()}`);return res;}
 async function state(){return (await owner!.query('SELECT * FROM assessments WHERE id=$1',[aid])).rows[0];}
 const ownPage=await fetch(origin+'/app',{headers:{Cookie:authCookie.designer}});const ownHtml=await ownPage.text();assert.ok(!ownHtml.includes('password_hash'));assert.ok(!ownHtml.includes('TEST ONLY other'));
 const foreign=await fetch(origin+`/app/assessment/${otherAid}`,{headers:{Cookie:authCookie.designer}});assert.ok((await foreign.text()).includes('Страница не найдена'));
 const managerForeign=await fetch(origin+`/app/assessment/${otherAid}`,{headers:{Cookie:authCookie.manager}});assert.ok((await managerForeign.text()).includes('Страница не найдена'));
 await action('other','rating',{assessment_id:aid,revision:0,competency_id:'a0c0',kind:'self',answer:'rated',value:2,comment:'',evidence:[]},404);
 await action('designer','material',{title:'hack'},403);
 const csrf=await fetch(origin+'/api/actions',{method:'POST',headers:{Origin:'https://evil.example',Cookie:authCookie.admin,'Content-Type':'application/json'},body:'{}'});assert.equal(csrf.status,403);
 ok('direct URLs, mutation authorization, DTO privacy and CSRF rejection');
 await action('designer','transition',{assessment_id:aid,revision:0,target:1},400);
 const comps=matrix.areas.flatMap(a=>a.competencies);
 const rated=async(role:string,kind:string,comp:string,value:number)=>{await action(role,'rating',{assessment_id:aid,revision:(await state()).revision,competency_id:comp,kind,answer:'rated',value,comment:'test evidence',evidence:['https://example.org/work']});};
 for(const comp of comps)await rated('designer','self',comp.id,3);
 await action('designer','tracks',{assessment_id:aid,revision:(await state()).revision,primary:'t0',additional:null});
 await rated('designer','self','t0c0',2);
 await action('designer','transition',{assessment_id:aid,revision:(await state()).revision,target:1});
 await action('manager','rating',{assessment_id:aid,revision:(await state()).revision,competency_id:'a0c0',kind:'self',answer:'rated',value:1,comment:'hack',evidence:[]},403);
 await rated('manager','manager','a0c0',2);assert.equal((await state()).status,2);
 assert.equal((await queryAs(ids.designer,"SELECT * FROM ratings WHERE kind='manager'")).rows.length,0);
 await action('designer','transition',{assessment_id:aid,revision:(await state()).revision,target:3},403);
 for(const comp of comps.slice(1))await rated('manager','manager',comp.id,2);
 await rated('manager','manager','t0c0',2);
 await action('manager','transition',{assessment_id:aid,revision:(await state()).revision,target:3});
 assert.equal((await queryAs(ids.designer,"SELECT * FROM ratings WHERE kind='manager'")).rows.length,14);
 await action('manager','transition',{assessment_id:aid,revision:(await state()).revision,target:4,review_comment:'TEST review completed'});
 for(const comp of [...comps,matrix.tracks[0].competencies[0]])await rated('manager','final',comp.id,2);
 await action('manager','confirm',{assessment_id:aid,revision:(await state()).revision});
 await action('designer','confirm',{assessment_id:aid,revision:(await state()).revision});
 await action('manager','transition',{assessment_id:aid,revision:(await state()).revision,target:5});
 ok('all review stages through two-party final confirmation, manager drafts hidden and self ratings immutable');
 await action('manager','rating',{assessment_id:aid,revision:(await state()).revision,competency_id:'a0c0',kind:'final',answer:'rated',value:3,comment:'correction',evidence:[]},400);
 await action('manager','rating',{assessment_id:aid,revision:(await state()).revision,competency_id:'a0c0',kind:'final',answer:'rated',value:3,comment:'correction',evidence:[]},200,'TEST reason for correction');
 assert.equal((await state()).status,4);assert.equal((await state()).employee_confirmed,false);
 assert.ok((await owner.query("SELECT id FROM audit_events WHERE entity='ratings' AND reason='TEST reason for correction'")).rowCount);
 await action('manager','confirm',{assessment_id:aid,revision:(await state()).revision});await action('designer','confirm',{assessment_id:aid,revision:(await state()).revision});await action('manager','transition',{assessment_id:aid,revision:(await state()).revision,target:5});
 ok('final correction requires reason, is audited and resets confirmations');
 const goalPayload={assessment_id:aid,source:'general',competency_id:'a0c1',current_level:2,target_level:3,months:3,expected_result:'TEST ONLY outcome',success_criteria:'TEST ONLY criteria',actions:[{text:'TEST action 1',done:false},{text:'TEST action 2',done:false}],material_ids:[]};
 await action('designer','goal',goalPayload);
 await action('designer','goal',goalPayload,409);
 let g=(await owner.query('SELECT * FROM goals WHERE assessment_id=$1',[aid])).rows[0];
 await action('designer','goalProgress',{id:g.id,revision:g.revision,actions:[true,false]},400);
 await action('designer','goalApprove',{id:g.id,revision:g.revision});g=(await owner.query('SELECT * FROM goals WHERE id=$1',[g.id])).rows[0];
 await action('manager','goalApprove',{id:g.id,revision:g.revision});g=(await owner.query('SELECT * FROM goals WHERE id=$1',[g.id])).rows[0];
 await action('designer','goalProgress',{id:g.id,revision:g.revision,actions:[true,true],status:'completed',checkpoint:{text:'TEST success',url:'https://example.org/result'}});
 g=(await owner.query('SELECT * FROM goals WHERE id=$1',[g.id])).rows[0];assert.equal(g.status,'completed');assert.equal(g.checkpoints.length,1);
 await action('manager','transition',{assessment_id:aid,revision:(await state()).revision,target:6});assert.equal((await state()).status,6);assert.equal((await state()).history_goals.length,1);
 const history=await fetch(origin+'/app/history',{headers:{Cookie:authCookie.designer}});assert.ok((await history.text()).includes('TEST ONLY'));
 await assert.rejects(()=>owner!.query('UPDATE matrices SET data=$2 WHERE id=$1',[mid,JSON.stringify({...matrix,tracks:[]})]));
 ok('goal limits, dual approval, progress, archived history and immutable methodology');
 await action('admin','material',{title:'TEST added material',description:'TEST',url:'https://example.org/test',type:'article',category:'Test',difficulty:'Любой уровень',tags:['test'],author:'Test',internal:false,competency_ids:[]});
 const material=(await owner.query("SELECT id FROM materials WHERE title='TEST added material'")).rows[0];await action('designer','favorite',{material_id:material.id,enabled:true});assert.equal((await queryAs(ids.other,'SELECT * FROM favorites')).rows.length,0);
 await assert.rejects(()=>queryAs(ids.admin,'DELETE FROM audit_events'));
 ok('admin content persistence, favorites isolation and append-only audit');
 console.log(`${passed} integration groups passed in isolated database. Synthetic methodology will be removed.`);
} finally {
 if(server){server.kill('SIGTERM');await new Promise<void>(resolve=>{if(server!.exitCode!==null)resolve();else server!.once('exit',()=>resolve());});}
 await app?.end();await owner?.end();
 if(created)await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
 await admin.end();
}
