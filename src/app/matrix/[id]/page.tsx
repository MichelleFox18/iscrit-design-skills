import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PublicHeader,Footer } from '@/components/brand';
import { publicData } from '@/lib/data';
export const dynamic='force-dynamic';
export default async function CompetencyPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const {matrix}=await publicData();const area=[...(matrix?.data.areas??[]),...(matrix?.data.tracks??[])].find(a=>a.competencies.some(c=>c.id===id));const c=area?.competencies.find(c=>c.id===id);if(!c)notFound();return <><PublicHeader active="matrix"/><main id="main" className="page-content"><Link className="text-link" href="/matrix">← К матрице</Link><p className="eyebrow" style={{marginTop:35}}>{area!.name}</p><h1 style={{fontSize:48}}>{c.name}</h1><p>{c.description}</p><div className="level-list">{c.levels.map((l,i)=><div className="level" key={i}><span>Уровень {i+1}</span><p style={{whiteSpace:'pre-wrap'}}>{l}</p></div>)}</div></main><Footer/></>}
