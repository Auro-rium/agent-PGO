export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const email=String(req.body?.email||'').trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({error:'Enter a valid email.'});

  const base=process.env.GOOGLE_SCRIPT_URL||'https://script.google.com/macros/s/AKfycbyfKLHJL4VFvCGWchM8da3hZ5WMwQnVLKB8DarnCkAWAE4migT_fA1_GOSj08wEMPK4/exec';
  const payload={
    email,
    createdAt:new Date().toISOString(),
    source:String(req.body?.source||'landing'),
    userAgent:String(req.body?.ua||'').slice(0,500)
  };

  const endpoint=new URL(base);
  for(const [k,v] of Object.entries(payload)) endpoint.searchParams.set(k,v);

  try{
    const upstream=await fetch(endpoint.toString(),{
      method:'POST',
      redirect:'follow',
      headers:{'content-type':'application/json','accept':'application/json,text/plain,*/*'},
      body:JSON.stringify(payload)
    });

    const body=await upstream.text();
    const contentType=upstream.headers.get('content-type')||'';
    console.log('waitlist_google_response',{status:upstream.status,contentType,body:body.slice(0,600)});

    if(!upstream.ok) throw new Error(`Google endpoint ${upstream.status}`);

    let parsed;
    try{parsed=JSON.parse(body)}catch{throw new Error('Google endpoint did not return JSON confirmation');}
    if(parsed?.ok!==true) throw new Error(parsed?.error||'Google endpoint did not confirm insert');

    return res.status(200).json({ok:true,duplicate:Boolean(parsed.duplicate)});
  }catch(err){
    console.error('waitlist_forward_failed',err);
    return res.status(502).json({error:'Could not save your email. Try again shortly.'});
  }
}