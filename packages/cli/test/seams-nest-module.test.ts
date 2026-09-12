/**
 * Testes da remoção de módulo Nest.
 *
 * A asserção que dá sentido ao arquivo é a de VALIDADE SINTÁTICA do resultado: o
 * `app.module.ts` é o bootstrap, e um arquivo inválido ali significa que nada no projeto
 * gerado sobe. O `nest build` reporta isso de um jeito que não menciona o gerador, então o
 * portão tem que ser aqui.
 *
 * O segundo defeito coberto é o pior dos dois, porque é silencioso: import removido sem a
 * entrada do array (ou o contrário) COMPILA, e o módulo simplesmente não é carregado. O
 * projeto sobe e a feature que o usuário pediu não existe em runtime.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertNestModuleValid,
  dropImportOfSymbol,
  pruneGuardRationale,
  removeNestModule,
} from '../src/seams/nest-module.ts';
import { assertBalanced, SeamStructureError } from '../src/seams/index.ts';

/** Réplica reduzida do `app.module.ts` do boilerplate, com a forma que importa. */
const APP_MODULE = [
  "import { Module } from '@nestjs/common';",
  "import { APP_GUARD } from '@nestjs/core';",
  "import { AuthModule } from './modules/auth/auth.module';",
  "import { OAuthModule } from './modules/auth/oauth/oauth.module';",
  "import { CaptchaModule } from './infra/captcha/captcha.module';",
  "import { UsersModule } from './modules/users/users.module';",
  '',
  '@Module({',
  '  imports: [',
  '    PrismaModule,',
  '    AuthModule,',
  '    OAuthModule,',
  '    CaptchaModule,',
  '    UsersModule,',
  '  ],',
  '  // A ordem importa: o ThrottlerGuard vem primeiro para que o custo de Argon2 fique',
  '  // atrás do orçamento de requisições. O CaptchaGuard vem antes do JwtAuthGuard.',
  '  providers: [',
  '    { provide: APP_GUARD, useClass: ThrottlerGuard },',
  '    { provide: APP_GUARD, useClass: CaptchaGuard },',
  '    { provide: APP_GUARD, useClass: JwtAuthGuard },',
  '  ],',
  '})',
  'export class AppModule {}',
].join('\n');

/**
 * Parser de balanceamento — a checagem "o arquivo resultante é sintaticamente válido"
 * exigida para esta costura. Não é um parser de TypeScript, e não precisa ser: a classe de
 * dano que uma edição textual produz é delimitador desbalanceado e vírgula dupla.
 */
function assertStillParses(content: string): void {
  assertBalanced('app.module.ts', content);
  assertNestModuleValid('app.module.ts', content);
  // Todo `import` que sobrou tem `from` e ponto e vírgula.
  for (const line of content.split('\n')) {
    if (/^\s*import\b/.test(line) && !line.trimEnd().endsWith('{')) {
      assert.match(line, /from\s*['"][^'"]+['"];?\s*$/, `import malformado: ${line}`);
    }
  }
}

