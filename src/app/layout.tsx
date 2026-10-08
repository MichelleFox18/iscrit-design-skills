import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:{default:'Дизайн — пространство роста',template:'%s · Дизайн'},description:'Матрица компетенций, review и индивидуальное развитие дизайн-команды.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="ru"><body><a className="skip-link" href="#main">Перейти к содержимому</a>{children}</body></html>}
