import { randomBytes } from 'node:crypto';
import { existsSync,writeFileSync } from 'node:fs';
if(existsSync('.env.local')) {
 console.log('Existing .env.local preserved.');
}else {
 const owner=randomBytes(20).toString('hex');const app=randomBytes(20).toString('hex');
 const values=[`POSTGRES_PASSWORD=${owner}`,`DATABASE_URL=postgresql://design_app:${app}@127.0.0.1:54329/design_growth`,`MIGRATION_DATABASE_URL=postgresql://postgres:${owner}@127.0.0.1:54329/design_growth`,`APP_DATABASE_PASSWORD=${app}`,'SEED_DEMO=true','DEMO_PASSWORD=Design-Demo-2026!'];
 writeFileSync('.env.local',values.join('\n')+'\n',{mode:0o600,flag:'wx'});
 console.log('Local development configuration created. Database credentials were not printed.');
}
