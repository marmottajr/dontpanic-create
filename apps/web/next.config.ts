import type { NextConfig } from 'next';

/**
 * Export estático, por decisão de arquitetura: o site não gera código, só monta uma
 * string de comando (ver docs/ARCHITECTURE.md — "o site é burro, o CLI é a verdade").
 * Sem servidor não existe estado que possa divergir do CLI, e a página cabe atrás de
 * qualquer CDN.
 */
const nextConfig: NextConfig = {
  output: 'export',
  // `output: 'export'` não passa por otimizador de imagem em runtime; declarar aqui
  // evita o erro de build no primeiro <Image> que alguém adicionar depois.
  images: { unoptimized: true },
  // URLs com barra final geram `pasta/index.html`, que é o que hospedagem estática
  // serve sem regra de rewrite.
  trailingSlash: true,
  reactStrictMode: true,
  /**
   * O Next 16 escreve um `AGENTS.md` e um `CLAUDE.md` dentro de `apps/web` na primeira
   * build. Aqui isso é ruído: as instruções deste repo vivem na raiz e em `docs/`, e um
   * arquivo gerado com o mesmo nome competiria com elas — um agente leria o resumo
   * automático do Next em vez dos ADRs.
   */
  agentRules: false,
};

export default nextConfig;
