import 'server-only';
import { withDb } from './db';
import type { User,Assessment,Matrix,Material } from './model';
export async function publicData(user:User|null=null) {
 return withDb(user?.id??null,async db=>({
  matrix:(await db.query<{id:string;title:string;data:Matrix}>('SELECT id,title,data FROM matrices WHERE published ORDER BY created_at DESC LIMIT 1')).rows[0]??null,
  materials:(await db.query<Material>('SELECT * FROM materials ORDER BY created_at DESC')).rows,
  favorites:user?(await db.query('SELECT material_id FROM favorites WHERE user_id=$1',[user.id])).rows.map(r=>r.material_id):[],
 }));
}
export async function workspaceData(user:User) {
 return withDb(user.id,async db=>{
  const assessments=(await db.query<Assessment>(`SELECT a.*,u.name user_name,c.title,c.matrix_id,m.data,coalesce(a.review_date,c.review_date)::text review_date
   FROM assessments a JOIN users u ON u.id=a.user_id JOIN cycles c ON c.id=a.cycle_id JOIN matrices m ON m.id=c.matrix_id ORDER BY a.created_at DESC`)).rows;
  for(const a of assessments) {
   a.ratings=(await db.query('SELECT competency_id,kind,answer,value,comment,evidence FROM ratings WHERE assessment_id=$1',[a.id])).rows;
   a.goals=(await db.query('SELECT *,due_date::text FROM goals WHERE assessment_id=$1 ORDER BY source',[a.id])).rows;
  }
  return {
   user,assessments,
   users:(await db.query('SELECT id,email,name,role,direction,manager_id,active FROM users ORDER BY name')).rows as (User & {active:boolean})[],
   materials:(await db.query<Material>('SELECT * FROM materials ORDER BY created_at DESC')).rows,
   favorites:(await db.query('SELECT material_id FROM favorites WHERE user_id=$1',[user.id])).rows.map(r=>r.material_id) as string[],
   matrices:user.role==='admin'?(await db.query('SELECT * FROM matrices ORDER BY created_at DESC')).rows as {id:string;title:string;data:Matrix;published:boolean;source_note:string}[]:[],
   cycles:user.role==='admin'?(await db.query('SELECT *,review_date::text FROM cycles ORDER BY created_at DESC')).rows as {id:string;title:string;matrix_id:string;review_date:string;archived:boolean}[]:[],
   audit:user.role!=='designer'?(await db.query('SELECT id,actor_id,entity,entity_id,action,reason,created_at,old_data,new_data FROM audit_events ORDER BY created_at DESC LIMIT 100')).rows:[],
  };
 });
}
export type WorkspaceData = Awaited<ReturnType<typeof workspaceData>>;
