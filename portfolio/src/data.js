// ---------------------------------------------------------------------------
// All portfolio content lives here. Edit this file to update the site — the
// components read everything from these exports.
// Source: Avinash Bhosale LinkedIn profile.
// ---------------------------------------------------------------------------
import headshot from './assets/headshot.jpg'
import series1 from './assets/series-1.jpg'
import series2 from './assets/series-2.jpg'
import series3 from './assets/series-3.jpg'
import series4 from './assets/series-4.jpg'
import certVma from './assets/certificate-vma.jpg'
import recDilipSarode from './assets/avatars/dilip-sarode.jpg'
import recAbhishekHazra from './assets/avatars/abhishek-hazra.jpg'
import recAkhilDesai from './assets/avatars/akhil-desai.jpg'
import recDilipGowaikar from './assets/avatars/dilip-gowaikar.jpg'

// To use a real headshot: drop the file in src/assets/ and set
//   import photo from './assets/headshot.jpg'
// at the top of this file, then set `photo: photo` below. Leave the string
// empty to fall back to the "AB" monogram.
export const profile = {
  name: 'Avinash Bhosale',
  initials: 'AB',
  photo: headshot,
  title: 'Senior Cost Improvement Engineer — Propulsion',
  tagline:
    'AI-Driven Value Engineering & Cost Intelligence · Benchmarking · Should Costing',
  location: 'Warwick, England, United Kingdom',
  email: 'bhosale.avinash546@gmail.com',
  linkedin: 'https://www.linkedin.com/in/avinash-bhosale-671bbb80',
  currentCompany: 'JLR',
  intro:
    'A Value & Cost Engineering professional building AI-powered cost intelligence solutions for the automotive industry.',
  about: [
    'I specialise in Value Engineering, Product Cost Optimization, Should Costing, and Competitive Benchmarking within the automotive industry. Over the past decade I have helped organisations improve product value and reduce cost through engineering-led decision making.',
    'More recently I have been applying Artificial Intelligence to transform how cost engineering, benchmarking, and should-cost analysis are performed — developing AI-powered platforms and agents that turn engineering data (images, CAD models, technical drawings, PCB layouts, quotations, cost data) into actionable insight at scale.',
    'I strongly believe that most cost problems are actually value problems. Effective cost optimization is not about cheapening a product; it is about maximising the function delivered per unit cost.',
  ],
  quote:
    'Most cost problems are actually value problems. It is not about cheapening a product — it is about maximising function delivered per unit cost.',
}

export const stats = [
  { value: 13, suffix: '+', label: 'Years in Value & Cost Engineering' },
  { value: 3, suffix: '', label: 'AI cost-intelligence platforms built' },
  { value: 4, suffix: '', label: 'Global automotive employers' },
  { value: 60, suffix: 's', label: 'Should-cost estimate turnaround' },
]

// Real tenure per organization (years) — used by the Experience chart.
export const experienceChart = [
  { org: 'Tata Technologies', years: 9.0 },
  { org: 'John Deere', years: 1.7 },
  { org: 'JLR', years: 3.6 },
]

// Self-assessed core competencies (0–100) — used by the radar chart.
export const competencies = [
  { area: 'Value Engineering', level: 95 },
  { area: 'Should Costing', level: 92 },
  { area: 'Benchmarking', level: 90 },
  { area: 'AI / Automation', level: 85 },
  { area: 'Product Design', level: 80 },
  { area: 'Project Mgmt', level: 82 },
]

