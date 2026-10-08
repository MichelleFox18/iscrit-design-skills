'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function useAction() {
 const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [success,setSuccess]=useState('');
 async function run(action:string,payload:unknown,reason?:string) {
  setBusy(true);setError('');setSuccess('');
  try {const res=await fetch('/api/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload,reason})});const data=await res.json();if(!res.ok)throw new Error(data.error??'Не удалось сохранить');setSuccess('Сохранено');router.refresh();return true;}
  catch(e){setError(e instanceof Error?e.message:'Нет соединения. Попробуйте ещё раз.');return false;}finally{setBusy(false);}
 }
 return {run,busy,error,success};
}
export function Feedback({error,success}:{error?:string;success?:string}) {return <>{error&&<p className="error-message" role="alert">{error}</p>}{success&&<p className="success-message" role="status">{success}</p>}</>}
export function Field({label,children,hint}:{label:string;children:React.ReactNode;hint?:string}) {return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
export function ActionButton({action,payload,children,disabled=false,reason}:{action:string;payload:unknown;children:React.ReactNode;disabled?:boolean;reason?:string}) {const a=useAction();return <div><button className="button dark" disabled={a.busy||disabled} onClick={()=>a.run(action,payload,reason)}>{a.busy?'Сохраняем…':children}</button><Feedback {...a}/></div>}
