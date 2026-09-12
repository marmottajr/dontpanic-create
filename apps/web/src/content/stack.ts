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
 * As cinco trocas que são uma variável de ambiente, não um refactor.
 *
 * O banco NÃO está aqui de propósito. Trocá-lo exige mexer no `provider` do
 * `schema.prisma` e no driver adapter — não é uma variável —, e o gerador emite só
 * Postgres porque Row Level Security é dele. Listá-lo aqui tornaria falsa a única
 * frase que esta tabela existe para provar.
 */
export const PORTS = [
  { port: 'StorageProvider', adapters: 's3 · local', env: 'STORAGE_DRIVER' },
  { port: 'MailProvider', adapters: 'smtp · ses · console', env: 'MAIL_DRIVER' },
  { port: 'CacheProvider', adapters: 'redis · memory', env: 'CACHE_DRIVER' },
  { port: 'QueueProvider', adapters: 'bullmq · memory', env: 'QUEUE_DRIVER' },
  { port: 'CaptchaProvider', adapters: 'turnstile · recaptcha · none', env: 'CAPTCHA_DRIVER' },
] as const;

export const REPO_URL = 'https://github.com/marmottajr/dontpanic';
export const NPM_PACKAGE = '@dontpanic/create';
