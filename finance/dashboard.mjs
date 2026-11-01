import {EXPENSES,actualFor,summarise} from './domain.mjs';
export function dashboardMetrics(rows,budgets,invoices){
 const totals=summarise(rows,budgets),expenseRows=rows.filter(r=>r.kind==='expense'&&r.status!=='rejected');
 const attached=new Set(invoices.map(i=>i.transaction_id));
 const missing=expenseRows.filter(r=>!attached.has(r.id));
 const usage=totals.plannedExpenses>0?totals.expenses/totals.plannedExpenses*100:null;
 const categories=EXPENSES.map(category=>{const planned=Number(budgets.find(b=>b.category===category)?.amount_pence||0),actual=actualFor(rows,category);return {category,planned,actual,variance:planned-actual};}).filter(x=>x.actual||x.planned);
 return {...totals,usage,incomeProgress:totals.plannedIncome>0?totals.income/totals.plannedIncome*100:null,
  coverage:expenseRows.length?(expenseRows.length-missing.length)/expenseRows.length*100:null,
  missing,expenseCount:expenseRows.length,pendingCount:rows.filter(r=>r.kind==='expense'&&r.status==='pending').length,
  payableCount:rows.filter(r=>r.kind==='expense'&&r.status==='approved').length,
  receivableCount:rows.filter(r=>r.kind==='income'&&r.status==='approved').length,
  exposure:totals.expenses+totals.pending,categories,
  overruns:categories.filter(x=>x.planned>0&&x.actual>x.planned),unbudgeted:categories.filter(x=>!x.planned&&x.actual>0)};
}
export function monthlyCash(rows,limit=6){
 const paid=rows.filter(r=>r.status==='paid');if(!paid.length)return [];
 const keys=paid.map(r=>r.transaction_date.slice(0,7)).sort(),first=keys[0],last=keys.at(-1);
 const end=new Date(last+'-01T00:00:00Z'),start=new Date(first+'-01T00:00:00Z');
 const cutoff=new Date(end);cutoff.setUTCMonth(cutoff.getUTCMonth()-(limit-1));if(start<cutoff)start.setTime(cutoff.getTime());
 const result=[];for(const date=new Date(start);date<=end;date.setUTCMonth(date.getUTCMonth()+1)){
  const key=date.toISOString().slice(0,7),month=paid.filter(r=>r.transaction_date.startsWith(key));
  const income=month.filter(r=>r.kind==='income').reduce((s,r)=>s+Number(r.amount_pence),0),expense=month.filter(r=>r.kind==='expense').reduce((s,r)=>s+Number(r.amount_pence),0);
  result.push({key,income,expense,label:date.toLocaleDateString('en-GB',{month:'short',year:'2-digit',timeZone:'UTC'})});
 }return result;
}
