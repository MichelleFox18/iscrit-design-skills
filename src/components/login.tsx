'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field,Feedback } from './forms';
export function LoginForm({demo}:{demo:boolean}) {
 const router=useRouter();const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 return <form className="login-form" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');const data=new FormData(event.currentTarget);try{const res=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:data.get('email'),password:data.get('password')})});const result=await res.json();if(!res.ok)throw new Error(result.error);router.push('/app');router.refresh();}catch(e){setError(e instanceof Error?e.message:'Проверьте соединение');}finally{setBusy(false);}}}>
 <span className="eyebrow">ВАШЕ ПРОСТРАНСТВО РОСТА</span><h2 style={{marginTop:20}}>С возвращением</h2><p className="muted">Оценка, обратная связь и развитие — в одном месте.</p><Field label="Рабочая почта"><input name="email" type="email" autoComplete="username" placeholder="name@company.ru" required maxLength={250}/></Field><Field label="Пароль"><input name="password" type="password" autoComplete="current-password" required maxLength={128}/></Field><Feedback error={error}/><button className="button dark" disabled={busy}>{busy?'Входим…':'Войти →'}</button><p className="small muted" style={{marginTop:18}}>Доступ выдаёт администратор дизайн-команды.</p>{demo&&<div className="demo-note">Тестовые аккаунты локального MVP:<br/><code>designer@design.local</code> · дизайнер<br/><code>lead@design.local</code> · руководитель<br/><code>admin@design.local</code> · администратор<br/>Пароль: <code>Design-Demo-2026!</code><br/>Это синтетические данные, без реальных оценок.</div>}
 </form>
}
