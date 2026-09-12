/**
 * Testes do editor de TypeScript.
 *
 * Cada costura é exercitada em três estados, porque são os três que acontecem de verdade
 * numa geração: o padrão CASA (o caminho feliz), o padrão NÃO CASA (o boilerplate mudou e
 * o manifesto envelheceu — tem que ser detectável, não silencioso), e aplicar DUAS VEZES
 * não corrompe (o aplicador pode rodar depois de um dry-run, ou num retry).
 *
 * As fixtures são minúsculas e escritas à mão de propósito: um teste contra o arquivo real
 * do boilerplate passaria a falhar quando o boilerplate mudasse, o que confundiria
 * "o editor está quebrado" com "o manifesto envelheceu" — que é exatamente a distinção que
 * este módulo existe para manter nítida.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertBalanced,
  dropArrayEntry,
  dropBalancedBlock,
  dropBlock,
  dropBlockWithLeadingDoc,
  dropClassMember,
  dropCommentSection,
  dropImport,
  dropImportSpecifier,
  dropLinesMatching,
  insertRelative,
  replaceAll,
  splitTopLevel,
} from '../src/seams/typescript-source.ts';
import { SeamStructureError } from '../src/seams/result.ts';

describe('dropLinesMatching', () => {
  const source = [
    "@Public()",
    "@RequireCaptcha('login')",
    "async login() {}",
    '',
    "@RequireCaptcha('signup')",
    "async signup() {}",
  ].join('\n');

  it('apaga TODAS as ocorrências, não a primeira', () => {
    // Cinco `@RequireCaptcha` no controller real. Parar na primeira deixaria quatro
    // referências a um decorator apagado.
    const out = dropLinesMatching(source, '@RequireCaptcha\\(');
    assert.equal(out.matched, true);
    assert.equal(out.changes, 2);
    assert.ok(!out.content.includes('RequireCaptcha'));
    assert.ok(out.content.includes('async login() {}'));
    assert.ok(out.content.includes('async signup() {}'));
  });

  it('não casa e não muda nada quando o padrão envelheceu', () => {
    const out = dropLinesMatching(source, '@RequireHcaptcha\\(');
    assert.equal(out.matched, false);
    assert.equal(out.changes, 0);
    assert.equal(out.content, source);
  });

  it('é idempotente', () => {
    const once = dropLinesMatching(source, '@RequireCaptcha\\(');
    const twice = dropLinesMatching(once.content, '@RequireCaptcha\\(');
    assert.equal(twice.matched, false);
    assert.equal(twice.content, once.content);
  });
});

describe('dropBlock', () => {
  it('casa o fim contra o TEXTO, não linha por linha', () => {
    // O motivo de existir: vários `block.end` do manifesto atravessam linhas. Um
    // casamento por linha não acharia `\}\);\s*\}\);` e a costura falharia dizendo que o
    // boilerplate mudou, com o boilerplate intacto.
    const source = [
      'const keep = 1;',
      'describe("oauth", () => {',
      '  it("liga", () => {',
      '    expect(true);',
      '  });',
      '});',
      'const alsoKeep = 2;',
    ].join('\n');

    const out = dropBlock(source, 'describe\\("oauth"', '\\}\\);\\s*\\}\\);');
    assert.equal(out.matched, true);
    assert.ok(out.content.includes('const keep = 1;'));
    assert.ok(out.content.includes('const alsoKeep = 2;'));
    assert.ok(!out.content.includes('oauth'));
  });

  it('aceita bloco de uma linha só (início e fim no mesmo lugar)', () => {
    const source = 'a\nexport const X = 1;\nb';
    const out = dropBlock(source, 'export const X', 'export const X');
    assert.equal(out.matched, true);
    assert.equal(out.content, 'a\nb');
  });

  it('levanta erro estrutural quando o fim nunca aparece', () => {
    // Deliberadamente NÃO é "não casou": o início acertou, então o manifesto descreve
    // este arquivo. Apagar até o EOF por otimismo destruiria o resto.
    const source = 'const a = 1;\nfunction open() {\n  return 1;';
    assert.throws(
      () => dropBlock(source, 'function open', '^\\}$', 'fixture.ts'),
      (error: unknown) => error instanceof SeamStructureError,
    );
  });

  it('é idempotente', () => {
    const source = 'a\n// start\nmiddle\n// end\nb';
    const once = dropBlock(source, '// start', '// end');
    const twice = dropBlock(once.content, '// start', '// end');
    assert.equal(twice.matched, false);
    assert.equal(once.content, 'a\nb');
  });
});

describe('dropBlockWithLeadingDoc', () => {
  it('leva o doc-comment que descrevia o símbolo', () => {
    // Deixar o comentário produz oito linhas explicando a razão de ser de algo que não
    // está mais no arquivo — e num repo cujo CLAUDE.md instrui agentes a confiar nos
    // comentários, isso é instrução errada, não ruído.
    const source = [
      'const before = 1;',
      '',
      '/**',
       ' * Existe para equalizar o tempo de resposta de conta sem senha.',
      ' */',
      'export const ABSENT_PASSWORD_HASH = argon2.hash(randomUUID());',
      '',
      'const after = 2;',
    ].join('\n');

    const out = dropBlockWithLeadingDoc(
      source,
      'export const ABSENT_PASSWORD_HASH',
      'export const ABSENT_PASSWORD_HASH',
    );
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('equalizar'));
    assert.ok(!out.content.includes('/**'));
    assert.ok(out.content.includes('const before = 1;'));
    assert.ok(out.content.includes('const after = 2;'));
  });
});

