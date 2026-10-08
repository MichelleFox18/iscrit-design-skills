import { PublicHeader,Footer } from '@/components/brand';
import { MatrixCatalog } from '@/components/catalog';
import { publicData } from '@/lib/data';
export const dynamic='force-dynamic';
export default async function MatrixPage(){const {matrix}=await publicData();return <><PublicHeader active="matrix"/><main id="main" className="page-content"><div className="page-banner"><h1>Матрица компетенций</h1></div><div className="page-intro"><span className="eyebrow">ОБЩИЕ КРИТЕРИИ РОСТА</span><h2 style={{marginTop:18}}>От ожиданий<br/>к конкретным навыкам.</h2><p className="muted">Четыре области, 13 компетенций, четыре уровня. Сравнивайте соседние уровни и возвращайтесь к критериям, когда выбираете следующий шаг.</p></div><MatrixCatalog matrix={matrix?.data??null}/></main><Footer/></>}
