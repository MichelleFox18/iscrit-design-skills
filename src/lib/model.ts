import { z } from 'zod';
export const AREA_NAMES = ['Дизайн и решение задач','Коммуникация и совместная работа','Самоорганизация и ведение работы','Ответственность и влияние'];
export const TRACK_NAMES = ['Брендинг и айдентика','Коммуникационный дизайн','UI и дизайн-системы','Технический дизайн и производство','Управленческий трек'];
export const STATUSES = ['Черновик самооценки','Самооценка отправлена','Руководитель заполняет оценку','Готово к обсуждению','Review проведено','Итог подтверждён','Цикл завершён'];
export const GOAL_STATUSES: Record<string,string> = { planned:'Запланировано',active:'В работе',completed:'Выполнено',postponed:'Перенесено',cancelled:'Отменено' };
export const MATERIAL_TYPES: Record<string,string> = { article:'Статья',book:'Книга',course:'Курс',video:'Видео',service:'Сервис',template:'Шаблон',instruction:'Инструкция',internal_document:'Внутренний документ' };
export const roleNames: Record<string,string> = {designer:'Дизайнер',manager:'Руководитель',admin:'Администратор'};
const text = z.string().trim().min(1).max(10000);
const competencySchema = z.object({ id:z.string().regex(/^[a-z0-9_-]+$/).max(80), name:text, description:z.string().max(10000), levels:z.tuple([text,text,text,text]) });
export const matrixSchema = z.object({
  areas:z.array(z.object({id:text,name:text,competencies:z.array(competencySchema)})).length(4),
  tracks:z.array(z.object({id:text,name:text,management:z.boolean(),competencies:z.array(competencySchema).min(1)})).length(5),
}).superRefine((data,ctx)=>{
  data.areas.forEach((area,index)=>{if(area.name!==AREA_NAMES[index] || area.competencies.length!==(index===0?4:3)) ctx.addIssue({code:'custom',message:'Области должны содержать 4/3/3/3 компетенции в порядке методики'});});
  const all = [...data.areas,...data.tracks].flatMap(a=>a.competencies.map(c=>c.id));
  if(new Set(all).size!==all.length) ctx.addIssue({code:'custom',message:'Идентификаторы компетенций должны быть уникальными'});
  if(new Set([...data.areas,...data.tracks].map(a=>a.id)).size!==9) ctx.addIssue({code:'custom',message:'Идентификаторы областей и треков должны быть уникальными'});
  data.tracks.forEach((track,index)=>{if(track.name!==TRACK_NAMES[index] || track.management!==(index===4)) ctx.addIssue({code:'custom',message:'Проверьте пять треков и управленческое направление'});});
});
export type Matrix = z.infer<typeof matrixSchema>;
export type Competency = Matrix['areas'][number]['competencies'][number];
export type User = {id:string;email:string;name:string;role:'designer'|'manager'|'admin';direction:string;manager_id:string|null};
export type Rating = {competency_id:string;kind:'self'|'manager'|'final';answer:'unanswered'|'na'|'rated';value:number|null;comment:string;evidence:string[]};
export type Assessment = {id:string;cycle_id:string;user_id:string;user_name:string;title:string;matrix_id:string;data:Matrix;status:number;primary_track:string|null;additional_track:string|null;review_date:string|null;employee_confirmed:boolean;manager_confirmed:boolean;review_comment:string;revision:number;ratings:Rating[];goals:Goal[];history_goals:Goal[]|null};
export type Goal = {id:string;assessment_id:string;source:'general'|'track';competency_id:string;current_level:number;target_level:number;months:3|6;due_date:string;expected_result:string;success_criteria:string;actions:{text:string;done:boolean}[];status:string;checkpoints:{date:string;text:string;url?:string}[];material_ids:string[];employee_comment:string;manager_comment:string;employee_approved:boolean;manager_approved:boolean;revision:number};
export type Material = {id:string;title:string;description:string;url:string;type:string;category:string;difficulty:string;tags:string[];author:string;internal:boolean;competency_ids:string[];created_at:string};
export function calculate(matrix:Matrix, ratings:Rating[], kind:Rating['kind']) {
 const values = new Map(ratings.filter(r=>r.kind===kind && r.answer==='rated').map(r=>[r.competency_id,r.value!]));
 const areas = matrix.areas.map((a,i)=>{const numbers=a.competencies.map(c=>values.get(c.id)).filter((v):v is number=>v!==undefined);return {id:a.id,name:a.name,count:numbers.length,required:i===0?3:2,average:numbers.length?numbers.reduce((s,v)=>s+v,0)/numbers.length:null};});
 const count=areas.reduce((n,a)=>n+a.count,0);
 const complete=count>=11 && areas.every(a=>a.count>=a.required);
 const score=complete?areas.reduce((s,a)=>s+a.average!,0)/4:null;
 return {areas,count,complete,score,percent:score===null?null:score/4*100,grade:score===null?null:score<1.5?'Junior':score<2.5?'Middle':score<3.5?'Senior':'Уровень 4'};
}
export const allCompetencies = (matrix:Matrix) => [...matrix.areas,...matrix.tracks].flatMap(a=>a.competencies);
export function canAdvance(role:User['role'],own:boolean,status:number,target:number) {
 if(target!==status+1 || target>6) return false;
 if(status===0) return own;
 return role==='manager'||role==='admin';
}
