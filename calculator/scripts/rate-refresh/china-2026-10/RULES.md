# China rate book research — rules (10 Oct 2026)

Goal: China's OWN rates for CostVision, effective **October 2026**. The basis is an average of the four main automotive
supplier clusters:

- **Yangtze River Delta** (Shanghai / Suzhou / Ningbo);
- **Pearl River Delta** (Guangzhou / Shenzhen / Foshan / Dongguan);
- **Chongqing**;
- **Wuhan**.

The working pattern is **two 12-hour shifts** (the common Chinese plant pattern). The current China book
(`current-china-book.json`, in CNY) is the UK book × a few factors. A Director found it not updated and not correct.
Accuracy is the only goal.

**Never invent a number.** Every figure needs:
- a URL;
- the date it applies to (or the page's publish date);
- what it is: list price / transaction / exchange settlement / survey / regulator notice / company annual report.

"Not found in any source" is a correct answer. If you derive a figure (e.g. a loaded hourly cost from a monthly wage,
or an average selling price = segment revenue ÷ units), show the arithmetic.

Prefer, in this order:
1. Government / regulator: NBS 国家统计局, provincial human-resources bureaus (最低工资, 社保缴费基数), NDRC / provincial
   DRC electricity and gas price notices (电价表, 天然气价格), State Grid / China Southern Grid agency purchase price
   tables (代理购电价格), PBoC LPR, customs.
2. Exchanges and price agencies: SHFE, Changjiang Nonferrous 长江有色, SMM 上海有色网, Mysteel 我的钢铁网, Lange Steel
   兰格, 卓创 SCI, 隆众 OilChem, 生意社 SunSirs, 百川盈孚 Baiinfo.
3. Producer price lists / company annual reports: Baosteel 宝钢 monthly price, Haitian 海天, LK 力劲, Yizumi 伊之密,
   Haitian Precision 海天精工, 纽威数控, 创世纪, 科德数控, Han's Laser 大族, Yangli 扬力, Jushi 巨石.
4. Salary surveys and recruiters: 智联招聘 Zhaopin, 前程无忧 51job, BOSS直聘, 职友集 jobui, 看准 kanzhun, Mercer /
   Michael Page China salary guides.
5. Trade press.

Never use a B2B listing (1688 / Made-in-China / Alibaba) as a PRICE. At most it is a cross-check, and you say so.

Money in CNY. State whether a price includes 13% VAT; we need it **ex-VAT**, delivered to a plant in the cluster.
Use 2026 figures where they exist; older ones only with a stated reason.

Output: a JSON file in `research/` (name given in your task) with
`{ "domain", "researched": "2026-10-10", "items": [ { "key", "value", "unit", "basis", "source": "<URL>", "date", "notes" } ], "notes": [] }`.
Where asked, add derived figures with their arithmetic in `basis`. Write that file and change nothing else.

The web-search budget is shared by five researchers working at once: use **at most 35 searches**, and stop when the
key figures are found. Reply with ONE short paragraph:
- what you found;
- what you could not find;
- any figure in the current book you are confident is wrong (current v evidence).
