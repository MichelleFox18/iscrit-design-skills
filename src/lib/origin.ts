import type { NextRequest } from 'next/server';
export function validOrigin(req:NextRequest) {
 const origin=req.headers.get('origin');
 if(!origin)return false;
 if(process.env.APP_ORIGIN)return origin===process.env.APP_ORIGIN;
 try {
  const parsed=new URL(origin);
  return ['http:','https:'].includes(parsed.protocol)&&parsed.host===req.headers.get('host');
 } catch {return false;}
}
