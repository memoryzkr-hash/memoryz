/**
 * Runs on claude.ai: reads the signed-in account's usage through the same internal endpoints the
 * settings page uses and copies `{email, usage}` as JSON. Nothing about the login itself is copied.
 * These endpoints are undocumented, so the paste flow is labelled experimental in the UI.
 */
const SOURCE = `(async()=>{
if(!/(^|\\.)claude\\.ai$/.test(location.hostname)){alert('claude.ai 페이지에서 눌러 주세요.');return}
try{
const j=async p=>{const r=await fetch(p,{credentials:'include'});if(!r.ok)throw new Error(p+' '+r.status);return r.json()};
const orgs=await j('/api/organizations');
const org=orgs.find(o=>(o.capabilities||[]).includes('chat'))||orgs[0];
const usage=await j('/api/organizations/'+org.uuid+'/usage');
let email=null;try{const a=await j('/api/account');email=a.email_address||a.email||null}catch(e){}
const t=JSON.stringify({email,usage});
try{await navigator.clipboard.writeText(t);alert('사용량을 복사했어요. 관리 페이지에 붙여 넣으세요.')}
catch(e){prompt('아래 내용을 복사해서 관리 페이지에 붙여 넣으세요.',t)}
}catch(e){alert('사용량을 읽지 못했어요: '+e.message)}
})()`;

export const BOOKMARKLET = 'javascript:' + encodeURIComponent(SOURCE.replace(/\n/g, ''));