describe('dropClassMember', () => {
  const controller = [
    'export class AuthController {',
    '  @Public()',
    '  @SystemScope()',
    "  @Post('2fa/verify')",
    '  async verifyTwoFactor() {',
    '    return this.auth.verify();',
    '  }',
    '',
    "  @Post('refresh')",
    '  async refresh() {',
    '    return this.auth.refresh();',
    '  }',
    '}',
  ].join('\n');

  it('leva os decorators do membro — senão eles aderem ao PRÓXIMO', () => {
    // Esta é a asserção mais importante do arquivo. Decorator pendurado não é erro de
    // compilação em TypeScript: ele adere ao membro seguinte. Uma costura ingênua
    // transformaria `POST /auth/refresh` numa rota pública e em escopo de sistema, e
    // nenhum teste do boilerplate pegaria — nenhum afirma que `refresh` NÃO é público.
    const out = dropClassMember(controller, "@Post\\('2fa/verify'\\)");
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('verifyTwoFactor'));
    assert.ok(!out.content.includes('@Public()'), '@Public() não pode sobrar');
    assert.ok(!out.content.includes('@SystemScope()'), '@SystemScope() não pode sobrar');
    assert.ok(out.content.includes('async refresh()'));
    assert.ok(out.content.includes("@Post('refresh')"));
    assertBalanced('controller.ts', out.content);
  });

  it('não casa quando o decorator já não existe', () => {
    const out = dropClassMember(controller, "@Post\\('2fa/confirm'\\)");
    assert.equal(out.matched, false);
    assert.equal(out.content, controller);
  });

  it('é idempotente', () => {
    const once = dropClassMember(controller, "@Post\\('2fa/verify'\\)");
    const twice = dropClassMember(once.content, "@Post\\('2fa/verify'\\)");
    assert.equal(twice.matched, false);
  });
});

describe('dropCommentSection', () => {
  it('para ANTES do banner seguinte, sem fundir duas seções', () => {
    const source = [
      '// --- core ---',
      'const a = 1;',
      '// --- social sign-in ---',
      'const oauthProviders = z.string();',
      'const oauthSecret = z.string();',
      '// --- rate limit ---',
      'const trustProxy = z.string();',
    ].join('\n');

    const out = dropCommentSection(source, '--- social sign-in ---');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('oauthProviders'));
    assert.ok(out.content.includes('// --- rate limit ---'), 'o banner seguinte sobrevive');
    assert.ok(out.content.includes('trustProxy'));
    assert.ok(out.content.includes('// --- core ---'));
  });
});

