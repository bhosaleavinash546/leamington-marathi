# Camera board cost evidence (October 2026)

**The part:** an automotive 360° surround-view camera PCBA. It is 20 × 20 mm, 8-layer FR4, with 80 components on both sides. It is built in China at 250,000 a year and delivered to the UK. The supplier quotes £17.00 per board delivered.

**How the evidence was gathered:** 28 WebSearch calls on 2026-10-06, with every source accessed that day. WebFetch was blocked, and so was a direct call to the gov.uk Trade Tariff API (the proxy returned 403). That means **every figure below is taken from the search engine's snippet or summary of the page, not from a full reading of it.** Treat each one as "the source appears to state". Check it on the page before it goes into a cost model. Where this file infers or calculates something, it says so.

## A. Automotive CMOS image sensor prices at volume

- **1–2 MP automotive CIS at volume: US$3–8 per sensor. 8 MP: above US$10.** These are Chinese sell-side and industry estimates, not company disclosures. Sources: Tencent News industry piece "产研：车载摄像头传感器——CIS芯片（一）" (2025-05-30), https://news.qq.com/rain/a/20250530A02BC200, and the cls.cn article "价量同步提升的车用CIS", https://www.cls.cn/detail/917687. The search summary gives the figure as "单颗100万-200万像素CIS芯片的量产价格在3-8美金左右，单颗800万像素CIS芯片的量产价格在10美金以上". It is the only resolution-split volume price found. I could not pin which of the two pages carries it, so check both.
- **Yole: the ASP for all CIS (every market) "stabilized well over $3"**, held up by premium mobile and automotive parts. Source: Yole "Status of the CMOS Image Sensor Industry 2025", summarised by the Edge AI and Vision Alliance (2025-07), https://www.edge-ai-vision.com/2025/07/cmos-image-sensor-market-to-reach-more-than-30b-by-2030-driven-by-mobile-automotive-and-security-applications/ and https://www.yolegroup.com/product/report/status-of-the-cmos-image-sensor-industry-2025/. This covers all markets, not automotive alone.
- **Yole on the automotive market:** camera-module revenue was about US$6B in 2024 and is forecast at US$8.7B by 2030 (6.6% CAGR). Image-sensor units are forecast above 400M by 2030 (8.1% CAGR). Yole also says the blended ASP is "eroding on commodity tiers while high-resolution ADAS silicon holds firmer". Source: https://www.yolegroup.com/press-release/automotive-imaging-market-surges-toward-8-7-billion-milestone/ and https://www.edge-ai-vision.com/2025/07/automotive-imaging-market-surges-toward-8-7b-milestone/. *Inference, not stated:* the report's 2024 automotive image-sensor revenue divided by its units would give an automotive ASP, but neither number appeared in the snippets.
- **onsemi, 2023 investor material: "8MP ramping with ~2.5x ASP uplift"** compared with lower-resolution parts. This is a ratio, not a dollar figure. Source: onsemi investor presentation, https://investor.onsemi.com/static-files/129b7851-50a9-467f-bf29-1864b8c5c789 (2023). The Q2-2026 call gives Intelligent Sensing Group revenue of US$229M but no ASP: https://www.fool.com/earnings/call-transcripts/2026/08/11/on-semiconductor-on-q2-2026-earnings-call-transcript/
- **TechInsights:** onsemi held more than 40% of the automotive image-sensor market in 2023. The snippet gave no ASP. Source: https://www.techinsights.com/blog/automotive-image-sensor-market-share-2023-onsemi-leads-over-40-share
- **"8MP automotive ADAS cameras have an average selling price of USD 101 per unit."** This is for the whole **camera**, not the sensor. It comes from a press-release aggregator of unclear provenance, so it is low confidence. Source: openPR, https://www.openpr.com/news/4505992/the-usd-4-84-billion-automotive-imaging-revolution-why-8mp-adas
- **Share of the module cost:** "the image sensor is typically ... 50% to 70% of the total cost" of a camera module. This is a camera-module vendor's blog, not a teardown. Source: Sincere Information Technology, https://www.cameramodule.com/info/what-is-the-cost-of-a-camera-module-a-deep-di-103434916.html
- **Will Semi (OmniVision):** it overtook onsemi on automotive CIS shipments in 2023, mostly in mid- and low-end parts. It launched the 8 MP OX08D10 in September 2023. The search summary credits this to sell-side reports, for example the Soochow Securities (东吴证券) Will Semi deep-dive, https://file.iyanbao.com/pdf/da5a2-b1af9328-5b3c-47bd-bc6d-d7a7d0e66ca4.pdf. No ASP was disclosed in the snippet.
- **Contract or volume quotes for OX01F10, OX03C10, AR0147AT, AR0233AT, IMX390 and ISX031:** none found. Octopart shows the OX03C10-EXAL-BA0C at US$500, but that is a prototyping **module**, not the sensor, so it is irrelevant: https://octopart.com/part/omnivision-technologies/OX03C10-EXAL-BA0C

## B. Identifying the sensor from its package (about 9.5 × 7.5 mm, window about 5.9 × 4.4 mm)

