export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MIME=['application/pdf','image/jpeg','image/png','image/webp'];
export function permittedRecord(role,record){return ['admin','treasurer','contributor'].includes(role)&&((record.kind==='expense'&&record.status==='pending')||(['admin','treasurer'].includes(role)&&record.kind==='income'&&['approved','paid'].includes(record.status)));}
export function validateRecord(r){if(!r||!UUID.test(r.event_id)||!['income','expense'].includes(r.kind)||!Number.isSafeInteger(r.amount_pence)||r.amount_pence<1||r.amount_pence>100000000)throw new Error('Invalid transaction.');
 for(const [key,max,required] of [['description',250,true],['counterparty',150,true],['category',100,true],['reference',120,false],['notes',2000,false],['payment_method',40,true]])if(typeof r[key]!=='string'||r[key].length>max||(required&&!r[key].trim()))throw new Error('Invalid transaction field: '+key);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(r.transaction_date)||!Number.isFinite(Date.parse(r.transaction_date)))throw new Error('Invalid date.');
 return Object.fromEntries(['event_id','kind','transaction_date','description','category','amount_pence','counterparty','reference','notes','payment_method','status'].map(k=>[k,r[k]]));
}
export function validSignature(bytes,mime){const b=bytes;return mime==='application/pdf'?String.fromCharCode(...b.slice(0,5))==='%PDF-':mime==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:mime==='image/png'?b.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':mime==='image/webp'?String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP':false;}
