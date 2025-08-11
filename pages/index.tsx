import { useRouter } from 'next/router'
import { useSession } from '@supabase/auth-helpers-react'
import Link from 'next/link'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'

export default function Home() {
  const session = useSession()
  const router = useRouter()

  // Only redirect if user is already logged in
  if (session) {
    router.push('/app')
    return <div>Redirecting to dashboard...</div>
  }

  return (
    <div className="grid" style={{ gap: 28 }}>
      <section className="hero">
        <div>
          <h1>Welcome to CashCanvas</h1>
          <p>Your elegant, local-first money manager. Import, categorize, and visualize your finances with privacy.</p>
          <div className="cta">
            <Link href="/app"><Button>Get Started</Button></Link>
            <Link href="https://github.com/manmohan659/CashCanvas" target="_blank" rel="noreferrer">
              <Button variant="secondary">GitHub</Button>
            </Link>
          </div>
        </div>
        <div className="hero-visual" />
      </section>
      <section>
        <h3 className="section-title">Why CashCanvas?</h3>
        <div className="grid cols-3">
          <Card title="Local-first" right={<span className="muted">Private</span>}>
            Your data lives in your browser with SQLite (sql.js). Export/backup anytime.
          </Card>
          <Card title="Effortless import" right={<span className="muted">CSV/OFX</span>}>
            Drag & drop bank exports, map columns, and see insights instantly.
          </Card>
          <Card title="Flexible rules" right={<span className="muted">Regex</span>}>
            Create powerful categorization rules and re-apply in one click.
          </Card>
        </div>
      </section>
    </div>
  )
}