export const experience = [
  {
    role: 'Senior Cost Improvement Engineer — Propulsion',
    company: 'JLR',
    location: 'Gaydon, UK',
    period: 'Oct 2025 — Present',
    focus:
      'Propulsion commodity cost optimisation & value engineering — EDU (e-Machine) and power transmission systems.',
    points: [
      'Driving strategic cost reduction across ICE, MHEV, PHEV & BEV propulsion systems through competitive benchmarking, supplier collaboration, and advanced value engineering.',
      'Interpreting supplier quotations and should-cost models to identify cost drivers, uncover inefficiencies, and unlock value opportunities.',
      'Recommending optimal design-for-value solutions using global competitor insight and manufacturing excellence.',
      'Leading cross-functional VA/VE workshops and delivering data-driven reports to senior engineering leadership.',
    ],
  },
  {
    role: 'Senior Value Engineer',
    company: 'JLR',
    location: 'Gaydon, UK',
    period: 'Feb 2023 — Oct 2025',
    focus:
      'Chassis commodity cost optimisation & value engineering — air suspension, axles, brakes, steering, wheels & tyres.',
    points: [
      'Led cost-reduction initiatives across chassis systems through competitive benchmarking, value engineering, and supplier collaboration.',
      'Reviewed supplier quotes and should-cost models to identify high-cost drivers, gaps, and optimisation opportunities.',
      'Suggested best-cost designs using global competitor analysis and manufacturing best practice.',
      'Presented cost optimisation & benchmarking reports to engineering senior management.',
    ],
  },
  {
    role: 'Senior Engineer',
    company: 'John Deere',
    location: 'Pune, India',
    period: 'Jul 2021 — Feb 2023',
    focus:
      'Multi-million-dollar cost optimization across the construction-equipment portfolio via benchmarking and design-to-cost.',
    points: [
      'Ran idea-generation workshops with cross-functional Design, Manufacturing, Supply Chain, Sourcing, Quality & Marketing teams.',
      'Evaluated VAVE ideas using feasibility ranking, weighted evaluation, and paired-comparison methods.',
      'Analysed BoM data with Pareto charts and cost heat maps to pinpoint major cost contributors and outliers.',
      'Owned business-case preparation, ROI calculation, fact-based should-cost negotiations, and Agile project tracking.',
    ],
  },
  {
    role: 'Senior Design Engineer',
    company: 'Tata Technologies',
    location: 'Pune, India',
    period: 'Aug 2019 — Jun 2021',
    focus:
      'VAVE, competitive teardown & benchmarking, product design and should-costing.',
    points: [
      'Delivered VAVE and cost-reduction programmes backed by strong analytical rigour.',
      'Performed competitive teardown & benchmarking and applied should-costing awareness.',
      'Product design across manufacturing processes with end-to-end project management.',
    ],
  },
  {
    role: 'Design Engineer',
    company: 'Tata Technologies',
    location: 'Pune, India',
    period: 'Jul 2012 — Jun 2019',
    focus: 'Foundation years in mechanical design engineering.',
    points: [
      'Nine years at Tata Technologies growing from Design Engineer into senior value & cost engineering roles.',
    ],
  },
]

export const projects = [
  {
    name: 'BrainSpark',
    kind: 'AI Value Engineering Platform',
    description:
      'Identifies cost-reduction and value-improvement opportunities across complete vehicle systems, while providing rapid directional should-cost assessments.',
    tags: ['Value Engineering', 'Ideation', 'Should Cost'],
  },
  {
    name: 'CostLens',
    kind: 'AI Cost Intelligence Platform',
    description:
      'Analyses supplier quotations, highlights cost gaps, and surfaces optimisation opportunities to support sourcing and benchmarking decisions.',
    tags: ['Quotation Analysis', 'Benchmarking', 'Sourcing'],
  },
  {
    name: 'CostVision',
    kind: 'AI Should-Costing Platform',
    description:
      'Generates cost estimates directly from images, CAD models, technical drawings, and PCB layouts — combining live material market data, country-specific manufacturing rates, and multiple AI agents to deliver should-cost estimates in under 60 seconds.',
    tags: ['Computer Vision', 'Multi-Agent', 'Live Market Data'],
  },
]

export const skillGroups = [
  {
    title: 'Value & Cost Engineering',
    items: ['Value Engineering (VAVE)', 'Should Costing', 'Product Cost Optimization', 'Competitive Benchmarking', 'Design-to-Cost'],
  },
  {
    title: 'Domains',
    items: ['Propulsion Systems', 'Electric Vehicles', 'Chassis Systems', 'Construction Equipment'],
  },
  {
    title: 'AI & Analysis',
    items: ['AI-Powered Cost Intelligence', 'Multi-Agent Systems', 'BoM & Pareto Analysis', 'Cost Heat Maps', 'Ideation / TRIZ'],
  },
  {
    title: 'Delivery',
    items: ['Cross-Functional Leadership', 'Project Management (Agile)', 'Executive Reporting', 'Supplier Negotiation'],
  },
]

export const certifications = [
  'Professional Value Analyst (PVA)',
  'SAVE International — Value Methodology Associate (VMA)',
  'TRIZ Certified — Innovative Problem Solving',
]

