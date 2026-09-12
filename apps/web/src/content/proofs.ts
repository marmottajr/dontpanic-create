/**
 * A parte da seção "A prova" que não se traduz.
 *
 * Código é código: o mesmo trecho errado aparece nos sete idiomas, byte por byte.
 * Traduzir um identificador, um caminho de arquivo ou um nome de env var transformaria
 * a citação em paráfrase, e o valor do argumento está em ele ser verificável.
 *
 * `testSpec` e `testCases` são o compromisso mais forte desta página: cada selo
 * "coberto por teste" nomeia o arquivo e a contagem, medidos com
 * `grep -cE '^\s+(it|test)\('` no repo `marmottajr/dontpanic`. Quem duvidar, confere.
 *
 * Um item que o design propôs NÃO está aqui: "webhook de cobrança sem assinatura
 * verificada". O erro é real e comum, mas o boilerplate não tem cobrança — zero
 * ocorrências de webhook, stripe ou billing na API —, então não há decisão nossa a
 * mostrar nem teste a citar. Numa seção que existe para ser conferida, um item
 * inventado derrubaria os outros quatro junto.
 */

import type { ProofId } from '@/i18n/messages/types';

export interface ProofArtifact {
  id: ProofId;
  /** Caminho real no repo do boilerplate, exibido na barra do bloco de código. */
  file: string;
  code: string;
  /** Spec que cobre a decisão, e o número de casos dentro dele. */
  testSpec: string;
  testCases: number;
}

export const PROOF_ARTIFACTS: Record<ProofId, ProofArtifact> = {
  'oauth-identity': {
    id: 'oauth-identity',
    file: 'apps/api/src/modules/auth/oauth/oauth.service.ts',
    code: `// callback do provedor: quem é esta pessoa?
const user = await prisma.user.findUnique({
  where: { email: profile.email },
});

if (user) return issueSession(user);`,
    testSpec: 'oauth.service.spec.ts',
    testCases: 46,
  },
  'oauth-2fa': {
    id: 'oauth-2fa',
    file: 'apps/api/src/modules/auth/oauth/oauth.service.ts',
    code: `const account = await findLinkedAccount(
  provider,
  profile.sub,
);

return issueSession(account.userId);`,
    testSpec: 'oauth.service.spec.ts',
    testCases: 46,
  },
  'rls-where': {
    id: 'rls-where',
    file: 'apps/api/src/modules/records/records.service.ts',
    code: `// todo método repete o filtro, para sempre
findOne(id: string, tenantId: string) {
  return prisma.record.findFirst({
    where: { id, tenantId },
  });
}

// e então alguém escreve este:
byId(id: string) {
  return prisma.record.findUnique({ where: { id } });
}`,
    testSpec: 'prisma.service.spec.ts',
    testCases: 19,
  },
  'password-reset': {
    id: 'password-reset',
    file: 'apps/api/src/modules/auth/services/auth.service.ts',
    code: `// "senha trocada, problema resolvido"
await prisma.user.update({
  where: { id: record.userId },
  data: { passwordHash },
});

return { message: 'Password updated.' };`,
    testSpec: 'auth.service.spec.ts',
    testCases: 6,
  },
  'db-owner': {
    id: 'db-owner',
    file: '.env',
    code: `DATABASE_URL="postgresql://postgres:\
postgres@localhost:5432/app"`,
    testSpec: 'tenant-isolation.e2e-spec.ts',
    testCases: 5,
  },
};

/** Ordem de leitura da seção — é ela que numera os itens (01 … 05). */
export const PROOF_ORDER: ProofId[] = [
  'oauth-identity',
  'oauth-2fa',
  'rls-where',
  'password-reset',
  'db-owner',
];
