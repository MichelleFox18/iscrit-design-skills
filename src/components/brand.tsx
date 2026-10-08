import Link from 'next/link';
export function Brand() {return <Link className="brand" href="/" aria-label="Дизайн — главная"><span className="brand-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M10 20h20" stroke="currentColor" strokeWidth="3"/><circle cx="10" cy="20" r="4" fill="currentColor"/><circle cx="30" cy="20" r="4" fill="currentColor"/></svg></span><span>дизайн<span className="brand-sub">пространство роста</span></span></Link>}
export function Glass({small=false}:{small?:boolean}) {
 return <svg className={small?'glass glass-small':'glass'} viewBox="0 0 760 800" fill="none" aria-hidden="true">
 <defs>
 <linearGradient id={small?'gold-s':'gold'} x1="80" y1="60" x2="590" y2="740" gradientUnits="userSpaceOnUse"><stop stopColor="#fff8c2"/><stop offset=".23" stopColor="#f0a53b"/><stop offset=".47" stopColor="#dce9fa"/><stop offset=".68" stopColor="#e7b643"/><stop offset="1" stopColor="#c65712"/></linearGradient>
 <linearGradient id={small?'ice-s':'ice'} x1="100" y1="80" x2="670" y2="550" gradientUnits="userSpaceOnUse"><stop stopColor="#eaf4ff" stopOpacity=".85"/><stop offset=".22" stopColor="#adc8e7" stopOpacity=".18"/><stop offset=".65" stopColor="#193b8c" stopOpacity=".12"/><stop offset="1" stopColor="#edf4ff" stopOpacity=".7"/></linearGradient>
 <linearGradient id={small?'edge-s':'edge'} x1="130" y1="100" x2="600" y2="650" gradientUnits="userSpaceOnUse"><stop stopColor="#ffdf81"/><stop offset=".25" stopColor="white"/><stop offset=".48" stopColor="#d4eaff"/><stop offset=".7" stopColor="#c9841f"/><stop offset="1" stopColor="#ffdc8e"/></linearGradient>
 <radialGradient id={small?'shine-s':'shine'}><stop stopColor="white"/><stop offset="1" stopColor="white" stopOpacity="0"/></radialGradient>
 </defs>
 <path d="M205 52L623 231L720 633L562 785L114 618L80 276L205 52Z" fill={`url(#${small?'ice-s':'ice'})`} stroke={`url(#${small?'edge-s':'edge'})`} strokeWidth="2"/>
 <path d="M205 52L623 231L631 270L218 95L205 52Z" fill={`url(#${small?'gold-s':'gold'})`}/>
 <path d="M205 52L218 95L160 307L80 276L205 52Z" fill={`url(#${small?'gold-s':'gold'})`}/>
 <path d="M80 276L160 307L171 579L114 618L80 276Z" fill={`url(#${small?'ice-s':'ice'})`} stroke={`url(#${small?'edge-s':'edge'})`}/>
 <path d="M171 579L631 270L623 231L205 52L171 579Z" fill="#193582" fillOpacity=".25"/>
 <path d="M631 270L720 633L693 604L602 301L631 270Z" fill={`url(#${small?'ice-s':'ice'})`} stroke={`url(#${small?'edge-s':'edge'})`}/>
 <path d="M114 618L171 579L693 604L720 633L562 785L114 618Z" fill={`url(#${small?'gold-s':'gold'})`}/>
 <path d="M171 579L693 604L562 745L171 579Z" fill={`url(#${small?'ice-s':'ice'})`} opacity=".4"/>
 <path d="M218 95L602 256M97 289L122 578M635 288L708 617M140 624L556 778" stroke="#fff" strokeOpacity=".64" strokeWidth="2"/>
 <ellipse cx="123" cy="566" rx="75" ry="80" fill={`url(#${small?'shine-s':'shine'})`} opacity=".55"/>
 <path d="M123 527v76M92 566h62" stroke="#fff" strokeOpacity=".6"/>
 </svg>
}
export function PublicHeader({active='',signedIn=false}:{active?:string;signedIn?:boolean}) {return <header className="public-header"><Brand/><nav aria-label="Основная навигация"><Link aria-current={active==='matrix'?'page':undefined} href="/matrix">Матрица</Link><Link aria-current={active==='tracks'?'page':undefined} href="/tracks">Треки</Link><Link aria-current={active==='materials'?'page':undefined} href="/materials">Материалы</Link></nav><Link className="button dark" href={signedIn?'/app':'/login'}>{signedIn?'Мой кабинет':'Войти в кабинет'} <span aria-hidden="true">→</span></Link></header>}
export function Footer() {return <footer className="footer"><Brand/><span>Развиваем людей. Создаём дизайн.</span><Link href="/matrix">Исследовать матрицу →</Link></footer>}