describe('removeNestModule', () => {
  it('remove a entrada do array E o import, juntos', () => {
    const out = removeNestModule(APP_MODULE, { moduleName: 'OAuthModule' }, 'app.module.ts');
    assert.equal(out.matched, true);

    assert.ok(!out.content.includes('OAuthModule'), 'nem entrada nem import podem sobrar');
    // A metade que sobra é o defeito silencioso: compila, e o módulo não carrega.
    assert.ok(!out.content.includes('oauth/oauth.module'));
    assert.ok(out.content.includes('AuthModule'), 'AuthModule é outro módulo, fica');
    assert.ok(out.content.includes("from './modules/auth/auth.module'"));
  });

  it('deixa o arquivo sintaticamente válido', () => {
    const out = removeNestModule(APP_MODULE, { moduleName: 'OAuthModule' }, 'app.module.ts');
    assertStillParses(out.content);
    assert.ok(!/,\s*,/.test(out.content), 'vírgula pendente dupla');
    assert.ok(!/\[\s*,/.test(out.content), 'array começando com vírgula');
  });

  it('acha a classe em `providers` também, não só em `imports`', () => {
    // `TwoFactorGateGuard` é um guard GLOBAL: uma costura que só soubesse olhar `imports`
    // deixaria o registro apontando para uma classe apagada — falha de boot do Nest, não
    // erro de compilação.
    const out = removeNestModule(APP_MODULE, { moduleName: 'CaptchaGuard' }, 'app.module.ts');
    assert.equal(out.matched, true);
    assert.ok(
      !out.content.includes('useClass: CaptchaGuard'),
      'a entrada de `providers` tem de sair',
    );
    assert.ok(out.content.includes('useClass: JwtAuthGuard'), 'o guard irmão fica');
    assertStillParses(out.content);

    // O comentário que JUSTIFICA a ordem dos guards continua mencionando o guard removido —
    // e isso é correto aqui. Prosa é outra costura (`pruneGuardRationale`), declarada
    // separadamente no manifesto, porque uma costura com dois efeitos dá uma linha de
    // relatório para duas mudanças e esconde metade quando só metade casa.
    assert.ok(out.content.includes('CaptchaGuard vem antes'));
    const pruned = pruneGuardRationale(out.content, 'CaptchaGuard');
    assert.equal(pruned.matched, true);
    assert.ok(!pruned.content.includes('CaptchaGuard'), 'juntas, as duas limpam tudo');
    assertStillParses(pruned.content);
  });

  it('não casa quando a classe já não está no arquivo', () => {
    const out = removeNestModule(APP_MODULE, { moduleName: 'WebhooksModule' }, 'app.module.ts');
    assert.equal(out.matched, false);
    assert.equal(out.content, APP_MODULE);
  });

  it('é idempotente', () => {
    const once = removeNestModule(APP_MODULE, { moduleName: 'OAuthModule' }, 'app.module.ts');
    const twice = removeNestModule(once.content, { moduleName: 'OAuthModule' }, 'app.module.ts');
    assert.equal(twice.matched, false);
    assert.equal(twice.content, once.content);
    assertStillParses(twice.content);
  });

  it('remove dois módulos em sequência sem corromper', () => {
    // A geração real remove várias features; o arquivo passa por N costuras.
    const first = removeNestModule(APP_MODULE, { moduleName: 'OAuthModule' }, 'app.module.ts');
    const second = removeNestModule(first.content, { moduleName: 'CaptchaModule' }, 'app.module.ts');
    assert.equal(second.matched, true);
    assert.ok(!second.content.includes('OAuthModule'));
    assert.ok(!second.content.includes('CaptchaModule'));
    assert.ok(second.content.includes('UsersModule'));
    assertStillParses(second.content);
  });

  it('remove o último módulo do array sem deixar `[ ,`', () => {
    const tiny = [
      "import { Only } from './only';",
      '@Module({ imports: [Only] })',
      'export class AppModule {}',
    ].join('\n');
    const out = removeNestModule(tiny, { moduleName: 'Only' }, 'app.module.ts');
    assert.equal(out.matched, true);
    assert.match(out.content, /imports: \[\]/);
    assertStillParses(out.content);
  });
});

describe('dropImportOfSymbol', () => {
  it('preserva os outros símbolos do mesmo statement', () => {
    const source = "import { A, B, C } from './x';\nconst y = 1;";
    const out = dropImportOfSymbol(source, 'B');
    assert.equal(out.matched, true);
    assert.ok(out.content.includes('A'));
    assert.ok(out.content.includes('C'));
    assert.ok(!/\bB\b/.test(out.content));
  });

  it('apaga o statement quando era o único símbolo', () => {
    const source = "import { Only } from './x';\nconst y = 1;";
    const out = dropImportOfSymbol(source, 'Only');
    assert.equal(out.matched, true);
    assert.equal(out.content, 'const y = 1;');
  });

  it('lida com import multi-linha', () => {
    const source = ['import {', '  A,', '  B,', "} from './x';", 'const y = 1;'].join('\n');
    const out = dropImportOfSymbol(source, 'A');
    assert.equal(out.matched, true);
    assert.ok(out.content.includes('B'));
    assert.ok(!/\bA\b/.test(out.content));
    assertBalanced('x.ts', out.content);
  });
});

describe('pruneGuardRationale', () => {
  it('tira a linha do guard que saiu e preserva o resto do raciocínio', () => {
    // Comentário que nomeia código inexistente, num arquivo de bootstrap, é o primeiro
    // lugar onde o próximo dev (ou agente) procura para entender a cadeia de autorização.
    const out = pruneGuardRationale(APP_MODULE, 'CaptchaGuard');
    assert.equal(out.matched, true);
    assert.ok(out.content.includes('ThrottlerGuard vem primeiro'), 'o resto do porquê fica');
    assert.ok(
      !out.content.includes('CaptchaGuard vem antes'),
      'a frase sobre o guard removido sai',
    );
  });
});

describe('assertNestModuleValid', () => {
  it('pega a vírgula dupla que uma costura de LINHA deixaria', () => {
    assert.throws(
      () => assertNestModuleValid('app.module.ts', '@Module({ imports: [A, , C] })'),
      (error: unknown) => error instanceof SeamStructureError,
    );
  });

  it('aceita o resultado de uma remoção bem feita', () => {
    const out = removeNestModule(APP_MODULE, { moduleName: 'OAuthModule' }, 'app.module.ts');
    assert.doesNotThrow(() => assertNestModuleValid('app.module.ts', out.content));
  });
});
