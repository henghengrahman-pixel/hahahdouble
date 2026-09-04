const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8080);
const ADMIN_ID = String(process.env.ADMIN_ID || 'admin');
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'admin123');
const SESSION_SECRET = String(process.env.SESSION_SECRET || 'change-this-session-secret-in-railway');
const COOKIE_NAME = 'dana_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PUBLIC = path.join(__dirname, 'public');

function safeEqual(a,b){
  const aa=Buffer.from(String(a)), bb=Buffer.from(String(b));
  if(aa.length!==bb.length) return false;
  return crypto.timingSafeEqual(aa,bb);
}
function b64url(s){ return Buffer.from(s).toString('base64url'); }
function sign(payload){ return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url'); }
function makeToken(user){ const payload=b64url(JSON.stringify({u:user,exp:Date.now()+SESSION_TTL_MS})); return payload+'.'+sign(payload); }
function cookies(req){ const out={}; for(const p of String(req.headers.cookie||'').split(';')){ const i=p.indexOf('='); if(i>0) out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim()); } return out; }
function verifyToken(token){
  if(!token||!token.includes('.')) return null;
  const [payload,sig]=token.split('.');
  if(!safeEqual(sig,sign(payload))) return null;
  try{ const d=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')); if(!d.u||!d.exp||d.exp<Date.now()) return null; return d; }catch{return null;}
}
function json(res,status,obj,headers={}){ res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'}); res.end(JSON.stringify(obj)); }
function getBody(req){ return new Promise((resolve,reject)=>{let data=''; req.on('data',c=>{data+=c;if(data.length>262144){reject(new Error('too large'));req.destroy();}}); req.on('end',()=>{try{resolve(data?JSON.parse(data):{});}catch{reject(new Error('bad json'));}}); req.on('error',reject);}); }
function auth(req){ return verifyToken(cookies(req)[COOKIE_NAME]); }
function mime(file){ const e=path.extname(file).toLowerCase(); return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}[e]||'application/octet-stream'); }
function serveFile(res,file){
  if(!file.startsWith(PUBLIC)) return json(res,403,{ok:false});
  fs.readFile(file,(err,data)=>{ if(err) return json(res,404,{ok:false,error:'NOT_FOUND'}); res.writeHead(200,{'Content-Type':mime(file),'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}); res.end(data); });
}

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&u.pathname==='/health') return json(res,200,{ok:true,service:'dana-dashboard'});
  if(req.method==='GET'&&u.pathname==='/api/session'){ const s=auth(req); return s?json(res,200,{ok:true,user:s.u}):json(res,401,{ok:false,error:'UNAUTHORIZED'}); }
  if(req.method==='POST'&&u.pathname==='/api/login'){
    try{ const b=await getBody(req); if(!safeEqual(b.id||'',ADMIN_ID)||!safeEqual(b.password||'',ADMIN_PASSWORD)) return json(res,401,{ok:false,error:'ID atau password salah.'});
      const secure=String(req.headers['x-forwarded-proto']||'').includes('https');
      const cookie=`${COOKIE_NAME}=${encodeURIComponent(makeToken(ADMIN_ID))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS/1000)}${secure?'; Secure':''}`;
      return json(res,200,{ok:true,user:ADMIN_ID},{'Set-Cookie':cookie});
    }catch{return json(res,400,{ok:false,error:'Request tidak valid.'});}
  }
  if(req.method==='POST'&&u.pathname==='/api/logout') return json(res,200,{ok:true},{'Set-Cookie':`${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`});
  if(req.method==='GET'){
    const rel=u.pathname==='/'?'index.html':u.pathname.replace(/^\/+/, '');
    const target=path.normalize(path.join(PUBLIC,rel));
    if(fs.existsSync(target)&&fs.statSync(target).isFile()) return serveFile(res,target);
    return serveFile(res,path.join(PUBLIC,'index.html'));
  }
  json(res,404,{ok:false,error:'NOT_FOUND'});
});
server.listen(PORT,'0.0.0.0',()=>console.log(`DANA Tools listening on :${PORT}`));
