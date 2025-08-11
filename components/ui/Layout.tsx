import React, { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
// @ts-ignore - local component
import ThemeToggle from './ThemeToggle';
import MobileNav from './MobileNav';
import { listUsers, getCurrentUserId, setCurrentUserId, createUser, deleteUser } from '../../lib/sqlite/init';

interface LayoutProps { children: ReactNode }

export default function Layout({ children }: LayoutProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const router = useRouter();
  const isActive = (path: string) => router.pathname === path;
  const [users, setUsers] = useState<Array<{ id: string; display_name: string }>>([]);
  const [currentUserId, setCurrent] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      try {
        const [u, cur] = await Promise.all([listUsers(), getCurrentUserId()]);
        setUsers(u as any);
        setCurrent(cur);
      } catch {}
    };
    load();
  }, []);

  const onSwitch = async (id: string) => {
    await setCurrentUserId(id);
    setCurrent(id);
    try { router.replace(router.asPath); } catch {}
    try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('cashcanvas-user-changed')); } catch {}
  };

  const onAddUser = async () => {
    const name = prompt('New user name');
    if (!name) return;
    try {
      await createUser(name);
      const [u, cur] = await Promise.all([listUsers(), getCurrentUserId()]);
      setUsers(u as any);
      setCurrent(cur);
      try { router.replace(router.asPath); } catch {}
      try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('cashcanvas-user-changed')); } catch {}
    } catch (e: any) {
      alert(e?.message || 'Failed to create user');
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm('Delete this user and all their local data?')) return;
    await deleteUser(id);
    const [u, cur] = await Promise.all([listUsers(), getCurrentUserId()]);
    setUsers(u as any);
    setCurrent(cur);
    try { router.replace(router.asPath); } catch {}
    try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('cashcanvas-user-changed')); } catch {}
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="container header-inner">
          <Link href="/" className="brand">CashCanvas</Link>
          <nav className="nav">
            <Link href="/app" className={`nav-link ${isActive('/app') ? 'active' : ''}`}>Dashboard</Link>
            <Link href="/" className={`nav-link ${isActive('/') ? 'active' : ''}`}>Home</Link>
            {mounted && <ThemeToggle />}
            {mounted && (
              <div className="nav-user" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  aria-label="Switch user"
                  value={currentUserId}
                  onChange={(e) => onSwitch(e.target.value)}
                  style={{ padding: '6px 8px', borderRadius: 8 }}
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.display_name || u.id}</option>
                  ))}
                </select>
                <button className="btn ghost" onClick={onAddUser}>Add</button>
                {users.length > 1 && (
                  <button className="btn ghost" onClick={() => onDelete(currentUserId)}>Delete</button>
                )}
              </div>
            )}
          </nav>
        </div>
      </header>
      <main className="container main-area">
        {children}
      </main>
      <footer className="app-footer">
        <div className="container">
          <span className="muted">© {new Date().getFullYear()} CashCanvas</span>
        </div>
      </footer>
      <MobileNav />
    </div>
  );
}


