/**
 * Nomes próprios e valores medidos — nada aqui se traduz.
 *
 * Os números vêm do repo `marmottajr/dontpanic` no commit que o template sincroniza;
 * a contagem de linhas e de ocorrências do nome é reproduzível por `wc -l` e `grep`,
 * e é por isso que aparecem no site: número que ninguém pode conferir é enfeite.
 */

export const STACK = [
  'NestJS + Fastify',
  'Next.js (App Router)',
  'Prisma 7 + PostgreSQL',
  'Zod',
  'Argon2 + JWT',
  'BullMQ + Redis',
  'Jest + Vitest + Testing Library',
  'Turborepo + pnpm',
] as const;

/**
 * A faixa de metadados do hero. Nomes próprios de tecnologia: não se traduz, e é o que
 * um dev quer saber na primeira linha, antes de qualquer argumento.
 */
export const HERO_META = 'Boilerplate SaaS · NestJS · Next.js · Prisma · Postgres';

export const REPO_URL = 'https://github.com/marmottajr/dontpanic';
export const NPM_PACKAGE = 'create-dontpanic';