| Sensor | Package (as the source states) | Source | Match to 9.5 × 7.5? |
|---|---|---|---|
| OmniVision OX03C10 | a-CSP, **6.862 × 4.936 mm** | OX03C10 preliminary spec, a-CSP v1.1 (hosted on TI E2E China), https://e2echina.ti.com/cfs-file/__key/communityserver-discussions-components-files/135/OX03C10_2D00_Preliminary_2D00_Specification_2D00_a_2D00_CSP_5F00_Version_2D00_1_2D00_1_5F00_WT.pdf | No. Too small. |
| OmniVision OX03F10 | 74-pin a-CSP, **6.9016 × 5.7496 mm** | OX03F10 preliminary spec, a-CSP v1.12 (TI E2E), https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/791/OX03F10_2D00_Preliminary_2D00_Specification_2D00_a_2D00_CSP_5F00_Version_2D00_1_2D00_12_5F00_Waching_2800_1_2900_.pdf | No |
| OmniVision OX01E20 | 74-pin a-CSP. Size not in the snippet. | https://www.ovt.com/products/ox01e20/, product brief https://www.omnivision-group.com/files/pd/file/OX01E20-PB-v1.0-WEB.pdf | Unknown |
| OmniVision OX01F10 | a-CSP, 1/3.55", 3.0 µm. Size not found. | https://www.ovt.com/products/ox01f10/ | Unknown. Probably a-CSP-sized (about 5–7 mm), which is *inference*. |
| onsemi AR0147AT | iBGA: **9 × 9 mm 80-ball** and **8 × 7 mm 89-ball**, 1.5 mm high | AR0147AT datasheet (Mouser copy), https://www.mouser.com/datasheet/2/308/onsm_s_a0009667897_1-2280016.pdf | Close-ish, not a match |
| onsemi AR0233AT | iBGA80, case 503BT. Datasheet outline says "TBD". | https://static6.arrow.com/aropdfconversion/a99e3d7a59a92b4c0836fbe673234ca42da60a34/ar0233at-d.pdf | Unknown |
| onsemi AR0220AT | iBGA87, **12 × 9 mm** | AR0220 datasheet Rev 2, https://www.mouser.com/datasheet/2/308/AR0220-D-1381938.pdf | No |
| Sony IMX490 | 124-pin plastic BGA, **15.35 × 11.68 mm** | Sony IMX490 flyer, https://www.sony-semicon.com/files/62/pdf/p-15_IMX490.pdf | No |
| Sony IMX390 | The search summary gave "124-pin plastic BGA, 15.35 × 11.68 mm", but only the IMX490 flyer was in the results. **Unverified, possibly carried over from the IMX490.** | (no IMX390 primary found) | Probably no |
| Sony ISX031 | Package size not found. Active area **5.81 × 4.66 mm** (7.45 mm diagonal), 3.0 µm, 1937 × 1553. | Commonlands, https://commonlands.com/pages/image-sensors/isx031?page=4 | Unknown |

- **No sensor checked has a package that matches 9.5 × 7.5 mm.**
- *Inference only:* active areas worked out from pixel count × pitch are AR0147AT about 4.0 × 2.9 mm, IMX390 about 5.8 × 3.2 mm, OX03C10 about 5.8 × 3.8 mm and AR0233AT about 6.1 × 3.8 mm. ISX031's stated active area is 5.81 × 4.66 mm. A 5.9 × 4.4 mm window is closest in aspect and size to the **ISX031**, with the OX03C10 next. A window measured on a photo sits a little larger than the pixel array, so this is a hint, not an identification. The 9.5 × 7.5 package size of the ISX031 is unconfirmed.

## C. UK import duty (China to UK)