describe('dropBalancedBlock', () => {
  it('conta chaves em vez de casar o primeiro fechamento', () => {
    // `dropBlock` não serve aqui: qualquer regex de `\}` casaria o fechamento interno e
    // cortaria a entrada no meio, deixando o arquivo inválido.
    const source = [
      'export const parameters = {',
      '  locale: {',
      '    toolbar: {',
      '      items: [{ value: "pt" }, { value: "en" }],',
      '    },',
      '  },',
      '  theme: { toolbar: {} },',
      '};',
    ].join('\n');

    const out = dropBalancedBlock(source, 'locale:\\s*\\{');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('items'));
    assert.ok(out.content.includes('theme:'), 'a entrada irmã sobrevive');
    assertBalanced('preview.tsx', out.content);
  });
});

describe('dropImport / dropImportSpecifier', () => {
  const source = [
    "import { Module } from '@nestjs/common';",
    "import { OAuthModule } from './modules/auth/oauth/oauth.module';",
    'import {',
    '  LoginInput,',
    '  TWO_FACTOR_TICKET_COOKIE,',
    '  UserDto,',
    "} from '@dontpanic/shared';",
    '',
    'export class AppModule {}',
  ].join('\n');

  it('dropImport apaga o statement casando o ESPECIFICADOR', () => {
    const out = dropImport(source, 'oauth/oauth\\.module');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('OAuthModule'));
    assert.ok(out.content.includes('@nestjs/common'));
  });

  it('dropImport não casa um caminho que não existe mais', () => {
    const out = dropImport(source, 'oauth/oauth\\.adapter');
    assert.equal(out.matched, false);
  });

  it('dropImportSpecifier tira um símbolo e preserva os outros', () => {
    // O caso do mapa: `login/page.tsx` importa sete símbolos de `@dontpanic/shared` e só
    // dois saem com o oauth. Apagar o statement levaria os cinco que ficam.
    const out = dropImportSpecifier(source, 'TWO_FACTOR_TICKET_COOKIE', '@dontpanic/shared');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('TWO_FACTOR_TICKET_COOKIE'));
    assert.ok(out.content.includes('LoginInput'));
    assert.ok(out.content.includes('UserDto'));
    assertBalanced('page.tsx', out.content);
  });

  it('dropImportSpecifier apaga o statement quando o último símbolo sai', () => {
    // `import {} from '...'` compila e é pior que um erro: é um import de efeito
    // colateral que ninguém escreveu de propósito.
    const single = "import { onlyOne } from '@dontpanic/shared';\nconst x = 1;";
    const out = dropImportSpecifier(single, 'onlyOne', '@dontpanic/shared');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('import'));
    assert.ok(out.content.includes('const x = 1;'));
  });

  it('dropImportSpecifier respeita o módulo em `target`', () => {
    const out = dropImportSpecifier(source, 'UserDto', '@nestjs/common');
    assert.equal(out.matched, false, 'UserDto não vem de @nestjs/common');
  });
});

describe('dropArrayEntry', () => {
  it('funciona igual em array multi-linha e compactado', () => {
    // `dropLinesMatching` funcionaria só no primeiro formato, e falharia apagando o array
    // inteiro no dia em que o prettier compactasse.
    const multi = [
      '@Module({',
      '  imports: [',
      '    PrismaModule,',
      '    OAuthModule,',
      '    UsersModule,',
      '  ],',
      '})',
    ].join('\n');
    const compact = '@Module({ imports: [PrismaModule, OAuthModule, UsersModule] })';

    for (const source of [multi, compact]) {
      const out = dropArrayEntry(source, 'imports', '\\bOAuthModule\\b');
      assert.equal(out.matched, true);
      assert.ok(!out.content.includes('OAuthModule'));
      assert.ok(out.content.includes('PrismaModule'));
      assert.ok(out.content.includes('UsersModule'));
      assertBalanced('app.module.ts', out.content);
      assert.ok(!/,\s*,/.test(out.content), 'não pode sobrar vírgula dupla');
    }
  });

  it('não confunde prefixo: UsersModule não leva AdminUsersModule', () => {
    const source = '@Module({ imports: [AdminUsersModule, UsersModule] })';
    const out = dropArrayEntry(source, 'imports', '^\\s*UsersModule\\s*$');
    assert.equal(out.matched, true);
    assert.ok(out.content.includes('AdminUsersModule'));
    assert.ok(!/[^s]UsersModule/.test(out.content.replace('AdminUsersModule', '')));
  });

  it('conta colchetes: um array com objetos dentro não é cortado no primeiro `]`', () => {
    const source = [
      '@Module({',
      '  providers: [',
      '    { provide: APP_GUARD, useClass: CaptchaGuard },',
      '    { provide: APP_GUARD, useClass: JwtAuthGuard },',
      '  ],',
      '  imports: [PrismaModule],',
      '})',
    ].join('\n');

    const out = dropArrayEntry(source, 'providers', 'CaptchaGuard');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('CaptchaGuard'));
    assert.ok(out.content.includes('JwtAuthGuard'));
    assert.ok(out.content.includes('imports: [PrismaModule]'));
    assertBalanced('app.module.ts', out.content);
  });
});

