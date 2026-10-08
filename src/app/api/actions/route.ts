import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { withDb } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { allCompetencies,calculate,canAdvance,matrixSchema,MATERIAL_TYPES,type Matrix,type User } from '@/lib/model';
import type { PoolClient } from 'pg';
import { validOrigin } from '@/lib/origin';
class Rejected extends Error { constructor(message:string,public status=400){super(message);} }
function check(condition:unknown,message:string,status=400):asserts condition {if(!condition)throw new Rejected(message,status);}
const id=z.uuid();
const text=z.string().trim().min(1).max(10000);
const short=z.string().trim().min(1).max(300);
const url=z.url().max(2000).refine(v=>/^https?:\/\//.test(v),'Нужна HTTP(S)-ссылка');
async function assessment(db:PoolClient,aid:string,revision?:number) {
 const a=(await db.query(`SELECT a.*,m.data FROM assessments a JOIN cycles c ON c.id=a.cycle_id JOIN matrices m ON m.id=c.matrix_id WHERE a.id=$1 FOR UPDATE OF a`,[aid])).rows[0];
 check(a,'Карточка не найдена',404);
 if(revision!==undefined)check(a.revision===revision,'Карточка изменена в другой вкладке. Обновите страницу.',409);
 return a as {id:string;user_id:string;status:number;revision:number;data:Matrix;primary_track:string|null;additional_track:string|null;employee_confirmed:boolean;manager_confirmed:boolean};
}
async function requireManager(db:PoolClient,aid:string,user:User) {check(user.role==='admin'||(user.role==='manager'&&(await db.query('SELECT manages_assessment($1) ok',[aid])).rows[0].ok),'Нет прав на изменение оценки',403);}
async function ratings(db:PoolClient,aid:string) {return (await db.query('SELECT * FROM ratings WHERE assessment_id=$1',[aid])).rows;}
export async function POST(req:NextRequest) {
 if(!validOrigin(req))return NextResponse.json({error:'Недопустимый источник запроса'},{status:403});
 if(Number(req.headers.get('content-length')??0)>500000)return NextResponse.json({error:'Запрос слишком большой'},{status:413});
 const user=await currentUser();
 if(!user)return NextResponse.json({error:'Войдите в аккаунт'},{status:401});
 try {
  const body=z.object({action:short,payload:z.unknown(),reason:z.string().max(2000).optional()}).parse(await req.json());
  const result=await withDb(user.id,async db=>{
   const p=body.payload;
   switch(body.action) {
    case 'rating': {
     const v=z.object({assessment_id:id,revision:z.number().int(),competency_id:short,kind:z.enum(['self','manager','final']),answer:z.enum(['unanswered','na','rated']),value:z.number().int().min(1).max(4).nullable(),comment:z.string().max(10000),evidence:z.array(url).max(10)}).parse(p);
     check((v.answer==='rated')===(v.value!==null),'Проверьте выбранный уровень');
     const a=await assessment(db,v.assessment_id,v.revision);
     check(allCompetencies(a.data).some(c=>c.id===v.competency_id),'Компетенция отсутствует в методике цикла');
     if(v.kind==='self')check(a.user_id===user.id&&a.status===0,'Самооценка доступна для изменения только её автору до отправки',403);
     else {await requireManager(db,a.id,user);check(v.kind==='manager'?[1,2].includes(a.status):[4,5].includes(a.status),'Этот этап оценки закрыт');}
     if(v.kind==='final'&&a.status===5)check(body.reason?.trim(),'Для исправления подтверждённого итога укажите причину');
     await db.query(`INSERT INTO ratings(assessment_id,competency_id,kind,answer,value,comment,evidence) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(assessment_id,competency_id,kind) DO UPDATE SET answer=excluded.answer,value=excluded.value,comment=excluded.comment,evidence=excluded.evidence,updated_at=now()`,[a.id,v.competency_id,v.kind,v.answer,v.value,v.comment,JSON.stringify(v.evidence)]);
     await db.query(`UPDATE assessments SET revision=revision+1,updated_at=now(),status=CASE WHEN $2='manager' AND status=1 THEN 2 WHEN $2='final' AND status=5 THEN 4 ELSE status END,
      employee_confirmed=CASE WHEN $2='final' THEN false ELSE employee_confirmed END,manager_confirmed=CASE WHEN $2='final' THEN false ELSE manager_confirmed END WHERE id=$1`,[a.id,v.kind]);
     break;
    }
    case 'transition': {
     const v=z.object({assessment_id:id,revision:z.number().int(),target:z.number().int().min(1).max(6),review_comment:z.string().max(10000).optional()}).parse(p);
     const a=await assessment(db,v.assessment_id,v.revision);
     check(canAdvance(user.role,a.user_id===user.id,a.status,v.target),'Этот переход недоступен',403);
     if(a.status>0)await requireManager(db,a.id,user);
     if([1,3,5].includes(v.target)) {
      const score=calculate(a.data,await ratings(db,a.id),v.target===1?'self':v.target===3?'manager':'final');
      check(score.complete,'Нужно минимум 11 числовых оценок и 3/2/2/2 по областям');
     }
     if(v.target===5)check(a.employee_confirmed&&a.manager_confirmed,'Сотрудник и руководитель должны подтвердить итог');
     if(v.target===6) {
      const pending=(await db.query('SELECT id FROM goals WHERE assessment_id=$1 AND NOT(employee_approved AND manager_approved)',[a.id])).rowCount;
      check(!pending,'Согласуйте созданные цели перед завершением цикла');
      await db.query("UPDATE assessments SET history_goals=(SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) FROM goals g WHERE assessment_id=$1) WHERE id=$1",[a.id]);
     }
     await db.query("UPDATE assessments SET status=$2,review_comment=coalesce($3,review_comment),review_date=CASE WHEN $2=4 THEN (now() AT TIME ZONE 'Europe/Moscow')::date ELSE review_date END,revision=revision+1,updated_at=now() WHERE id=$1",[a.id,v.target,v.review_comment]);break;
    }
    case 'confirm': {
     const v=z.object({assessment_id:id,revision:z.number().int()}).parse(p);
     const a=await assessment(db,v.assessment_id,v.revision);
     check(a.status===4,'Подтверждение доступно после review');
     check(calculate(a.data,await ratings(db,a.id),'final').complete,'Недостаточно согласованных оценок');
     const column=a.user_id===user.id?'employee_confirmed':'manager_confirmed';
     if(column==='manager_confirmed')await requireManager(db,a.id,user);
     await db.query(`UPDATE assessments SET ${column}=true,revision=revision+1 WHERE id=$1`,[a.id]);break;
    }
    case 'tracks': {
     const v=z.object({assessment_id:id,revision:z.number().int(),primary:z.string().nullable(),additional:z.string().nullable()}).parse(p);
     const a=await assessment(db,v.assessment_id,v.revision);
     check(a.status<5,'Треки подтверждённой оценки закрыты');
     check(a.user_id===user.id||user.role!=='designer','Нет доступа',403);
     check(!v.primary||a.data.tracks.some(t=>t.id===v.primary),'Неизвестный трек');
     check(!v.additional||(!!v.primary&&a.data.tracks.some(t=>t.id===v.additional)&&v.primary!==v.additional),'Дополнительный трек должен отличаться от основного');
     const existing=(await db.query("SELECT competency_id FROM goals WHERE assessment_id=$1 AND source='track'",[a.id])).rows;
     const selected=a.data.tracks.filter(t=>[v.primary,v.additional].includes(t.id)).flatMap(t=>t.competencies.map(c=>c.id));
     check(existing.every(g=>selected.includes(g.competency_id)),'Сначала согласуйте изменение цели прежнего трека');
     await db.query('UPDATE assessments SET primary_track=$2,additional_track=$3,revision=revision+1 WHERE id=$1',[a.id,v.primary,v.additional]);break;
    }
    case 'goal': {
     const v=z.object({id:id.optional(),assessment_id:id,revision:z.number().int().optional(),source:z.enum(['general','track']),competency_id:short,current_level:z.number().int().min(1).max(4),target_level:z.number().int().min(1).max(4),months:z.union([z.literal(3),z.literal(6)]),expected_result:text,success_criteria:text,actions:z.array(z.object({text:short,done:z.boolean()})).min(2).max(4),material_ids:z.array(id).max(20)}).parse(p);
     const a=await assessment(db,v.assessment_id);check(a.status>=4,'Цели создаются после review');
     const comps=v.source==='general'?a.data.areas.flatMap(x=>x.competencies):a.data.tracks.filter(t=>[a.primary_track,a.additional_track].includes(t.id)).flatMap(t=>t.competencies);
     check(comps.some(c=>c.id===v.competency_id),'Выберите компетенцию общей матрицы или своего трека');
     const rating=(await db.query("SELECT value FROM ratings WHERE assessment_id=$1 AND competency_id=$2 AND kind='final' AND answer='rated'",[a.id,v.competency_id])).rows[0];
     check(rating&&rating.value===v.current_level,'Текущий уровень должен соответствовать согласованной оценке');
     check(v.target_level>v.current_level,'Целевой уровень должен быть выше текущего');
     if(v.material_ids.length)check((await db.query('SELECT id FROM materials WHERE id=ANY($1::uuid[])',[v.material_ids])).rowCount===new Set(v.material_ids).size,'Материал недоступен');
     if(v.id) {
      const old=(await db.query('SELECT * FROM goals WHERE id=$1 AND assessment_id=$2 FOR UPDATE',[v.id,a.id])).rows[0];
      check(old,'Цель не найдена',404);check(old.revision===v.revision,'Цель изменена. Обновите страницу.',409);
      await db.query(`UPDATE goals SET source=$2,competency_id=$3,current_level=$4,target_level=$5,months=$6,due_date=(created_at+make_interval(months=>$6))::date,
       expected_result=$7,success_criteria=$8,actions=$9,material_ids=$10,employee_approved=false,manager_approved=false,revision=revision+1 WHERE id=$1`,
       [v.id,v.source,v.competency_id,v.current_level,v.target_level,v.months,v.expected_result,v.success_criteria,JSON.stringify(v.actions),v.material_ids]);
     } else await db.query(`INSERT INTO goals(assessment_id,source,competency_id,current_level,target_level,months,due_date,expected_result,success_criteria,actions,material_ids)
      VALUES($1,$2,$3,$4,$5,$6,(now()+make_interval(months=>$6))::date,$7,$8,$9,$10)`,[a.id,v.source,v.competency_id,v.current_level,v.target_level,v.months,v.expected_result,v.success_criteria,JSON.stringify(v.actions),v.material_ids]);
     break;
    }
    case 'goalApprove':
    case 'goalProgress': {
     const v=z.object({id,revision:z.number().int(),actions:z.array(z.boolean()).max(4).optional(),status:z.enum(['planned','active','completed','postponed','cancelled']).optional(),new_due_date:z.iso.date().optional(),comment:z.string().max(10000).optional(),checkpoint:z.object({text:short,url:url.optional()}).optional()}).parse(p);
     const g=(await db.query('SELECT * FROM goals WHERE id=$1 FOR UPDATE',[v.id])).rows[0];check(g,'Цель не найдена',404);check(g.revision===v.revision,'Цель изменена. Обновите страницу.',409);
     const a=await assessment(db,g.assessment_id);
     const owner=a.user_id===user.id;
     if(!owner)await requireManager(db,a.id,user);
     if(body.action==='goalApprove')await db.query(`UPDATE goals SET ${owner?'employee_approved':'manager_approved'}=true,revision=revision+1 WHERE id=$1`,[g.id]);
     else {
      check(g.employee_approved&&g.manager_approved,'Сначала согласуйте цель с обеих сторон');
      if(v.actions)check(v.actions.length===g.actions.length,'Проверьте список действий');
      const actions=g.actions.map((x:{text:string;done:boolean},i:number)=>({...x,done:v.actions?.[i]??x.done}));
      let checkpoints=v.checkpoint?[...g.checkpoints,{...v.checkpoint,date:new Date().toISOString()}]:g.checkpoints;
      if(v.status==='completed')check(actions.every((x:{done:boolean})=>x.done),'Сначала выполните все действия');
      if(v.status==='postponed') {
       check(v.new_due_date&&new Date(v.new_due_date)>new Date(g.due_date),'Укажите новый срок позже текущего');
       checkpoints=[...checkpoints,{text:`Перенос срока: ${new Date(g.due_date).toISOString().slice(0,10)} → ${v.new_due_date}`,date:new Date().toISOString()}];
       await db.query('UPDATE goals SET due_date=$2,employee_approved=false,manager_approved=false WHERE id=$1',[g.id,v.new_due_date]);
      }
      await db.query(`UPDATE goals SET actions=$2,status=coalesce($3,status),${owner?'employee_comment':'manager_comment'}=coalesce($4,${owner?'employee_comment':'manager_comment'}),checkpoints=$5,revision=revision+1 WHERE id=$1`,[g.id,JSON.stringify(actions),v.status,v.comment,JSON.stringify(checkpoints)]);
     }break;
    }
    case 'favorite': {
     const v=z.object({material_id:id,enabled:z.boolean()}).parse(p);
     if(v.enabled)await db.query('INSERT INTO favorites(user_id,material_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[user.id,v.material_id]);
     else await db.query('DELETE FROM favorites WHERE user_id=$1 AND material_id=$2',[user.id,v.material_id]);break;
    }
    default: {
     check(user.role==='admin','Только для администратора',403);
     if(body.action==='material') {
      const v=z.object({id:id.optional(),title:short,description:text,url,type:z.enum(Object.keys(MATERIAL_TYPES) as [string,...string[]]),category:z.string().max(300),difficulty:short,tags:z.array(short).max(20),author:z.string().max(300),internal:z.boolean(),competency_ids:z.array(short).max(50)}).parse(p);
      if(v.id)await db.query('UPDATE materials SET title=$2,description=$3,url=$4,type=$5,category=$6,difficulty=$7,tags=$8,author=$9,internal=$10,competency_ids=$11 WHERE id=$1',[v.id,v.title,v.description,v.url,v.type,v.category,v.difficulty,v.tags,v.author,v.internal,v.competency_ids]);
      else await db.query('INSERT INTO materials(title,description,url,type,category,difficulty,tags,author,internal,competency_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[v.title,v.description,v.url,v.type,v.category,v.difficulty,v.tags,v.author,v.internal,v.competency_ids]);
     } else if(body.action==='matrix') {
      const v=z.object({title:short,source_note:text,data:matrixSchema,published:z.boolean(),source_verified:z.literal(true)}).parse(p);
      await db.query('INSERT INTO matrices(title,source_note,data,published) VALUES($1,$2,$3,$4)',[v.title,v.source_note,JSON.stringify(v.data),v.published]);
     } else if(body.action==='cycle') {
      const v=z.object({title:short,matrix_id:id,review_date:z.iso.date(),user_ids:z.array(id).min(1).max(100)}).parse(p);
      const matrix=(await db.query('SELECT * FROM matrices WHERE id=$1 AND published',[v.matrix_id])).rows[0];check(matrix,'Нужна опубликованная методика');
      check((await db.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) AND active',[v.user_ids])).rowCount===new Set(v.user_ids).size,'Проверьте участников');
      const cycle=(await db.query('INSERT INTO cycles(title,matrix_id,review_date) VALUES($1,$2,$3) RETURNING id',[v.title,v.matrix_id,v.review_date])).rows[0];
      for(const uid of new Set(v.user_ids))await db.query('INSERT INTO assessments(cycle_id,user_id) VALUES($1,$2)',[cycle.id,uid]);
     } else if(body.action==='cycleDate') {
      const v=z.object({id,review_date:z.iso.date()}).parse(p);
      check((await db.query('UPDATE cycles SET review_date=$2 WHERE id=$1 AND NOT archived RETURNING id',[v.id,v.review_date])).rowCount,'Цикл не найден или архивирован');
     } else if(body.action==='archive') {
      const v=z.object({id}).parse(p);
      check(!(await db.query('SELECT id FROM assessments WHERE cycle_id=$1 AND status<>6',[v.id])).rowCount,'Сначала завершите карточки участников');
      await db.query('UPDATE cycles SET archived=true WHERE id=$1',[v.id]);
     } else if(body.action==='user') {
      const v=z.object({id:id.optional(),name:short,email:z.email().max(250),role:z.enum(['designer','manager','admin']),direction:z.string().max(300),manager_id:id.nullable(),password:z.string().min(12).max(128).optional(),active:z.boolean()}).parse(p);
      await db.query("SELECT id FROM users WHERE role='admin' FOR UPDATE");
      if(v.id===user.id)check(v.active&&v.role==='admin','Нельзя отключить собственный административный доступ');
      if(v.manager_id)check(v.manager_id!==v.id&&(await db.query("SELECT id FROM users WHERE id=$1 AND role='manager' AND active",[v.manager_id])).rowCount,'Нужен действующий руководитель');
      if(v.id) {
       const old=(await db.query('SELECT role FROM users WHERE id=$1',[v.id])).rows[0];check(old,'Пользователь не найден',404);
       if(v.role!=='manager'||!v.active)check(!(await db.query('SELECT id FROM users WHERE manager_id=$1',[v.id])).rowCount,'Сначала переназначьте сотрудников руководителя');
       await db.query('UPDATE users SET name=$2,email=$3,role=$4,direction=$5,manager_id=$6,active=$7,password_hash=coalesce($8,password_hash) WHERE id=$1',[v.id,v.name,v.email.toLowerCase(),v.role,v.direction,v.manager_id,v.active,v.password?hashPassword(v.password):null]);
       if(v.password||!v.active)await db.query('DELETE FROM sessions WHERE user_id=$1',[v.id]);
      } else {check(v.password,'Укажите временный пароль минимум из 12 символов');await db.query('INSERT INTO users(name,email,role,direction,manager_id,active,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',[v.name,v.email.toLowerCase(),v.role,v.direction,v.manager_id,v.active,hashPassword(v.password)]);}
     } else throw new Rejected('Неизвестное действие');
    }
   }
   return {ok:true};
  },body.reason??'');
  return NextResponse.json(result);
 } catch(error) {
  if(error instanceof Rejected)return NextResponse.json({error:error.message},{status:error.status});
  if(error instanceof z.ZodError)return NextResponse.json({error:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')},{status:400});
  const e=error as {code?:string};
  if(e.code==='23505')return NextResponse.json({error:'Такая запись уже существует. Для плана разрешена одна цель каждого типа.'},{status:409});
  if(e.code==='42501')return NextResponse.json({error:'Нет доступа к этой операции'},{status:403});
  console.error('Action failed',e.code??'unknown');return NextResponse.json({error:'Не удалось сохранить. Повторите попытку.'},{status:500});
 }
}