- **Candidate code:** heading 8529, "Parts suitable for use solely or principally with the apparatus of headings 8524 to 8528", subheading 8529 90 (other) → **8529 90 92 00**. This 10-digit code exists. A Tariff Stop Press notice says several older codes were absorbed into it on 2023-06-30. Sources: https://www.trade-tariff.service.gov.uk/headings/8529 and https://trade-tariff.service.gov.uk/news/stories/changestocommoditycodesinchapters2385and90tariffstoppressnotice22
- **Duty rate: NOT established.** The search summary of the 8529 heading page said "third country duty is 20%". That is almost certainly **VAT (20%)** misread as duty, so it must not be used. A direct call to the Trade Tariff API (`/api/commodities/8529909200`) was blocked by this environment's proxy. **Action:** read the rate at https://www.trade-tariff.service.gov.uk/commodities/8529909200?country=CN before costing.
- Other candidates were not resolved: 8525 89 00 00 (a complete camera, page https://www.trade-tariff.service.gov.uk/commodities/8525890000), 8708 99 (motor-vehicle parts) and 8543 90. The HMRC classification guide is https://www.gov.uk/guidance/classifying-electrical-equipment-for-import-and-export. *Inference:* a populated board that is not yet a camera generally goes to 8529 90 as a part of 8525 apparatus, not to 8708. Section XVI Note 2 sends parts of chapter-85 apparatus to their own heading before chapter 87. Confirm this with a classification ruling.
- **Anti-dumping:** not checked within the budget. No anti-dumping or countervailing measure was found or ruled out.

## D. Texas Instruments prices

The search summaries do not always say which quantity break a ti.com price belongs to. Where they don't, the table says so.

| Part | Price | Source | Note |
|---|---|---|---|
| DS90UB935-Q1 | **US$3.707** (DS90UB935TRHBRQ1, large reel). **US$4.448** (DS90UB935TRHBTQ1, small reel). | ti.com product page, https://www.ti.com/product/DS90UB935-Q1 | Manufacturer price. Quantity break not stated in the snippet; ti.com normally shows 1ku. Arrow: US$4.219 at 1,000 (TRHBTQ1), which is a **distributor** price. |
| LM53600-Q1 | **US$2.78** at 1k / reel of 3,000 (LM53600AQDSXRQ1) | Mouser, https://www.mouser.com/ProductDetail/Texas-Instruments/LM53600AQDSXRQ1?qs=8%2FmU9qzJpL80JMwTt3AZOw%3D%3D | **Distributor, not TI list.** ABR Micro shows US$1.977 (broker, low trust). The TI page https://www.ti.com/product/LM53600-Q1/part-details/LM53600LQDSXRQ1 was found, but no price was shown. |
| TPS62422-Q1 | **US$1.061** (TPS62422QDRCRQ1) | ti.com, https://www.ti.com/product/TPS62422-Q1 | Manufacturer price. Quantity break not stated in the snippet. |
| TLV702-Q1 | **US$0.266** (TLV70225QDSERQ1) | ti.com, https://www.ti.com/product/TLV702-Q1/part-details/TLV70225QDSERQ1 | Manufacturer price. Quantity break not stated. For comparison, the commercial TLV70225DSER is listed at **US$0.333 at 1ku**. |
| BQ24025 | not found | — | — |

## E. China volume benchmarks

- **SMT placement price per point:** about **0.008–0.02 CNY per point** in general. Small batches run about 0.02–0.05, medium batches about 0.01–0.018, and high volume **as low as 0.008 CNY per point or lower**. Parts 0402 and larger cost **0.008–0.015 CNY per point**. 0201, BGA and QFN rise to about **0.03 CNY per point**. Extras are charged on top: line set-up / first article, stencil (100–300 CNY a set), paste and test. Sources are Shenzhen EMS vendor pages, so they are vendor statements. They include 宏力捷 / Greattong "SMT贴片加工多少钱一个点？2025最新报价与成本分析", http://www.greattong.com/archives/view-2666-1.html; 领智电路, http://www.lzdlpcb.com/cjwt/612.html; 捷创电子, https://www.jc-pcba.com/Infodetial/8021.html; 快发智造, https://www.kfpcba.com.cn/womendeboke/483.html; and 1943科技 (2025 price list), https://www.sz1942.com/show-80-2298-1.html. The summary did not say which page states which band. Note that a "point" (点) is usually counted per pad or pin pair (a 2-terminal chip = 1 point, an IC = pins ÷ 2). That convention is **not confirmed** from these snippets.
- **EMS conversion cost benchmark:** none found beyond the per-point pricing above.
- **8-layer FR4 PCB:** about **1,800 CNY per m²** with processing. The source page is one of the Chinese PCB pricing explainers in the results and was not pinned down. The candidates are Zhihu https://zhuanlan.zhihu.com/p/494954763 and https://zhuanlan.zhihu.com/p/21350868, and the eet-china cost formula page https://www.eet-china.com/tools/3.html. The date is unknown and probably older, so check it. The same results say volume (≥100 m²) earns 30–50% off small-batch prices, and immersion gold adds about 100 CNY per m².
- **Reference point for lower layer counts:** JLC (嘉立创) price cut: 2-layer **298 CNY per m²**, 4-layer **480 CNY per m²**. These are prototype / small-batch platform prices. Source: https://www.jlc.com/portal/q7i36149.html (date not captured).

## What could not be found

- A volume price for a named sensor (OX01F10, OX03C10, AR0147AT, AR0233AT, IMX390, ISX031). No EMS or OEM contract quote is public.
- Dollar ASPs for automotive CIS by resolution from Yole, TechInsights, Counterpoint, Omdia or S&P. Their snippets give market size and trends only. The only resolution split found (US$3–8 for 1–2 MP, more than US$10 for 8 MP) comes from Chinese industry and broker articles.
- Teardown BOM estimates (A2Mac1, System Plus, TechInsights) for a surround-view camera module.
- Package sizes for OX01F10, OX01E20, AR0233AT (datasheet says "TBD"), ISX031 and a verified IMX390. No candidate checked is 9.5 × 7.5 mm.
- The UK Global Tariff duty rate for 8529 90 92 00, or any alternative code, and the anti-dumping status. The gov.uk API was blocked, and the only snippet figure (20%) looks like VAT.
- TI list prices for BQ24025 and LM53600-Q1 (only a distributor price was found), and confirmation of the quantity break for the ti.com figures.
- A dated, attributable 2025–26 price per m² for 8-layer volume PCB in China, and EMS conversion cost per board or per hour.