describe('splitTopLevel', () => {
  it('não parte uma entrada no meio', () => {
    const entries = splitTopLevel('A, { provide: X, useClass: Y }, fn(a, b)');
    assert.equal(entries.length, 3);
    assert.ok(entries[1]?.includes('useClass'));
    assert.ok(entries[2]?.includes('fn(a, b)'));
  });

  it('ignora vírgula dentro de string', () => {
    const entries = splitTopLevel("'a,b', 'c'");
    assert.equal(entries.length, 2);
  });
});

describe('replaceAll', () => {
  it('substitui todas as ocorrências e honra grupos de captura', () => {
    const source = 'três portas levam aqui\ntrês portas levam aqui';
    const out = replaceAll(source, 'três (portas)', 'duas $1');
    assert.equal(out.changes, 2);
    assert.ok(!out.content.includes('três'));
    assert.ok(out.content.includes('duas portas'));
  });

  it('não casa quando a prosa já mudou', () => {
    const out = replaceAll('duas portas', 'três portas', 'duas portas');
    assert.equal(out.matched, false);
  });
});

describe('insertRelative', () => {
  const source = ["await app.register(multipart);", 'await app.listen();'].join('\n');

  it('insere preservando a indentação da âncora', () => {
    const indented = '  await app.register(multipart);';
    const out = insertRelative(indented, 'register\\(multipart\\)', 'await app.register(fastifyStatic);', 'after');
    assert.equal(out.matched, true);
    assert.ok(out.content.includes('  await app.register(fastifyStatic);'));
  });

  it('é idempotente — não registra o plugin duas vezes', () => {
    // Registro de plugin duplicado é erro de BOOT do Fastify, não um diff feio.
    const once = insertRelative(source, 'register\\(multipart\\)', 'await app.register(fastifyStatic);', 'after');
    const twice = insertRelative(once.content, 'register\\(multipart\\)', 'await app.register(fastifyStatic);', 'after');
    assert.equal(twice.matched, false);
    assert.equal(
      once.content.split('fastifyStatic').length - 1,
      1,
      'o plugin aparece exatamente uma vez',
    );
  });
});

describe('assertBalanced', () => {
  it('aceita código válido, incluindo delimitador dentro de string e comentário', () => {
    const source = [
      'const a = "um { que não abre nada";',
      '// um ] solto no comentário',
      '/* e um ) aqui */',
      'const b = `template ${x} com }`;',
      'function f() { return [1, 2]; }',
    ].join('\n');
    assert.doesNotThrow(() => assertBalanced('ok.ts', source));
  });

  it('pega o fechamento que sobrou depois de uma remoção mal feita', () => {
    assert.throws(
      () => assertBalanced('broken.ts', 'function f() {\n  return 1;\n}\n}'),
      (error: unknown) => error instanceof SeamStructureError,
    );
  });

  it('pega o delimitador aberto e nunca fechado', () => {
    assert.throws(
      () => assertBalanced('broken.ts', 'const a = [1, 2,'),
      (error: unknown) => error instanceof SeamStructureError,
    );
  });
});
