import { motion, useScroll, useSpring } from 'framer-motion'
import Nav from './components/Nav.jsx'
import Hero from './components/Hero.jsx'
import About from './components/About.jsx'
import Experience from './components/Experience.jsx'
import Expertise from './components/Expertise.jsx'
import Projects from './components/Projects.jsx'
import Contact from './components/Contact.jsx'
import Footer from './components/Footer.jsx'

export default function App() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 })

  return (
    <>
      <a className="skip-link" href="#about">
        Skip to content
      </a>
      <motion.div className="scroll-progress" style={{ scaleX }} />
      <Nav />
      <main>
        <Hero />
        <About />
        <Experience />
        <Expertise />
        <Projects />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
