/**
 * O manifesto de features: como REMOVER cada uma.
 *
 * Nada aqui descreve como ADICIONAR. O template é o repo dontpanic real, que compila,
 * roda e passa nos testes, e o gerador só subtrai — ver `docs/decisions/0001`. A
 * consequência prática é que este arquivo é grande: 1.369 linhas de tabela do mapa de
 * superfície viraram ~660 costuras, uma por ponto onde a remoção precisa ser cirúrgica.
 * A alternativa (encher 800 arquivos de `{{#if oauth}}`) destruiria o ativo que se está
 * vendendo.
 *
 * ## De onde vem cada linha
 *
 * `docs/maps/feature-surface.md`, produzido por auditoria do repo no commit `4b32926`.
 * Cada feature tem um dossiê com onze seções (arquivos exclusivos, costuras com
 * arquivo:linha, Prisma, contratos, web, env, seed, docs, deps, SQL, dependências), e
 * cada entrada abaixo cita a linha do mapa que a justifica. Nada foi escrito de memória:
 * onde o mapa disse "NO CHANGE", não existe costura — aquelas linhas do mapa existem
 * justamente para impedir que alguém invente trabalho.
 *
 * ## As duas regras de qualidade que valem para toda entrada
 *
 * 1. **Padrão âncora, nunca string literal.** O template é sincronizado de uma TAG do
 *    repo vivo. Um `replace` com a indentação de hoje apodrece no primeiro
 *    `prettier --write` que passar por lá, e apodrece em SILÊNCIO: a costura não casa, o
 *    código órfão fica, e o projeto gerado tem uma feature meio-removida.
 * 2. **`required: true` é o default, e é o default certo.** Uma costura que não casa mais
 *    significa que o boilerplate mudou e o manifesto envelheceu. Isso precisa FALHAR a
 *    geração — não passar batido. O `reason` de cada costura aparece na mensagem de erro,
 *    e é por isso que ele é escrito para quem vai depurar em seis meses, não para quem
 *    está lendo agora. `required: false` aparece só onde o mapa diz que a costura pode
 *    legitimamente não existir (em geral: o arquivo só existe se outra feature estiver
 *    instalada), e aí o `reason` diz por que a ausência é aceitável.
 *
 * ## Os vetos que o mapa estabeleceu
 *
 * Três features não são removíveis na v1, e cada uma por evidência, não por cautela:
 *
 * - **`audit`** (`alwaysOn: true`) — `auditLog.create` vive em 5 services independentes,
 *   ~30 sítios, e o export de LGPD *retorna* linhas de auditoria (mapa 169, 5225/I4).
 * - **`i18n`** — removível só como "um idioma só". Remoção total é vetada: 50 arquivos
 *   não-teste chamam `useTranslations`/`getTranslations`, mais um segundo sistema
 *   bilíngue feito à mão DENTRO da API (mapa 171, 5230/I9). O manifesto de `i18n`
 *   expressa single-language.
 * - **`multiTenant`** — desligado significa MODO SINGLE-TENANT: esconde e semeia, não
 *   arranca. Zero linhas de maquinaria de isolamento se movem (ADR 0002, mapa 172,
 *   5231/I10). O RLS continua provado pelo `tenant-isolation.e2e-spec.ts`, que é o teste
 *   que dá lastro ao argumento de segurança do produto.
 *
 * E duas features que parecem simples e não são:
 *
 * - **`queue`** — "remover a fila" NÃO é apagar os jobs. O mapa verificou que um port com
 *   zero jobs **não compila** (`JobName` vira `never`, `TS2339` em
 *   `job-router.service.ts:38,54`), e três services recebem `QUEUE_PROVIDER` como
 *   parâmetro obrigatório de construtor. Remover = "port + driver memory" (I8).
 * - **`platform`** — depende de `invitations`, `plans`, `audit` e `provisionTenant`;
 *   `Role.SUPERADMIN` não sobrevive e `User.tenantId` pode virar NOT NULL.
 */

import { FEATURE_IDS } from '../types.ts';
import type { FeatureId, FeatureManifest, SeamEdit } from '../types.ts';

import { i18nManifest, multiTenantManifest } from './i18n-multitenant.ts';
import { invitationsManifest, oauthManifest } from './oauth-invitations.ts';
import { auditManifest, plansManifest, platformManifest } from './platform-audit-plans.ts';
import {
  captchaManifest,
  easterEggsManifest,
  publicSignupManifest,
  queueManifest,
} from './queue-captcha-signup-eggs.ts';
import {
  CHARTS_ORPHAN_WHEN_PLATFORM_OFF,
  FILES_ORPHANED_BY_FEATURE_PAIRS,
  scaffoldingManifest,
} from './scaffolding.ts';
import { filesManifest, twoFactorManifest } from './twofactor-files.ts';

