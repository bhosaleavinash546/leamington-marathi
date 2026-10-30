/* Marathi Calendar: today's Marathi date, the next festivals, the proverb and the word
   of the day. Used by the home page card (next 3 festivals) and calendar.html (all
   upcoming ones, with "Add to calendar"). The dates, proverbs and words live in
   culture-data.js. */
document.addEventListener('DOMContentLoaded', () => {
  const MR_DIGITS = '०१२३४५६७८९';
  const toMarathiDigits = n => String(n).replace(/\d/g, d => MR_DIGITS[d]);
  const MR_DAYS = ['रविवार', 'सोमवार', 'मंगळवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
  const MR_MONTHS = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर'];
  const dayMs = 86400000;
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const $ = id => document.getElementById(id);

  const kalDate = $('kal-date');
  if (kalDate) kalDate.textContent = `${MR_DAYS[now.getDay()]}, ${toMarathiDigits(now.getDate())} ${MR_MONTHS[now.getMonth()]} ${toMarathiDigits(now.getFullYear())}`;

  // one day, all day .ics file the phone or laptop calendar can open
  const icsLink = f => {
    const when = new Date(`${f.date}T00:00:00`);
    const ymd = f.date.replace(/-/g, '');
    const next = new Date(when.getTime() + dayMs);
    const ymdNext = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Leamington Marathi//EN', 'BEGIN:VEVENT',
      `UID:${ymd}-${f.title.replace(/\W+/g, '')}@leamingtonmarathi.com`,
      `DTSTAMP:${ymd}T000000Z`, `DTSTART;VALUE=DATE:${ymd}`, `DTEND;VALUE=DATE:${ymdNext}`,
      `SUMMARY:${f.title}`, 'DESCRIPTION:Leamington Marathi calendar. leamingtonmarathi.com',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.className = 'kal-add';
    a.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
    a.download = `${f.title.replace(/[^\w]+/g, '-').toLowerCase()}.ics`;
    a.textContent = '📅 Add to calendar';
    return a;
  };

  // Festival list: past dates drop off; the list's data-show says how many to show
  const list = $('kal-list');
  if (list) {
    const upcoming = (window.LM_FESTIVALS || [])
      .map(f => ({ ...f, days: Math.round((new Date(`${f.date}T00:00:00`) - todayStart) / dayMs) }))
      .filter(f => f.days >= 0)
      .slice(0, +list.dataset.show || 6);
    upcoming.forEach(f => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="kal-day marathi" lang="mr"></span><span class="kal-name"><strong class="marathi" lang="mr"></strong></span><span class="kal-actions"><span class="kal-in"></span></span>';
      li.querySelector('.kal-day').textContent = f.day;
      li.querySelector('strong').textContent = f.mr;
      li.querySelector('.kal-name').append(f.en);
      li.querySelector('.kal-in').textContent = f.days === 0 ? 'आज!' : f.days === 1 ? 'उद्या' : `${f.days} days`;
      if (list.dataset.add) li.querySelector('.kal-actions').append(document.createElement('br'), icsLink(f));
      list.appendChild(li);
    });
    const kalNext = $('kal-next');
    if (kalNext) {
      const f = upcoming[0];
      kalNext.textContent = !f ? 'New dates will be added soon.'
        : f.days === 0 ? `आज ${f.mr}!` : f.days === 1 ? `उद्या ${f.mr}` : `${f.mr} in ${f.days} days`;
    }
  }

  // Proverb and word of the day, chosen by the day of the year
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / dayMs);
  const mhani = window.LM_MHANI || [];
  const shabda = window.LM_SHABDA || [];
  if (mhani.length && $('mhan-text')) {
    const m = mhani[dayOfYear % mhani.length];
    $('mhan-text').textContent = m.m;
    $('mhan-meaning').textContent = m.a;
  }
  if (shabda.length && $('shabda-text')) {
    const s = shabda[dayOfYear % shabda.length];
    $('shabda-text').textContent = s.s;
    const meaning = $('shabda-meaning');
    meaning.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = s.r;
    meaning.append(strong, `: ${s.e}. `);
    const ex = document.createElement('span');
    ex.className = 'marathi';
    ex.lang = 'mr';
    ex.textContent = s.ex;
    meaning.appendChild(ex);
  }
});
