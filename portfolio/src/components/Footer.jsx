import { profile } from '../data.js'

export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <span className="text-soft">
          © {year} {profile.name}
        </span>
        <span className="text-soft footer-mid">
          Value &amp; Cost Engineering · AI Cost Intelligence
        </span>
        <a href="#top" className="footer-top">
          Back to top ↑
        </a>
      </div>
    </footer>
  )
}
