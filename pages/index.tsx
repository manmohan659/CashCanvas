import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>CashCanvas</h1>
      <p><Link href="/app">Go to app</Link></p>
    </main>
  );
}
