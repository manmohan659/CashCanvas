import React, { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'light';
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('cc_theme', theme); } catch {}
  }, [theme]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('cc_theme') as 'light' | 'dark' | null;
      if (stored) setTheme(stored);
    } catch {}
  }, []);

  const toggle = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  return (
    <button className="toggle" onClick={toggle} aria-label="Toggle theme">
      <span className="toggle-inner" />
    </button>
  );
}