export const awards = [
  'Best Employee of the Quarter — 2017',
  'Best Project Team of the Quarter — 2017',
  'Best Project Team of the Quarter — 2015',
  'Champion of the Month — 2014',
  'Certificate of Appreciation — 2015–16',
]

export const education = [
  {
    school: 'I.S.B. & M School of Technology, Pune',
    degree: "Bachelor's Degree, Mechanical Engineering",
    period: '2013 — 2015',
  },
  {
    school: 'Government Polytechnic College',
    degree: 'Diploma, Mechanical Engineering',
    period: '2009 — 2012',
  },
]

// LinkedIn "Value Engineering" series + certification — shown in the sliding gallery.
export const insights = [
  {
    src: series1,
    title: 'Where real money is left on the table',
    tag: 'Series 1 of 4',
    href: 'https://www.linkedin.com/posts/avinash-bhosale-671bbb80_automotive-valueengineering-npi-activity-7463219991736270849-AI9W',
  },
  {
    src: series2,
    title: 'Cost savings hiding in your product',
    tag: 'Series 2 of 4',
    href: 'https://www.linkedin.com/posts/avinash-bhosale-671bbb80_valueengineering-costengineering-automotive-activity-7464209607738060800-QOrE',
  },
  {
    src: series3,
    title: 'Value engineering is a mindset',
    tag: 'Series 3 of 4',
    href: 'https://www.linkedin.com/posts/avinash-bhosale-671bbb80_valueengineering-engineeringculture-automotive-activity-7466712378793971713-qxHb',
  },
  {
    src: series4,
    title: 'Margin gets engineered in',
    tag: 'Series 4 of 4',
    href: 'https://www.linkedin.com/posts/avinash-bhosale-671bbb80_valueengineering-automotive-costengineering-activity-7468657282910859264-we6_',
  },
  { src: certVma, title: 'SAVE International — Value Methodology Associate', tag: 'Certification' },
]

// LinkedIn recommendations.
export const recommendations = [
  {
    name: 'Dilip Sarode',
    initials: 'DS',
    photo: recDilipSarode,
    role: 'Deputy General Manager, TAL Manufacturing Solutions',
    relation: 'Senior to Avinash · Tata Technologies',
    quote:
      'Avinash is a person with strong ownership and striving for results all the time. Creative, energetic, solutions-oriented, highly committed and motivated, with good interpersonal skills. He is an asset to any company.',
  },
  {
    name: 'Dilip Gowaikar',
    initials: 'DG',
    photo: recDilipGowaikar,
    role: 'Value Engineering Consultant',
    relation: "Avinash's mentor",
    quote:
      'Avinash is a very enthusiastic personality and grasped knowledge of Value Methodology very well. I am really very glad to recommend him for VAVE competency for any assignment.',
  },
  {
    name: 'Bharath Kumar S T',
    initials: 'BK',
    role: 'Senior Leader, Techno-Commercial, Manufacturing Industry',
    relation: 'Worked on the same team',
    quote:
      'I have worked with Avinash for Value Engineering projects on steel-industry equipment. He has good knowledge and experience in setting up and applying the Value Engineering process — a hard-working, focused individual and a quick learner, ready to take calculated risks.',
  },
  {
    name: 'Abhishek Hazra',
    initials: 'AH',
    photo: recAbhishekHazra,
    role: 'GM China & Associate VP SEA, Tata Technologies',
    relation: 'Worked on the same team',
    quote:
      'Avinash has been an avid explorer of technology. Closely associated in customer-success projects, he has been a true doer even in the most challenging environments across global customers. Keep the inquisitiveness high — it will take you places.',
  },
  {
    name: 'Akhil Desai',
    initials: 'AD',
    photo: recAkhilDesai,
    role: 'Sr. Technical Lead — Engineering ER&D, Tata Technologies',
    relation: 'Worked on the same team',
    quote:
      'Worked with Avinash on a couple of projects — he is good technically, good in presentation, and has good knowledge of managing the customer as well as the internal team.',
  },
]

export const nav = [
  { id: 'about', label: 'About' },
  { id: 'experience', label: 'Experience' },
  { id: 'expertise', label: 'Expertise' },
  { id: 'projects', label: 'Projects' },
  { id: 'insights', label: 'Insights' },
  { id: 'praise', label: 'Praise' },
  { id: 'contact', label: 'Contact' },
]
