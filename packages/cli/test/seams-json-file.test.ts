/**
 * Testes do editor de JSON.
 *
 * A asserção central é sobre o DIFF: a formatação e a ordem das chaves não mudam além da
 * remoção. `JSON.parse` + `JSON.stringify` reescreveria o arquivo inteiro, e o primeiro
 * commit que o usuário do gerador lê — que é onde ele decide se confia no gerador — mostraria
 * 60 linhas mexidas para uma dependência removida.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  dropDependency,
  dropJsonKey,
  dropJsonKeysMatching,
  locateMember,
  parseKeyPath,
  upsertDependency,
} from '../src/seams/json-file.ts';
import { SeamStructureError } from '../src/seams/result.ts';

/** `package.json` com a forma que importa: ordem escolhida, 2 espaços, grupos separados. */
const PACKAGE = `{
  "name": "@dontpanic/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "test": "jest"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.700.0",
    "@aws-sdk/s3-request-presigner": "^3.700.0",
    "@fastify/rate-limit": "^10.2.0",
    "@fastify/static": "^8.0.0",
    "@nestjs/common": "^12.0.0",
    "bullmq": "^5.34.0",
    "ioredis": "^5.4.0"
  },
  "devDependencies": {
    "@types/node": "^24.7.0",
    "jest": "^30.0.0"
  }
}
`;

describe('parseKeyPath', () => {
  it('quebra no ponto e respeita o escape', () => {
    assert.deepEqual(parseKeyPath('auth.oauth'), ['auth', 'oauth']);
    // Chave com ponto literal existe de verdade — sem escape, os dois casos seriam
    // indistinguíveis e um deles falharia em silêncio.
    assert.deepEqual(parseKeyPath('dependencies.@fastify/static'), [
      'dependencies',
      '@fastify/static',
    ]);
    // Só o PONTO precisa de escape; a barra não é separador de caminho de chave.
    assert.deepEqual(parseKeyPath('exports.\\./features'), ['exports', './features']);
  });
});

describe('dropJsonKey', () => {
  it('NÃO muda formatação nem ordem além da remoção', () => {
    const out = dropJsonKey(PACKAGE, 'dependencies.bullmq', 'package.json');
    assert.equal(out.matched, true);

    // Toda linha que não era a da chave removida está byte a byte igual, na mesma ordem.
    const before = PACKAGE.split('\n').filter((line) => !line.includes('"bullmq"'));
    const after = out.content.split('\n');
    assert.deepEqual(after, before, 'nenhuma outra linha pode ter mudado');

    // E a ordem das chaves que sobraram é a original.
    const order = [...out.content.matchAll(/"([^"]+)":/g)].map((match) => match[1]);
    assert.deepEqual(order.slice(0, 4), ['name', 'version', 'private', 'scripts']);
    assert.ok(order.indexOf('@aws-sdk/client-s3') < order.indexOf('ioredis'));
  });

  it('mantém o JSON válido quando a chave removida era a ÚLTIMA', () => {
    // Sem comer a vírgula anterior sobraria `{ "a": 1, }`, e o `pnpm` reclamaria do
    // package.json com uma mensagem sobre posição, não sobre a chave que o gerador tirou.
    const out = dropJsonKey(PACKAGE, 'dependencies.ioredis', 'package.json');
    assert.equal(out.matched, true);
    assert.doesNotThrow(() => JSON.parse(out.content));
    const parsed = JSON.parse(out.content) as { dependencies: Record<string, string> };
    assert.ok(!('ioredis' in parsed.dependencies));
    assert.ok('bullmq' in parsed.dependencies);
  });

  it('remove um objeto inteiro (chave cujo valor é objeto)', () => {
    const out = dropJsonKey(PACKAGE, 'devDependencies', 'package.json');
    assert.equal(out.matched, true);
    assert.doesNotThrow(() => JSON.parse(out.content));
    // `jest` NÃO serve de sonda: ele também é o valor de `scripts.test`. A sonda é uma
    // chave que só existia no objeto removido.
    assert.ok(!out.content.includes('@types/node'));
    assert.ok(!out.content.includes('"devDependencies"'));
    assert.ok(out.content.includes('"dependencies"'));
    assert.ok(out.content.includes('"test": "jest"'), 'scripts.test sobrevive');
  });

  it('não casa chave ausente, e é idempotente', () => {
    const missing = dropJsonKey(PACKAGE, 'dependencies.axios', 'package.json');
    assert.equal(missing.matched, false);
    assert.equal(missing.content, PACKAGE);

    const once = dropJsonKey(PACKAGE, 'dependencies.bullmq', 'package.json');
    const twice = dropJsonKey(once.content, 'dependencies.bullmq', 'package.json');
    assert.equal(twice.matched, false);
    assert.equal(twice.content, once.content);
  });

  it('remove chave aninhada de catálogo i18n sem tocar as irmãs', () => {
    const messages = `{
  "nav": {
    "dashboard": "Painel"
  },
  "auth": {
    "login": "Entrar",
    "oauth": {
      "continueWith": "Continuar com {provider}",
      "separator": "ou"
    },
    "signup": "Criar conta"
  }
}
`;
    const out = dropJsonKey(messages, 'auth.oauth', 'pt-BR.json');
    assert.equal(out.matched, true);
    assert.doesNotThrow(() => JSON.parse(out.content));
    assert.ok(!out.content.includes('continueWith'));
    assert.ok(out.content.includes('"login": "Entrar"'));
    assert.ok(out.content.includes('"signup": "Criar conta"'));
    assert.ok(out.content.includes('"dashboard": "Painel"'));
  });

  it('tolera JSONC — comentário no tsconfig não é reescrito nem quebra', () => {
    const tsconfig = `{
  "compilerOptions": {
    // Necessário para o strip-types do Node resolver import com extensão .ts
    "allowImportingTsExtensions": true,
    "strict": true
  }
}
`;
    const out = dropJsonKey(tsconfig, 'compilerOptions.allowImportingTsExtensions', 'tsconfig.json');
    assert.equal(out.matched, true);
    assert.ok(out.content.includes('// Necessário'), 'o comentário sobrevive');
    assert.ok(out.content.includes('"strict": true'));
  });
});

