export const EXPENSES = ['Venue & facilities','Food & catering','Decorations','Sound & lighting','Performers','Printing & publicity','Equipment & transport','Insurance & licences','Volunteer reimbursements','Other expenses'];
export const INCOME = ['Ticket sales','Sponsorship','Stall fees','Donations','Other income'];
export const CATEGORIES = [...EXPENSES,...INCOME];
export const money = p => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((Number(p)||0)/100);
export function pennies(value) {
  if(!/^\d+(\.\d{1,2})?$/.test(String(value))) throw new Error('Enter an amount with no more than two decimal places.');
  const [whole,decimal='']=String(value).split('.'); const amount=Number(whole)*100+Number(decimal.padEnd(2,'0'));
  if(!Number.isSafeInteger(amount)||amount<1||amount>100000000) throw new Error('Amount must be between £0.01 and £1,000,000.');
  return amount;
}
export function summarise(rows,budgets=[]) {
  const valid=rows.filter(r=>r.status!=='rejected');
  const income=valid.filter(r=>r.kind==='income'&&r.status==='paid').reduce((s,r)=>s+Number(r.amount_pence),0);
  const expenses=valid.filter(r=>r.kind==='expense'&&['approved','paid'].includes(r.status)).reduce((s,r)=>s+Number(r.amount_pence),0);
  const paid=valid.filter(r=>r.kind==='expense'&&r.status==='paid').reduce((s,r)=>s+Number(r.amount_pence),0);
  return {income,expenses,paid,surplus:income-expenses,cash:income-paid,
    pending:valid.filter(r=>r.kind==='expense'&&r.status==='pending').reduce((s,r)=>s+Number(r.amount_pence),0),
    payable:expenses-paid,
    receivable:valid.filter(r=>r.kind==='income'&&r.status!=='paid').reduce((s,r)=>s+Number(r.amount_pence),0),
    plannedIncome:budgets.filter(b=>INCOME.includes(b.category)).reduce((s,b)=>s+Number(b.amount_pence),0),
    plannedExpenses:budgets.filter(b=>EXPENSES.includes(b.category)).reduce((s,b)=>s+Number(b.amount_pence),0)};
}
export function actualFor(rows,category){return rows.filter(r=>r.category===category&&(r.kind==='income'?r.status==='paid':['approved','paid'].includes(r.status))).reduce((s,r)=>s+Number(r.amount_pence),0);}
export function csvCell(value){let s=String(value??'');if(/^[\s]*[=+@\-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function csv(rows){return rows.map(row=>row.map(csvCell).join(',')).join('\r\n');}
