export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const email=String(req.body?.email||'').trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({error:'Enter a valid email.'});
  const endpoint=process.env.GOOGLE_SCRIPT_URL||'https://script.google.com/macros/s/AKfycbyfKLHJL4VFvCGWchM8da3hZ5WMwQnVLKB8DarnCkAWAE4migT_fA1_GOSj08wEMPK4/exec';
  try{
    const upstream=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,createdAt:new Date().toISOString(),source:String(req.body?.source||'landing'),userAgent:String(req.body?.ua||'').slice(0,500)})});
    if(!upstream.ok) throw new Error(`Google endpoint ${upstream.status}`);
    const body=await upstream.text();
    let parsed={}; try{parsed=JSON.parse(body)}catch{}
    if(parsed.ok===false) throw new Error(parsed.error||'Google Apps Script rejected submission');
    return res.status(200).json({ok:true,duplicate:Boolean(parsed.duplicate)});
  }catch(err){console.error('waitlist_forward_failed',err);return res.status(502).json({error:'Could not save your email. Try again shortly.'});}
}