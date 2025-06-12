import { useState } from 'react'
import { useRouter } from 'next/router'
import { useSession } from '@supabase/auth-helpers-react'
import Link from 'next/link'

export default function Home() {
  const session = useSession()
  const router = useRouter()

  // Only redirect if user is already logged in
  if (session) {
    router.push('/app')
    return <div>Redirecting to dashboard...</div>
  }

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Welcome to CashCanvas</h1>
      <p>Your financial tracking application</p>
      
      <div style={{ marginTop: '2rem' }}>
        <Link href="/app">
          <button style={{ 
            padding: '1rem 2rem', 
            fontSize: '1.2rem', 
            backgroundColor: '#0070f3', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px',
            cursor: 'pointer'
          }}>
            Get Started
          </button>
        </Link>
      </div>
    </div>
  )
}