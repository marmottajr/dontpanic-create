'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'dontpanic.theme.v1';

/**
 * Script que corre antes da primeira pintura.
 *
 * Sem ele a página pinta no tema do sistema e salta para o escolhido quando o React
 * hidrata — um flash branco na cara de quem pediu escuro. É inline no `<head>` porque
 * qualquer coisa assíncrona chega tarde demais para evitá-lo.
 */
export const themeBootstrapScript = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t}}catch(e){}})()`;

function readTheme(): Theme {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === 'dark' || value === 'light' ? value : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  try {
    if (theme === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Sem storage o tema vale para esta navegação. A página continua legível nos dois.
  }
}

export function ThemeToggle({
  label,
  options,
}: {
  label: string;
  options: { light: string; dark: string; system: string };
}): React.ReactElement {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => setTheme(readTheme()), []);

  const choose = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
  };

  const items: { id: Theme; text: string; icon: React.ReactNode }[] = [
    { id: 'light', text: options.light, icon: <SunIcon /> },
    { id: 'dark', text: options.dark, icon: <MoonIcon /> },
    { id: 'system', text: options.system, icon: <SystemIcon /> },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-control border border-rule p-0.5"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={theme === item.id}
          aria-label={item.text}
          title={item.text}
          onClick={() => choose(item.id)}
          className={cn(
            'grid h-7 w-7 place-items-center rounded-[2px] transition-colors',
            theme === item.id ? 'bg-well text-amber' : 'text-dim hover:text-text',
          )}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}

function SunIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function MoonIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none">
      <path
        d="M13 10.2A5.6 5.6 0 0 1 6 3.2a5.6 5.6 0 1 0 7 7Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function SystemIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none">
      <rect x="2" y="3" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 13.5h4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
