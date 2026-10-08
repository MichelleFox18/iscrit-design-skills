import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { workspaceData } from '@/lib/data';
import { Workspace } from '@/components/workspace';
export const dynamic='force-dynamic';
export default async function AppPage({params}:{params:Promise<{section?:string[]}>}){
 const user=await requireUser();const {section:segments=[]}=await params;const section=segments[0]??'';
 if(!['','assessment','development','history','materials','team','admin'].includes(section))notFound();
 if(section==='admin'&&user.role!=='admin')notFound();
 if(section==='team'&&user.role==='designer')notFound();
 if(segments.length>2||(segments.length===2&&section!=='assessment'))notFound();
 const data=await workspaceData(user);const selected=segments[1]?data.assessments.find(a=>a.id===segments[1]):undefined;
 if(segments[1]&&!selected)notFound();
 return <Workspace data={data} section={section} selected={selected}/>;
}
