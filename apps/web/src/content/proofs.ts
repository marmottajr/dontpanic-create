/**
 * A parte da seção "A prova" que não se traduz.
 *
 * Código é código: o mesmo trecho errado aparece nos sete idiomas, byte por byte.
 * Traduzir um identificador ou um nome de env var transformaria a citação em
 * paráfrase, e o valor do argumento está em ele ser verificável.
 *
 * `surface` é o lugar do repo onde o assunto mora, e também não traduz.
 */

import type { ProofId } from '@/i18n/messages/types';

export interface ProofArtifact {
  id: ProofId;
  surface: string;
  code: string;
}

export const PROOF_ARTIFACTS: Record<ProofId, ProofArtifact> = {
  'oauth-identity': {
    id: 'oauth-identity',
    surface: 'auth/oauth',
    code: `// callback do provedor: quem é esta pessoa?
const user = await prisma.user.findUnique({
  where: { email: profile.email },
});

if (user) return issueSession(user);`,
  },
  'oauth-2fa': {
    id: 'oauth-2fa',
    surface: 'auth/oauth',
    code: `const account = await findLinkedAccount(
  provider,
  profile.sub,
);

return issueSession(account.userId);`,
  },
  'trust-proxy': {
    id: 'trust-proxy',
    surface: 'infra/rate-limit',
    code: `// "atrás do load balancer todo mundo
//  cai no mesmo balde de rate limit"
const app = await NestFactory.create(
  AppModule,
  new FastifyAdapter({ trustProxy: true }),
);`,
  },
  'guard-scope': {
    id: 'guard-scope',
    surface: 'auth/guards',
    code: `// guard: esta sessão precisa de 2FA?
const user = await this.prisma.db.user
  .findUnique({ where: { id: userId } });

if (!user?.twoFactorEnabled) return true;`,
  },
  'db-owner': {
    id: 'db-owner',
    surface: 'db/rls',
    code: `# .env
DATABASE_URL="postgresql://postgres:\
postgres@localhost:5432/app"`,
  },
};

/** Ordem de leitura da seção. Do mais concreto para o mais estrutural. */
export const PROOF_ORDER: ProofId[] = [
  'oauth-identity',
  'oauth-2fa',
  'trust-proxy',
  'guard-scope',
  'db-owner',
];
