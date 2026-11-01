import {createClient} from 'npm:@supabase/supabase-js@2.49.8';
import {UUID,MIME,permittedRecord,validateRecord,validSignature} from './validation.mjs';
const MAX=10*1024*1024;
const env=(name:string)=>{const value=Deno.env.get(name);if(!value)throw new Error('Service configuration incomplete');return value;};
class HttpError extends Error{constructor(public status:number,message:string){super(message);}}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin'); const allowed=Deno.env.get('FINANCE_ORIGIN')||'https://leamingtonmarathi.com';
 const headers={'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
 if(origin&&origin!==allowed)return json({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 let uploadedId:string|undefined,createdId:string|undefined,admin:ReturnType<typeof createClient>|undefined,token:string|undefined;
 try{
  if(!['GET','POST'].includes(req.method))throw new HttpError(405,'Method not allowed');
  const authorization=req.headers.get('authorization')||'';if(!/^Bearer .+/.test(authorization))throw new HttpError(401,'Sign in required');
  const url=env('SUPABASE_URL');const anon=env('SUPABASE_ANON_KEY');
  const client=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:{user},error:authError}=await client.auth.getUser(authorization.slice(7));if(authError||!user)throw new HttpError(401,'Sign in required');
  const {data:member,error:memberError}=await client.from('finance_members').select('role').eq('user_id',user.id).eq('active',true).maybeSingle();if(memberError||!member)throw new HttpError(403,'Finance access not granted');
  const refresh=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env('GOOGLE_CLIENT_ID'),client_secret:env('GOOGLE_CLIENT_SECRET'),refresh_token:env('GOOGLE_REFRESH_TOKEN'),grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
  const auth=await refresh.json();if(!refresh.ok||!auth.access_token)throw new HttpError(503,'Google Drive connection needs administrator attention');token=auth.access_token;
  if(req.method==='GET'){
   const id=new URL(req.url).searchParams.get('invoice');if(!id||!UUID.test(id))throw new HttpError(400,'Invalid invoice');
   const {data:invoice,error}=await client.from('finance_invoices').select('drive_file_id,file_name,mime_type').eq('id',id).maybeSingle();if(error||!invoice)throw new HttpError(404,'Invoice not found');
   const drive=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(invoice.drive_file_id)}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});if(!drive.ok)throw new HttpError(502,'Invoice could not be retrieved');
   return new Response(drive.body,{headers:{...headers,'Content-Type':invoice.mime_type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(invoice.file_name)}`,'X-Content-Type-Options':'nosniff'}});
  }
  if(!['admin','treasurer','contributor'].includes(member.role))throw new HttpError(403,'Read-only account');
  // Bound the request stream even when Content-Length is absent or dishonest.
  const reader=req.body?.getReader();if(!reader)throw new HttpError(400,'Missing upload');const chunks:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX+128*1024){await reader.cancel();throw new HttpError(413,'Upload is too large');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const form=await new Response(bytes,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData();
  let record;try{record=validateRecord(JSON.parse(String(form.get('record'))));}catch{throw new HttpError(400,'Invalid transaction details');}
  if(!permittedRecord(member.role,record))throw new HttpError(403,'Transaction type or status not permitted');
  const file=form.get('invoice');if(!(file instanceof File)||file.size<1||file.size>MAX||!MIME.includes(file.type))throw new HttpError(400,'Use a PDF, JPG, PNG or WebP invoice, up to 10 MB');
  const fileBytes=new Uint8Array(await file.arrayBuffer());if(!validSignature(fileBytes,file.type))throw new HttpError(400,'File content does not match the selected format');
  const {data:event,error:eventError}=await client.from('finance_events').select('id,name').eq('id',record.event_id).maybeSingle();if(eventError||!event)throw new HttpError(403,'Event unavailable');
  const {data:category,error:categoryError}=await client.from('finance_categories').select('name').eq('name',record.category).eq('kind',record.kind).maybeSingle();if(categoryError||!category)throw new HttpError(400,'Invalid category');
  const clean=(s:string)=>s.replace(/[^\p{L}\p{N} ._-]/gu,'_');const fileName=clean(file.name).slice(0,160)||'invoice';
  const driveName=`${clean(event.name).slice(0,60)}_${record.transaction_date}_${crypto.randomUUID()}_${fileName}`;
  const boundary='lm_'+crypto.randomUUID().replaceAll('-','');
  const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,JSON.stringify({name:driveName,parents:[env('GOOGLE_DRIVE_FOLDER_ID')],description:`${record.kind}: ${record.category}`}),`\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`,fileBytes,`\r\n--${boundary}--\r\n`]);
  const upload=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':`multipart/related; boundary=${boundary}`},body,signal:AbortSignal.timeout(45000)});
  if(!upload.ok)throw new HttpError(502,'Invoice upload failed. Transaction was not saved.');const driveFile=await upload.json();if(!driveFile.id)throw new HttpError(502,'Drive did not confirm the upload');uploadedId=driveFile.id;
  // Revocation is checked again after the slow upload, before committing data.
  const {data:stillActive}=await client.from('finance_members').select('role').eq('user_id',user.id).eq('active',true).maybeSingle();if(!stillActive||!permittedRecord(stillActive.role,record))throw new HttpError(403,'Access changed during upload');
  admin=createClient(url,env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
  const {data:transaction,error:txError}=await admin.from('finance_transactions').insert({...record,created_by:user.id}).select('id').single();if(txError)throw new HttpError(400,'Transaction could not be saved');createdId=transaction.id;
  const {error:invoiceError}=await admin.from('finance_invoices').insert({event_id:record.event_id,transaction_id:transaction.id,drive_file_id:uploadedId,file_name:fileName,mime_type:file.type,size_bytes:file.size,uploaded_by:user.id});if(invoiceError)throw new HttpError(500,'Invoice could not be linked to the transaction');
  return json({id:transaction.id,saved:true});
 }catch(error){
  // Compensate partial failures; never report success after an unlinked upload.
  if(createdId&&admin){const {error:cleanupError}=await admin.from('finance_transactions').delete().eq('id',createdId);if(cleanupError)console.error('Finance transaction rollback needs reconciliation',createdId);}
  if(uploadedId&&token){try{const cleanup=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(uploadedId)}?supportsAllDrives=true`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({trashed:true}),signal:AbortSignal.timeout(10000)});if(!cleanup.ok)console.error('Finance Drive rollback needs reconciliation',uploadedId);}catch{console.error('Finance Drive rollback needs reconciliation',uploadedId);}}
  const status=error instanceof HttpError?error.status:500;return json({error:error instanceof HttpError?error.message:'Service unavailable. Contact the finance administrator.'},status);
 }
});
