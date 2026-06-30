'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/** Optional light/dark toggle. Light is the default; the choice is persisted. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const saved = (localStorage.getItem('theme') as Theme | null) ?? 'light';
    setTheme(saved);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }

  return (
    <button className="btn ghost sm theme-toggle" onClick={toggle} aria-label="Theme wechseln" title="Hell / Dunkel">
      {theme === 'dark' ? '☀ Hell' : '🌙 Dunkel'}
    </button>
  );
}
