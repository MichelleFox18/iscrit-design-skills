import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { pool } from './db';
import { digest } from './password';
import type { User } from './model';
export const COOKIE_NAME = 'design_session';
export async function currentUser():Promise<User|null> {
 const token=(await cookies()).get(COOKIE_NAME)?.value;
 if(!token) return null;
 return (await pool.query<User>('SELECT * FROM auth_session($1)',[digest(token)])).rows[0]??null;
}
export async function requireUser() { const user=await currentUser();if(!user)redirect('/login');return user; }
