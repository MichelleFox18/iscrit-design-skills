import { NextRequest,NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { hashPassword,verifyPassword,digest } from '@/lib/password';
import { COOKIE_NAME } from '@/lib/auth';
import { validOrigin } from '@/lib/origin';
const dummy=hashPassword('constant-dummy-verification');
export async function POST(req:NextRequest) {
 if(!validOrigin(req)) return NextResponse.json({error:'Недопустимый источник запроса'},{status:403});
 try {
  if(Number(req.headers.get('content-length')??0)>10000) return NextResponse.json({error:'Запрос слишком большой'},{status:413});
  const {email,password}=z.object({email:z.email().max(250),password:z.string().min(1).max(128)}).parse(await req.json());
  const key=digest(email.toLowerCase());
  const attempts=await pool.query(`INSERT INTO login_attempts(key,attempts) VALUES($1,1) ON CONFLICT(key) DO UPDATE
   SET attempts=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END,
   window_start=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END RETURNING attempts`,[key]);
  if(attempts.rows[0].attempts>10) return NextResponse.json({error:'Слишком много попыток. Повторите через 15 минут.'},{status:429});
  const entry=(await pool.query('SELECT * FROM auth_lookup($1)',[email.toLowerCase()])).rows[0];
  const valid=verifyPassword(password,entry?.password_hash??dummy);
  if(!entry?.active || !valid) return NextResponse.json({error:'Проверьте почту и пароль'},{status:401});
  const token=randomBytes(32).toString('hex');
  await pool.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'7 days\')',[digest(token),entry.id]);
  await pool.query('DELETE FROM login_attempts WHERE key=$1',[key]);
  const res=NextResponse.json({ok:true});
  res.cookies.set(COOKIE_NAME,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:604800});
  return res;
 } catch(error) { if(error instanceof z.ZodError)return NextResponse.json({error:'Укажите корректные почту и пароль'},{status:400});console.error('Authentication unavailable');return NextResponse.json({error:'Не удалось войти. Попробуйте позже.'},{status:503}); }
}
export async function DELETE(req:NextRequest) {
 if(!validOrigin(req))return NextResponse.json({error:'Недопустимый источник запроса'},{status:403});
 const token=req.cookies.get(COOKIE_NAME)?.value;
 if(token)await pool.query('DELETE FROM sessions WHERE token_hash=$1',[digest(token)]);
 const res=NextResponse.json({ok:true});res.cookies.delete(COOKIE_NAME);return res;
}
