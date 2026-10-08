import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Brand,Glass } from '@/components/brand';
import { LoginForm } from '@/components/login';
import { currentUser } from '@/lib/auth';
export const dynamic='force-dynamic';
export default async function Login(){if(await currentUser())redirect('/app');return <main id="main" className="login-page"><div className="login-visual"><Glass/><h1>Расти<br/>в своём<br/>направлении.</h1></div><div className="login-form-wrap"><Brand/><LoginForm demo={process.env.NODE_ENV!=='production'&&process.env.SEED_DEMO==='true'&&process.env.DEMO_PASSWORD==='Design-Demo-2026!'}/><Link className="back-link" href="/">← Вернуться на главную</Link></div></main>}