describe('locateMember', () => {
  it('acha o span exato do membro', () => {
    const span = locateMember(PACKAGE, ['dependencies', 'bullmq']);
    assert.ok(span);
    assert.equal(span.key, 'bullmq');
    assert.equal(PACKAGE.slice(span.start, span.end), '"bullmq": "^5.34.0"');
  });

  it('devolve undefined para caminho que não existe', () => {
    assert.equal(locateMember(PACKAGE, ['dependencies', 'axios']), undefined);
    assert.equal(locateMember(PACKAGE, ['nope', 'bullmq']), undefined);
  });
});

describe('dropDependency', () => {
  it('acha a dep sem que o manifesto precise saber a seção', () => {
    // `@types/*` muda de `dependencies` para `devDependencies` entre versões; um
    // manifesto que fixasse a seção envelheceria por um motivo alheio à feature.
    const out = dropDependency(PACKAGE, '@types/node', 'package.json');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('@types/node'));
    assert.doesNotThrow(() => JSON.parse(out.content));
  });

  it('remove as três deps fantasma do A3.2 sem corromper', () => {
    let content = PACKAGE;
    for (const name of [
      '@fastify/static',
      '@fastify/rate-limit',
      '@aws-sdk/s3-request-presigner',
    ]) {
      const out = dropDependency(content, name, 'package.json');
      assert.equal(out.matched, true, `${name} deveria estar declarada`);
      content = out.content;
    }
    const parsed = JSON.parse(content) as { dependencies: Record<string, string> };
    assert.deepEqual(Object.keys(parsed.dependencies), [
      '@aws-sdk/client-s3',
      '@nestjs/common',
      'bullmq',
      'ioredis',
    ]);
  });

  it('não casa dep ausente', () => {
    assert.equal(dropDependency(PACKAGE, 'axios', 'package.json').matched, false);
  });
});

describe('upsertDependency', () => {
  it('reintroduz @fastify/static para o build de storage local (I17)', () => {
    // A ÚNICA operação aditiva do gerador. `LOCAL_STORAGE_PUBLIC_URL` aponta hoje para
    // uma rota que a API não serve; sem esta dep de volta, todo avatar dá 404.
    const without = dropDependency(PACKAGE, '@fastify/static', 'package.json').content;
    const out = upsertDependency(without, 'dependencies', '@fastify/static', '^8.0.0');
    assert.equal(out.matched, true);
    const parsed = JSON.parse(out.content) as { dependencies: Record<string, string> };
    assert.equal(parsed.dependencies['@fastify/static'], '^8.0.0');
  });

  it('sobrescreve a versão quando a dep já existe, sem duplicar', () => {
    const out = upsertDependency(PACKAGE, 'dependencies', '@fastify/static', '^9.0.0');
    assert.equal(out.matched, true);
    assert.equal(out.content.split('@fastify/static').length - 1, 1);
    const parsed = JSON.parse(out.content) as { dependencies: Record<string, string> };
    assert.equal(parsed.dependencies['@fastify/static'], '^9.0.0');
  });

  it('não casa seção inexistente', () => {
    assert.equal(
      upsertDependency(PACKAGE, 'peerDependencies', 'x', '^1.0.0').matched,
      false,
    );
  });
});

describe('dropJsonKeysMatching', () => {
  it('apaga namespaces de primeiro nível por padrão', () => {
    const messages = '{\n  "platform": { "a": "1" },\n  "nav": { "b": "2" },\n  "invite": {}\n}\n';
    const out = dropJsonKeysMatching(messages, '^(platform|invite)$', 'pt-BR.json');
    assert.equal(out.matched, true);
    assert.equal(out.changes, 2);
    assert.doesNotThrow(() => JSON.parse(out.content));
    assert.ok(out.content.includes('"nav"'));
  });
});

describe('assertParsable', () => {
  it('detecta JSON quebrado antes de escrever', () => {
    // A checagem roda dentro do `dropJsonKey`; aqui provamos que ela existe forçando um
    // conteúdo inválido por outro caminho.
    const broken = '{\n  "a": 1,,\n  "b": 2\n}\n';
    assert.throws(
      () => dropJsonKey(broken, 'b', 'broken.json'),
      (error: unknown) => error instanceof SeamStructureError,
    );
  });
});
