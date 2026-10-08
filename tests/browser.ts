import { chromium,expect } from '@playwright/test';
import assert from 'node:assert/strict';
import nextEnv from '@next/env';
import { mkdirSync } from 'node:fs';
nextEnv.loadEnvConfig(process.cwd());
const origin=process.env.TEST_ORIGIN??'http://localhost:3000';
const password=process.env.DEMO_PASSWORD;
if(!password)throw new Error('Local demo password needed');
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const errors:string[]=[];
mkdirSync('test-results',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',error=>errors.push(error.message));
 for(const route of ['/','/matrix','/tracks','/materials','/login']){
  const response=await page.goto(origin+route,{waitUntil:'networkidle'});assert.equal(response?.status(),200,route);
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} overflow at ${width}`);}
 }
 await page.setViewportSize({width:1440,height:1000});await page.goto(origin,{waitUntil:'networkidle'});await page.screenshot({path:'test-results/home-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/home-mobile.png',fullPage:true});
 for(const [email,role] of [['designer@design.local','designer'],['lead@design.local','manager'],['admin@design.local','admin']] as const){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});const p=await context.newPage();p.on('pageerror',error=>errors.push(error.message));
  await p.goto(origin+'/login',{waitUntil:'networkidle'});await p.getByLabel('Рабочая почта').fill(email);await p.getByLabel('Пароль',{exact:true}).fill(password);await p.getByRole('button',{name:'Войти →',exact:true}).click();await p.waitForURL('**/app');await p.waitForLoadState('networkidle');
  await expect(p.getByText('Начнём с общей матрицы')).toBeVisible();
  if(role==='designer') {
   for(const denied of ['/app/team','/app/admin']){await p.goto(origin+denied,{waitUntil:'networkidle'});await expect(p.getByText('Страница не найдена')).toBeVisible();}
   await p.goto(origin+'/app/materials',{waitUntil:'networkidle'});
   const favorite=p.getByRole('button',{name:/Добавить в избранное:/}).first();await favorite.click();await p.getByRole('button',{name:/Убрать из избранного:/}).first().waitFor();await p.getByRole('button',{name:/Убрать из избранного:/}).first().click();await p.getByRole('button',{name:/Добавить в избранное:/}).first().waitFor();
  }else if(role==='manager'){
   await p.goto(origin+'/app/team',{waitUntil:'networkidle'});await expect(p.getByText('Мария · демо',{exact:true})).toBeVisible();assert.equal(await p.getByText('Никита · демо',{exact:true}).count(),0);
  }else {
   await p.goto(origin+'/app/admin',{waitUntil:'networkidle'});await p.getByRole('button',{name:'Матрица и треки',exact:true}).click();await expect(p.getByText('Перенести исходную матрицу',{exact:true})).toBeVisible();await p.getByRole('button',{name:'Материалы',exact:true}).click();await p.getByRole('button',{name:'Изменить',exact:true}).first().click();await expect(p.getByText('Редактировать материал',{exact:true})).toBeVisible();
  }
  await p.goto(origin+'/app',{waitUntil:'networkidle'});await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.getByRole('button',{name:'Меню',exact:true}).click();await expect(p.getByRole('button',{name:'Выйти из кабинета'})).toBeVisible();await p.getByRole('button',{name:'Выйти из кабинета'}).click();await p.waitForURL('**/login');await context.close();
 }
 assert.deepEqual(errors,[]);
 console.log('Browser passed: public pages at 1440/768/390, three role logins, designer URL restrictions, favorites, team scope, admin forms, mobile logout; no JS errors.');
}finally{await browser.close();}
