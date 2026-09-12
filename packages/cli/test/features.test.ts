/**
 * Testes do manifesto de features e do aplicador.
 *
 * Três coisas são verificadas aqui, e a terceira é a que mais importa a longo prazo:
 *
 *  1. **Integridade do manifesto** — todo `FeatureId` tem entrada, todo `requires` aponta
 *     para uma feature que existe, toda costura tem `reason`, nenhum `deletePaths` sai do
 *     projeto.
 *  2. **O grafo** — ordem de remoção correta (dependente antes de dependido), ciclo
 *     detectado, `alwaysOn` recusando desligar.
 *  3. **Coerência com `recipe.ts`** — os dois arquivos descrevem o mesmo grafo por
 *     caminhos diferentes: aqui por dossiê de feature, lá por regra de validação de
 *     receita. Divergência entre eles é bug de produto, não de estilo: ou a landing
 *     oferece uma combinação que o CLI recusa, ou o CLI gera uma que não compila. Este é
 *     o teste que impede os dois de divergirem em silêncio.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ALWAYS_ON_FEATURES,
  FEATURE_MANIFESTS,
  allSeams,
  manifestRequirements,
  removalOrder,
} from '../src/features/manifest.ts';
import { globToRegExp } from '../src/features/apply.ts';
import { ALWAYS_ON, PRESETS, presetRecipe, validateRecipe } from '../src/recipe.ts';
import { FEATURE_IDS } from '../src/types.ts';
import type { FeatureId, Recipe } from '../src/types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Integridade do manifesto
// ─────────────────────────────────────────────────────────────────────────────

describe('integridade do manifesto', () => {
  it('tem uma entrada por FeatureId, com o `id` concordando com a chave', () => {
    // O `Record<FeatureId, …>` já garante a presença em tempo de compilação; o que este
    // teste pega é a troca de lugar — `oauth: invitationsManifest` tipa e está errado.
    for (const id of FEATURE_IDS) {
      const manifest = FEATURE_MANIFESTS[id];
      assert.ok(manifest, `sem manifesto para ${id}`);
      assert.equal(manifest.id, id, `manifesto de ${id} declara id "${manifest.id}"`);
      assert.ok(manifest.label.length > 0, `${id} sem label`);
      assert.ok(manifest.summary.length > 0, `${id} sem summary`);
    }
  });

  it('todo `requires` aponta para uma feature que existe', () => {
    for (const { feature, needs } of manifestRequirements()) {
      assert.ok(
        (FEATURE_IDS as readonly string[]).includes(needs),
        `${feature} requer "${needs}", que não é uma feature`,
      );
      assert.notEqual(needs, feature, `${feature} requer a si mesma`);
    }
  });

  it('toda costura tem `file`, `kind` e `reason`', () => {
    // O `reason` não é documentação opcional: ele é o corpo da mensagem de erro quando a
    // costura deixa de casar, e é a única pista que quem depurar em seis meses vai ter.
    for (const { feature, seam } of allSeams()) {
      assert.ok(seam.file.length > 0, `${feature}: costura sem arquivo`);
      assert.ok(seam.kind.length > 0, `${feature}: costura sem kind em ${seam.file}`);
      assert.ok(
        seam.reason !== undefined && seam.reason.length > 20,
        `${feature}: costura em ${seam.file} (${seam.kind}) sem reason útil`,
      );
    }
  });

  it('todo `pattern` e todo delimitador de bloco é regex compilável', () => {
    for (const { feature, seam } of allSeams()) {
      const sources = [seam.pattern, seam.target, seam.block?.start, seam.block?.end].filter(
        (source): source is string => source !== undefined,
      );
      for (const source of sources) {
        // Placeholders de locale só existem em tempo de geração; aqui basta trocá-los por
        // algo inerte para o teste medir a SINTAXE do resto do padrão.
        const inert = source.replace(/\{\{[^}]+\}\}/g, 'x');
        assert.doesNotThrow(
          () => new RegExp(inert),
          `${feature}: padrão inválido em ${seam.file}: ${source}`,
        );
      }
    }
  });

  it('nenhum `deletePaths` escapa do projeto — um `..` apagaria arquivo do usuário', () => {
    for (const id of FEATURE_IDS) {
      for (const path of FEATURE_MANIFESTS[id].deletePaths ?? []) {
        assert.ok(!path.startsWith('/'), `${id}: caminho absoluto "${path}"`);
        assert.ok(
          !path.split('/').includes('..'),
          `${id}: "${path}" sobe de diretório — apagaria fora do projeto`,
        );
      }
    }
  });

  it('as features com veto do mapa não declaram remoção que contradiga o veto', () => {
    // `audit` é `alwaysOn`: se alguém lhe der `deletePaths`, ou o veto caiu (e o
    // `alwaysOn` tem de sair junto) ou a remoção foi escrita por engano.
    for (const id of ALWAYS_ON_FEATURES) {
      const manifest = FEATURE_MANIFESTS[id];
      assert.equal(
        (manifest.deletePaths ?? []).length,
        0,
        `${id} é alwaysOn mas declara deletePaths — o veto e a remoção não podem coexistir`,
      );
      assert.equal((manifest.seams ?? []).length, 0, `${id} é alwaysOn mas declara costuras`);
    }
  });

  it('`audit` é a feature alwaysOn, e por evidência do mapa', () => {
    assert.deepEqual([...ALWAYS_ON_FEATURES], ['audit']);
    assert.equal(FEATURE_MANIFESTS.audit.alwaysOn, true);
  });

  it('multiTenant NÃO remove a maquinaria de isolamento (ADR 0002)', () => {
    // Single-tenant ESCONDE e SEMEIA; não arranca. Zero linhas de RLS, `prisma.db`,
    // `TenantContext` ou `app_role` se movem — é o que mantém o projeto gerado seguro por
    // construção em vez de seguro por lembrança, e o que preserva o
    // `tenant-isolation.e2e-spec.ts` como prova.
    const manifest = FEATURE_MANIFESTS.multiTenant;
    const forbidden = ['src/infra/tenancy', 'src/infra/prisma', 'row_level_security', 'app_role'];

    for (const path of manifest.deletePaths ?? []) {
      for (const guard of forbidden) {
        assert.ok(
          !path.includes(guard),
          `single-tenant não pode apagar "${path}": ADR 0002 diz esconder, não arrancar`,
        );
      }
    }

    // E as costuras não podem tocar o claim `tid` nem o throw de `requireTenantId` — a
    // armadilha I13: sem o claim, o interceptor calcula escopo nulo, `prisma.db` cai no
    // cliente base e, sob FORCE ROW LEVEL SECURITY, toda query devolve zero linhas SEM
    // erro nenhum. O app parece um banco vazio.
    for (const seam of manifest.seams ?? []) {
      assert.ok(
        !seam.file.endsWith('token.service.ts'),
        'I13: nenhuma costura de single-tenant pode tocar token.service.ts (o claim `tid`)',
      );
      assert.ok(
        !seam.file.endsWith('tenant-context.ts'),
        'I13: nenhuma costura pode tocar o throw de TenantContext.requireTenantId()',
      );
    }
  });

  it('`i18n` desligado significa UM idioma, não ausência de i18n', () => {
    // Veto do mapa: 50 arquivos não-teste chamam `useTranslations`/`getTranslations`, e
    // há um segundo sistema bilíngue dentro da API. Remover `next-intl` obrigaria o
    // gerador a AUTORAR a UI.
    const manifest = FEATURE_MANIFESTS.i18n;
    for (const path of manifest.deletePaths ?? []) {
      assert.ok(!path.includes('src/i18n/request'), `i18n não pode apagar o provider: ${path}`);
    }
    for (const entry of manifest.deps ?? []) {
      assert.ok(
        !entry.remove.includes('next-intl'),
        'i18n single-language não remove next-intl — o veto do mapa é explícito',
      );
    }
  });

  it('`queue` desligado NÃO apaga o catálogo de jobs (um port sem jobs não compila)', () => {
    // O mapa verificou: esvaziar `JobPayloads` faz `JobName` virar `never` e
    // `job-router.service.ts:38,54` falham com TS2339. As duas formas legais são "port com
    // `mail.send`" e "sem abstração nenhuma"; o manifesto escolheu a primeira.
    for (const path of FEATURE_MANIFESTS.queue.deletePaths ?? []) {
      assert.ok(
        !path.endsWith('core/queue/jobs.ts') && !path.endsWith('core/queue'),
        `queue não pode apagar o catálogo de jobs: ${path}`,
      );
    }
  });

  it('remover oauth aperta `User.passwordHash` para obrigatório (I7)', () => {
    // O único escritor de `null` era `oauth.service.ts:474`. Deixar nullable COMPILA — e é
    // por isso que é o perigo: sobram 20 linhas de equalização de tempo que nenhuma conta
    // pode descrever, com o piso `functions: 100` ainda exigindo cobertura delas.
    const tighten = FEATURE_MANIFESTS.oauth.prisma?.tighten ?? [];
    assert.ok(
      tighten.some((entry) => entry.model === 'User' && entry.field === 'passwordHash'),
      'oauth precisa declarar o aperto de User.passwordHash',
    );
  });

  it('só `invitations` RETIRA fragmento de SQL manual da baseline', () => {
    // A2 §4 do mapa diz que duas features possuem SQL manual: `multiTenant` (18 dos 22
    // statements) e `invitations` (1, o índice único parcial). Mas o campo `sqlFragments`
    // não significa "possui" — significa "SAI da baseline quando a feature é removida".
    //
    // E é aí que o ADR 0002 entra: em modo single-tenant **nenhum** fragmento de RLS sai.
    // O `rls-*` e o `role-*` continuam emitidos byte a byte, porque single-tenant esconde e
    // semeia em vez de arrancar — é o que mantém o `tenant-isolation.e2e-spec.ts` provando
    // alguma coisa no projeto gerado. Logo `multiTenant.sqlFragments` é vazio POR DECISÃO, e
    // uma lista não-vazia ali seria a regressão a pegar.
    const removesSql = FEATURE_IDS.filter(
      (id) => (FEATURE_MANIFESTS[id].sqlFragments ?? []).length > 0,
    );
    assert.deepEqual(removesSql, ['invitations']);
    assert.deepEqual(
      FEATURE_MANIFESTS.multiTenant.sqlFragments ?? [],
      [],
      'single-tenant não retira fragmento de RLS nenhum — ADR 0002',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · O grafo
// ─────────────────────────────────────────────────────────────────────────────

describe('grafo de remoção', () => {
  it('remove o DEPENDENTE antes do dependido', () => {
    // `platform` importa `InvitationsModule` e chama `invitations.issue(tx, …)`. Remover
    // `invitations` primeiro deixaria as costuras de `platform` procurando arquivos num
    // estado que o mapa não descreve.
    const order = removalOrder(['invitations', 'platform', 'plans']);
    assert.ok(order.includes('platform'));
    assert.ok(
      order.indexOf('platform') < order.indexOf('invitations'),
      `platform tem de sair antes de invitations: ${order.join(', ')}`,
    );
    assert.ok(
      order.indexOf('platform') < order.indexOf('plans'),
      `platform tem de sair antes de plans: ${order.join(', ')}`,
    );
  });

  it('devolve só as features pedidas, e cada uma uma vez', () => {
    const order = removalOrder(['oauth', 'captcha']);
    assert.deepEqual([...order].sort(), ['captcha', 'oauth']);
    assert.equal(new Set(order).size, order.length);
  });

  it('é determinístico — a ordem não depende de como a receita chegou', () => {
    const a = removalOrder(['plans', 'platform', 'invitations', 'captcha']);
    const b = removalOrder(['captcha', 'invitations', 'platform', 'plans']);
    assert.deepEqual(a, b);
  });

  it('honra a ordem mesmo quando o dependido não está sendo removido', () => {
    const order = removalOrder(['platform']);
    assert.deepEqual(order, ['platform']);
  });

  it('detecta ciclo e falha com mensagem que nomeia o caminho', () => {
    // Um grafo com ciclo não tem ordem de remoção nenhuma, e escolher uma
    // arbitrariamente daria geração irreproduzível — o oposto do que o CI de
    // conformidade precisa. O ciclo é injetado por mutação temporária porque o manifesto
    // real (corretamente) não tem nenhum.
    const captcha = FEATURE_MANIFESTS.captcha;
    const files = FEATURE_MANIFESTS.files;
    const originalCaptcha = captcha.requires;
    const originalFiles = files.requires;

    try {
      (captcha as { requires?: FeatureId[] }).requires = ['files'];
      (files as { requires?: FeatureId[] }).requires = ['captcha'];

      assert.throws(
        () => removalOrder(['captcha', 'files']),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /[Cc]iclo/);
          assert.match(error.message, /captcha/);
          assert.match(error.message, /files/);
          return true;
        },
      );
    } finally {
      // `delete` quando o original era ausente, em vez de atribuir `undefined`. Sob
      // `exactOptionalPropertyTypes` as duas coisas não são a mesma: uma propriedade
      // opcional pode estar AUSENTE, não presente valendo `undefined` — e restaurar com
      // `undefined` deixaria a chave existindo no manifesto, o que muda o resultado de
      // um `'requires' in manifest`.
      restoreRequires(captcha, originalCaptcha);
      restoreRequires(files, originalFiles);
    }
  });

  it('não tem ciclo no manifesto real, em nenhum subconjunto', () => {
    // Todas as features de uma vez é o subconjunto mais hostil; se ele passa, nenhum
    // subconjunto tem ciclo.
    assert.doesNotThrow(() => removalOrder([...FEATURE_IDS]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Coerência com recipe.ts
// ─────────────────────────────────────────────────────────────────────────────

/** Receita com as features dadas ligadas e o resto desligado, sem incoerência de driver. */
function recipeWith(on: readonly FeatureId[]): Recipe {
  const recipe = presetRecipe('saas', { displayName: 'Acme Corp', slug: 'acme-corp' });
  for (const id of FEATURE_IDS) recipe.features[id] = on.includes(id);
  for (const id of ALWAYS_ON_FEATURES) recipe.features[id] = true;

  // Drivers alinhados com as features, para o teste medir dependência de FEATURE e não
  // tropeçar nas regras de driver (captcha ligado com driver `none`, etc.).
  recipe.drivers.captcha = recipe.features.captcha ? 'turnstile' : 'none';
  recipe.drivers.queue = recipe.features.queue ? 'bullmq' : 'memory';
  recipe.drivers.storage = recipe.features.files ? 's3' : 'local';
  recipe.oauth.providers = recipe.features.oauth ? ['google'] : [];
  recipe.i18n = recipe.features.i18n
    ? { locales: ['pt', 'en'], defaultLocale: 'pt' }
    : { locales: ['pt'], defaultLocale: 'pt' };
  return recipe;
}

