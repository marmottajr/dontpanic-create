'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'dontpanic.theme.v1';

/**
 * Script que corre antes da primeira pintura.
 *
 * Sem ele a página pinta no tema do sistema e salta para o escolhido quando o React
 * hidrata — um flash na cara de quem pediu claro. É inline no começo do `<body>` porque
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
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;

  try {
    if (theme === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Sem storage o tema vale para esta navegação. A página é legível nos dois.
  }
}

/**
 * Alternador de tema com rótulo textual, não ícone.
 *
 * Um sol e uma lua exigem que a pessoa adivinhe se o ícone mostra o estado atual ou o
 * que o clique vai fazer — a ambiguidade clássica desse controle. A palavra resolve:
 * o botão diz em que tema a página está, e clicar avança para o próximo.
 *
 * Três estados, não dois: "sistema" é o default, e tirá-lo obrigaria a escolher um tema
 * para quem já escolheu no sistema operacional.
 */
export function ThemeToggle({
  label,
  options,
}: {
  label: string;
  options: { light: string; dark: string; system: string };
}): React.ReactElement {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  const order: Theme[] = ['system', 'light', 'dark'];
  const text = { system: options.system, light: options.light, dark: options.dark }[theme];

  return (
    <button
      type="button"
      aria-label={`${label}: ${text}`}
      onClick={() => {
        const next = order[(order.indexOf(theme) + 1) % order.length] as Theme;
        setTheme(next);
        applyTheme(next);
      }}
      className="label whitespace-nowrap rounded-1 border border-rule px-2.5 py-2 text-dim hover:border-dim/60 hover:text-ink"
    >
      {/* Antes de hidratar não há como saber o tema salvo: mostrar um palpite faria o
          rótulo trocar sozinho na frente da pessoa. O espaço reservado evita o salto. */}
      <span className={mounted ? undefined : 'opacity-0'}>{text}</span>
    </button>
  );
}