export { CHARTS_ORPHAN_WHEN_PLATFORM_OFF, FILES_ORPHANED_BY_FEATURE_PAIRS };

/**
 * Um manifesto por feature. O `Record` completo é o contrato: `FEATURE_IDS` e este objeto
 * têm as mesmas chaves, garantido pelo tipo — acrescentar uma feature ao `types.ts` sem
 * descrever como removê-la quebra o build do gerador aqui, e não a geração de alguém.
 */
export const FEATURE_MANIFESTS: Record<FeatureId, FeatureManifest> = {
  multiTenant: multiTenantManifest,
  twoFactor: twoFactorManifest,
  oauth: oauthManifest,
  invitations: invitationsManifest,
  publicSignup: publicSignupManifest,
  files: filesManifest,
  platform: platformManifest,
  audit: auditManifest,
  plans: plansManifest,
  i18n: i18nManifest,
  queue: queueManifest,
  captcha: captchaManifest,
  easterEggs: easterEggsManifest,
  scaffolding: scaffoldingManifest,
};

/** Features que o CLI recusa desligar na v1, derivado dos manifestos. */
export const ALWAYS_ON_FEATURES: readonly FeatureId[] = FEATURE_IDS.filter(
  (id) => FEATURE_MANIFESTS[id].alwaysOn === true,
);

/**
 * Arestas `A requires B` do manifesto, achatadas.
 *
 * Existe para o teste de coerência com o `recipe.ts`: os dois arquivos descrevem o mesmo
 * grafo por caminhos diferentes (aqui, por dossiê de feature; lá, por regra de validação
 * de receita), e divergência entre eles é bug — o site prometeria uma combinação que o
 * CLI recusa, ou o CLI geraria uma que não compila.
 */
export function manifestRequirements(): { feature: FeatureId; needs: FeatureId }[] {
  const out: { feature: FeatureId; needs: FeatureId }[] = [];
  for (const id of FEATURE_IDS) {
    for (const needs of FEATURE_MANIFESTS[id].requires ?? []) {
      out.push({ feature: id, needs });
    }
  }
  return out;
}

/**
 * Ordem de remoção, das features dependentes para as dependidas.
 *
 * `platform` sai ANTES de `invitations`: ele importa `InvitationsModule` e chama
 * `invitations.issue(tx, …)`, então remover `invitations` primeiro deixaria, por um
 * instante, um `platform` apontando para um módulo que já não existe. Não é só estética —
 * as costuras de `platform` sobre arquivos de `invitations` (e vice-versa) precisam achar
 * o arquivo no estado que o mapa descreve, e o mapa descreve o repo completo.
 *
 * Ciclo é erro de manifesto e para a geração: um grafo de features com ciclo não tem
 * ordem de remoção nenhuma, e "escolher uma e seguir" produziria resultado dependente da
 * ordem de iteração do objeto — irreproduzível, que é o oposto do que o CI de
 * conformidade precisa.
 */
export function removalOrder(features: readonly FeatureId[]): FeatureId[] {
  const wanted = new Set(features);
  const order: FeatureId[] = [];
  const state = new Map<FeatureId, 'visiting' | 'done'>();

  const visit = (id: FeatureId, path: FeatureId[]): void => {
    const current = state.get(id);
    if (current === 'done') return;
    if (current === 'visiting') {
      const cycle = [...path.slice(path.indexOf(id)), id].join(' → ');
      throw new Error(
        `Ciclo no grafo de dependências de features: ${cycle}\n` +
          `Isto é bug no manifesto do gerador (src/features/*): um ciclo não tem ordem de ` +
          `remoção, e escolher uma arbitrariamente daria geração irreproduzível. ` +
          `Reporte com a receita usada.`,
      );
    }

    state.set(id, 'visiting');
    // Quem DEPENDE de `id` sai antes de `id`. Então, visitando `id`, primeiro tratamos os
    // dependentes — a aresta é percorrida ao contrário de como está declarada.
    for (const other of FEATURE_IDS) {
      if (!wanted.has(other) || other === id) continue;
      if ((FEATURE_MANIFESTS[other].requires ?? []).includes(id)) {
        visit(other, [...path, id]);
      }
    }
    state.set(id, 'done');
    if (wanted.has(id)) order.push(id);
  };

  // `FEATURE_IDS` como semente em vez de `features`: ordem determinística
  // independentemente de como a receita chegou.
  for (const id of FEATURE_IDS) {
    if (wanted.has(id)) visit(id, []);
  }

  return order;
}

/** Toda costura declarada, com a feature dona — para inventário e para os testes. */
export function allSeams(): { feature: FeatureId; seam: SeamEdit }[] {
  const out: { feature: FeatureId; seam: SeamEdit }[] = [];
  for (const id of FEATURE_IDS) {
    for (const seam of FEATURE_MANIFESTS[id].seams ?? []) out.push({ feature: id, seam });
  }
  return out;
}
