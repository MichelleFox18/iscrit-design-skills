import nextEnv from '@next/env';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { hashPassword } from '../src/lib/password';
import { z } from 'zod';
nextEnv.loadEnvConfig(process.cwd());
const url = process.env.MIGRATION_DATABASE_URL;
if (!url || !process.env.APP_DATABASE_PASSWORD) throw new Error('Set MIGRATION_DATABASE_URL and APP_DATABASE_PASSWORD');
const db = new Pool({ connectionString: url });
try {
  // SQL literal escaping is necessary because CREATE ROLE does not accept parameters.
  const password = "'" + process.env.APP_DATABASE_PASSWORD.replaceAll("'", "''") + "'";
  await db.query(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='design_app') THEN CREATE ROLE design_app LOGIN; END IF; END $$`);
  await db.query(`ALTER ROLE design_app PASSWORD ${password}`);
  await db.query('ALTER ROLE design_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE');
  await db.query(readFileSync('db/001_schema.sql', 'utf8'));
  if (process.env.INITIAL_ADMIN_EMAIL || process.env.INITIAL_ADMIN_PASSWORD) {
    const credentials=z.object({email:z.email().max(250),password:z.string().min(16).max(128)}).parse({email:process.env.INITIAL_ADMIN_EMAIL,password:process.env.INITIAL_ADMIN_PASSWORD});
    const client=await db.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('initial-design-admin'))");
      if(!(await client.query("SELECT id FROM users WHERE role='admin' AND active")).rowCount) {
        await client.query("INSERT INTO users(email,name,role,password_hash) VALUES($1,'Администратор','admin',$2)",[credentials.email.toLowerCase(),hashPassword(credentials.password)]);
        console.log('Initial administrator created. Password was not printed.');
      }
      await client.query('COMMIT');
    } catch(error){await client.query('ROLLBACK');throw error;}
    finally {client.release();}
  }
  if (process.env.SEED_DEMO === 'true') {
    if (process.env.NODE_ENV === 'production') throw new Error('Demo seed disabled in production');
    const pass = process.env.DEMO_PASSWORD;
    if (!pass || pass.length < 12) throw new Error('DEMO_PASSWORD needs at least 12 characters');
    const entries = [
      ['admin@design.local','Администратор','admin','Дизайн-команда'],
      ['lead@design.local','Александра · демо','manager','Дизайн-команда'],
      ['designer@design.local','Мария · демо','designer','Коммуникационный дизайн'],
      ['other@design.local','Никита · демо','designer','UI и дизайн-системы'],
    ];
    for (const [email,name,role,direction] of entries) await db.query(
      'INSERT INTO users(email,name,role,direction,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING',
      [email,name,role,direction,hashPassword(pass)]);
    await db.query("UPDATE users SET manager_id=(SELECT id FROM users WHERE email='lead@design.local') WHERE email='designer@design.local' AND manager_id IS NULL");
    // No invented competencies or source descriptions in seed.
    for (const [title, description, url, type, category, tags, author] of [
      ['Доступность интерфейсов','Рекомендации W3C по доступности веб-интерфейсов.','https://www.w3.org/WAI/WCAG22/quickref/','instruction','UI и дизайн-системы',['доступность','WCAG'],'W3C'],
      ['Material Design','Принципы, компоненты и паттерны проектирования интерфейсов.','https://m3.material.io/','service','UI и дизайн-системы',['компоненты','системы'],'Google'],
      ['Figma Learn','Официальные учебные материалы по работе в Figma.','https://help.figma.com/','instruction','Дизайн и решение задач',['Figma','инструменты'],'Figma'],
    ] as const) {
      await db.query('INSERT INTO materials(title,description,url,type,category,tags,author) SELECT $1,$2,$3,$4,$5,$6,$7 WHERE NOT EXISTS(SELECT 1 FROM materials WHERE url=$3)',[title,description,url,type,category,tags,author]);
    }
  }
  console.log('Schema and runtime role ready. No methodology imported.');
} finally { await db.end(); }
