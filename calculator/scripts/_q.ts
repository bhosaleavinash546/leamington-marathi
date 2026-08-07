import db from '../server/db.js';
const rows = db.prepare('SELECT id,status,commodity,part_name,error FROM dfm_jobs ORDER BY queued_at DESC LIMIT 5').all();
console.log('dfm_jobs rows:', rows.length);
for (const r of rows) console.log(JSON.stringify(r));
