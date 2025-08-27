import React from 'react';
import Link from 'next/link';

export default function MobileNav() {
  return (
    <nav className="mobile-nav">
      <Link href="/app" className="mobile-link">Dashboard</Link>
      <Link href="/app/split" className="mobile-link">Split</Link>
      <Link href="/" className="mobile-link">Home</Link>
    </nav>
  );
}


