import { PublicHeader,Footer } from '@/components/brand';
import { MaterialsCatalog } from '@/components/catalog';
import { publicData } from '@/lib/data';
import { currentUser } from '@/lib/auth';
export const dynamic='force-dynamic';
export default async function MaterialsPage(){const user=await currentUser();const data=await publicData(user);return <><PublicHeader active="materials" signedIn={!!user}/><main id="main" className="page-content"><div className="page-banner"><h1>Полезные материалы</h1></div><div className="page-intro"><span className="eyebrow">БАЗА ЗНАНИЙ КОМАНДЫ</span><h2 style={{marginTop:18}}>Хороший инструмент.<br/>Новая точка зрения.</h2><p className="muted">Статьи, курсы, сервисы и инструкции для вашей практики. Сохраняйте нужное и возвращайтесь к материалам в плане развития.</p></div><MaterialsCatalog materials={data.materials} favorites={data.favorites} signedIn={!!user}/></main><Footer/></>}
