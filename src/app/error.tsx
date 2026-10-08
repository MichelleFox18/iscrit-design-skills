'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main id="main" className="page-content"><h1>Не удалось загрузить страницу</h1><p>Проверьте соединение и повторите попытку. Ваши сохранённые данные остаются в системе.</p><button className="button dark" onClick={reset}>Попробовать ещё раз</button></main>}
