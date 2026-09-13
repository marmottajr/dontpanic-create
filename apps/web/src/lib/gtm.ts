/**
 * O id do contêiner do Google Tag Manager, vindo do ambiente da build.
 *
 * `process.env.NEXT_PUBLIC_*` é substituído literalmente no momento do build — com
 * `output: 'export'` não existe runtime que possa ler variável depois, então o valor
 * tem que estar presente em `pnpm build` ou não estará em lugar nenhum. É por isso que
 * a variável entra no passo de build do workflow, e não no passo de deploy.
 *
 * A validação não é zelo: o valor atravessa uma variável de CI e vai parar **dentro de
 * um `<script>`**. Um valor com aspa ou ponto e vírgula ali deixaria de ser um id e
 * passaria a ser código executando na página, escrito por quem tiver acesso às
 * variáveis do repositório. Recusar o que não casa com a forma do id fecha isso antes
 * de existir — e a recusa é silenciosa e fechada: sem id, sem tag.
 */
const PATTERN = /^GTM-[A-Z0-9]{4,}$/;

export function parseGtmId(raw: string | undefined): string | null {
  const value = raw?.trim() ?? '';
  return PATTERN.test(value) ? value : null;
}

export const GTM_ID = parseGtmId(process.env.NEXT_PUBLIC_GTM_ID);