/** Fecho transitivo dos `requires` de uma feature, ela inclusive. */
function withRequirements(id: FeatureId): FeatureId[] {
  const out = new Set<FeatureId>([id]);
  const queue: FeatureId[] = [id];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined) break;
    for (const needs of FEATURE_MANIFESTS[current].requires ?? []) {
      if (!out.has(needs)) {
        out.add(needs);
        queue.push(needs);
      }
    }
  }
  return [...out];
}

describe('coerência entre o manifesto e o recipe.ts', () => {
  it('toda aresta `requires` do manifesto é ACEITA pelo validateRecipe', () => {
    // O contrato: se o manifesto diz que A precisa de B, então "A e B ligados" é uma
    // receita válida. Um erro aqui significa que o manifesto declara como possível uma
    // combinação que o CLI recusa — e o usuário vê a landing prometer o que o CLI nega.
    for (const id of FEATURE_IDS) {
      const recipe = recipeWith(withRequirements(id));
      const errors = validateRecipe(recipe).filter((issue) => issue.level === 'error');
      assert.deepEqual(
        errors.map((issue) => issue.message),
        [],
        `ligar ${id} com os requires dele deveria ser válido`,
      );
    }
  });

  it('ligar TODAS as features é válido — é o preset `complete`', () => {
    const errors = validateRecipe(recipeWith([...FEATURE_IDS])).filter(
      (issue) => issue.level === 'error',
    );
    assert.deepEqual(errors.map((issue) => issue.message), []);
  });

  it('desligar tudo que é desligável é válido', () => {
    const errors = validateRecipe(recipeWith([])).filter((issue) => issue.level === 'error');
    assert.deepEqual(errors.map((issue) => issue.message), []);
  });

  it('os dois arquivos concordam sobre o que é alwaysOn', () => {
    // `recipe.ts` publica `ALWAYS_ON` para o CLI e a landing; o manifesto deriva o dele do
    // campo `alwaysOn`. Divergir faria o CLI recusar desligar uma feature que o manifesto
    // sabe remover, ou pior, o contrário.
    assert.deepEqual([...ALWAYS_ON].sort(), [...ALWAYS_ON_FEATURES].sort());
  });

  it('todo preset satisfaz os `requires` do manifesto', () => {
    // Este é o teste que pega o preset inconsistente: se `saas` liga `platform` e esquece
    // `plans`, o projeto gerado não compila, e a falha aparece no CI de conformidade
    // muitos minutos depois. Aqui aparece em milissegundos.
    for (const preset of Object.values(PRESETS)) {
      for (const [id, enabled] of Object.entries(preset.features) as [FeatureId, boolean][]) {
        if (!enabled) continue;
        for (const needs of FEATURE_MANIFESTS[id].requires ?? []) {
          assert.equal(
            preset.features[needs],
            true,
            `preset "${preset.id}" liga ${id} mas não ${needs}, que o manifesto exige`,
          );
        }
      }
    }
  });

  /**
   * Arestas que o manifesto conhece e o `validateRecipe` ainda não valida.
   *
   * É subconjunto, não igualdade, de propósito: quando o `recipe.ts` passar a validar uma
   * delas, este teste continua verde (a lista só precisa encolher por higiene), mas uma
   * aresta NOVA que ninguém ensinou ao `validateRecipe` faz o teste falhar — que é o
   * momento certo de descobrir.
   *
   * As três de hoje vêm de I1, I2 e I11 do mapa: `platform` sem `invitations` cria empresa
   * inalcançável (o painel CONVIDA o primeiro admin, não cria usuário); `platform` sem
   * `plans` perde o CRUD de plano que o painel É; e cadastro público em single-tenant é
   * criação de empresa num mundo onde só existe uma.
   */
  const LACUNAS_CONHECIDAS = new Set([
    'platform→invitations',
    'platform→plans',
    'publicSignup→multiTenant',
  ]);

  it('as lacunas do validateRecipe são as conhecidas — nenhuma nova', () => {
    const missing: string[] = [];

    for (const { feature, needs } of manifestRequirements()) {
      // Receita que VIOLA a aresta: a feature ligada, a dependência desligada.
      const on = withRequirements(feature).filter((id) => id !== needs);
      const recipe = recipeWith(on);
      if (recipe.features[needs]) continue; // alwaysOn: a violação é inexprimível

      const flagged = validateRecipe(recipe).some((issue) => issue.level === 'error');
      if (!flagged) missing.push(`${feature}→${needs}`);
    }

    for (const edge of missing) {
      assert.ok(
        LACUNAS_CONHECIDAS.has(edge),
        `aresta nova sem validação no recipe.ts: ${edge}. ` +
          `Ou o validateRecipe aprende a recusá-la, ou ela sai do manifesto.`,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Utilidades do aplicador
// ─────────────────────────────────────────────────────────────────────────────

describe('globToRegExp', () => {
  it('escapa parênteses e colchetes — os caminhos do App Router são cheios deles', () => {
    // `apps/web/src/app/(auth)/signup/complete` tem parênteses, que são sintaxe de grupo
    // em glob. Tratado como glob, `(auth)` viraria alternância — e "depende da biblioteca"
    // não é base para uma operação de APAGAR arquivo.
    const re = globToRegExp('apps/web/src/app/(auth)/**');
    assert.ok(re.test('apps/web/src/app/(auth)/login/page.tsx'));
    assert.ok(!re.test('apps/web/src/app/auth/login/page.tsx'));

    const dynamic = globToRegExp('apps/web/src/app/invite/[token]/page.tsx');
    assert.ok(dynamic.test('apps/web/src/app/invite/[token]/page.tsx'));
    assert.ok(!dynamic.test('apps/web/src/app/invite/t/page.tsx'));
  });

  it('`**/` casa zero ou mais segmentos, e `*` não atravessa `/`', () => {
    const deep = globToRegExp('apps/api/**/*.spec.ts');
    assert.ok(deep.test('apps/api/src/a.spec.ts'));
    assert.ok(deep.test('apps/api/src/modules/auth/b.spec.ts'));
    assert.ok(!deep.test('apps/web/src/a.spec.ts'));

    const shallow = globToRegExp('apps/api/*.ts');
    assert.ok(shallow.test('apps/api/main.ts'));
    assert.ok(!shallow.test('apps/api/src/main.ts'));
  });
});

/** Devolve `requires` ao estado original, distinguindo ausente de `undefined`. */
function restoreRequires(manifest: object, original: FeatureId[] | undefined): void {
  const target = manifest as { requires?: FeatureId[] };
  if (original === undefined) {
    delete target.requires;
  } else {
    target.requires = original;
  }
}
