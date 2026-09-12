/**
 * Testes da poda de markdown.
 *
 * A asserção que o arquivo existe para fazer: **a seção seguinte sobrevive intacta**.
 * Uma seção vai do seu heading até o próximo heading de nível IGUAL OU MAIOR, e errar isso
 * come a irmã — que num `CLAUDE.md` dirigido a agentes de IA significa apagar a instrução
 * de outra feature junto com a que saiu.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  dropBullet,
  dropSection,
  dropTableRow,
  listHeadings,
} from '../src/seams/markdown-doc.ts';

/** Réplica reduzida do `CLAUDE.md`: níveis mistos, réguas entre seções, tabela. */
const DOC = [
  '# DontPanic — guia do sistema',
  '',
  '## Arquitetura — Ports & Adapters',
  '',
  '| Recurso | Port | Env |',
  '| --- | --- | --- |',
  '| Storage | `StorageProvider` | `STORAGE_DRIVER` |',
  '| Captcha | `CaptchaProvider` | `CAPTCHA_DRIVER` |',
  '| Jobs | `QueueProvider` | `QUEUE_DRIVER` |',
  '',
  '---',
  '',
  '## Login social — decisão de deploy opcional',
  '',
  'Vem tudo desligado: `OAUTH_PROVIDERS` vazio significa nenhum botão.',
  '',
  '### O fluxo',
  '',
  'O callback termina sozinho nos dois casos comuns.',
  '',
  '### Por provider',
  '',
  'Google, Apple e GitHub.',
  '',
  '---',
  '',
  '## Captcha — decisão de deploy obrigatória',
  '',
  'Port `CaptchaProvider`, adapters em `infra/captcha`.',
  '',
  '---',
  '',
  '## O que NÃO fazer',
  '',
  '- Não logar segredos, tokens ou senhas.',
  '- Não ligar OAuth só de um lado: `OAUTH_PROVIDERS` e `NEXT_PUBLIC_OAUTH_PROVIDERS`',
  '  listam os mesmos nomes, ou o botão extra dá 404. Mesma regra para',
  '  `PUBLIC_SIGNUP_ENABLED`.',
  '- Não expor `CAPTCHA_SECRET_KEY` no front nem ligar o captcha só num dos lados.',
  '- Não subir produção com `QUEUE_DRIVER=memory`.',
].join('\n');

describe('listHeadings', () => {
  it('acha os headings com o nível certo e ignora o que está em bloco de código', () => {
    const headings = listHeadings(DOC);
    const titles = headings.map((heading) => heading.title);
    assert.ok(titles.includes('Login social — decisão de deploy opcional'));
    assert.equal(headings.find((h) => h.title === 'O fluxo')?.level, 3);
    assert.equal(headings.find((h) => h.title === 'O que NÃO fazer')?.level, 2);

    const fenced = ['## Real', '', '```md', '## Falso', '```', '', '## Também real'].join('\n');
    assert.deepEqual(
      listHeadings(fenced).map((h) => h.title),
      ['Real', 'Também real'],
    );
  });
});

describe('dropSection', () => {
  it('leva as SUBSEÇÕES e deixa a seção SEGUINTE intacta', () => {
    // O teste central. `## Login social` tem duas subseções `###`; a seção irmã
    // `## Captcha` tem de sobreviver com o corpo dela.
    const out = dropSection(DOC, '^Login social');
    assert.equal(out.matched, true);

    assert.ok(!out.content.includes('Login social'));
    assert.ok(!out.content.includes('### O fluxo'), 'a subseção sai com a seção');
    assert.ok(!out.content.includes('### Por provider'));
    assert.ok(!out.content.includes('Google, Apple e GitHub.'));

    assert.ok(out.content.includes('## Captcha — decisão de deploy obrigatória'));
    assert.ok(out.content.includes('Port `CaptchaProvider`, adapters em `infra/captcha`.'));
    assert.ok(out.content.includes('## O que NÃO fazer'));
    assert.ok(out.content.includes('## Arquitetura — Ports & Adapters'));
  });

  it('não deixa duas réguas seguidas onde a seção estava', () => {
    const out = dropSection(DOC, '^Login social');
    assert.ok(!/---\s*\n\s*---/.test(out.content), 'régua duplicada');
  });

  it('apaga a última seção do arquivo sem exigir heading seguinte', () => {
    const out = dropSection(DOC, '^O que NÃO fazer');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('Não logar segredos'));
    assert.ok(out.content.includes('## Captcha'));
  });

  it('casa por padrão, então sobrevive a reescrita do subtítulo', () => {
    // O título real é `Login social — decisão de deploy opcional`, com travessão unicode.
    // Uma âncora curta sobrevive a alguém editar o subtítulo — que é o tipo de mudança
    // editorial que acontece sem ninguém pensar no gerador.
    assert.equal(dropSection(DOC, '^Login social').matched, true);
    assert.equal(dropSection(DOC, 'Login social — decisão de deploy opcional').matched, true);
  });

  it('não casa seção ausente e é idempotente', () => {
    assert.equal(dropSection(DOC, '^Observabilidade').matched, false);
    const once = dropSection(DOC, '^Captcha');
    const twice = dropSection(once.content, '^Captcha');
    assert.equal(twice.matched, false);
    assert.equal(twice.content, once.content);
  });
});

describe('dropBullet', () => {
  it('leva as linhas de continuação do bullet', () => {
    // Os bullets do boilerplate quebram em três linhas indentadas. Remover só a primeira
    // deixa o resto da frase como parágrafo solto, gramaticalmente órfão.
    const out = dropBullet(DOC, 'Não ligar OAuth só de um lado');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('Não ligar OAuth'));
    assert.ok(!out.content.includes('listam os mesmos nomes'));
    assert.ok(!out.content.includes('`PUBLIC_SIGNUP_ENABLED`.'));

    // Os bullets vizinhos ficam inteiros.
    assert.ok(out.content.includes('Não logar segredos, tokens ou senhas.'));
    assert.ok(out.content.includes('Não expor `CAPTCHA_SECRET_KEY`'));
    assert.ok(out.content.includes('Não subir produção com `QUEUE_DRIVER=memory`.'));
  });

  it('não casa bullet ausente e é idempotente', () => {
    assert.equal(dropBullet(DOC, 'Não usar `alert`').matched, false);
    const once = dropBullet(DOC, 'Não subir produção');
    const twice = dropBullet(once.content, 'Não subir produção');
    assert.equal(twice.matched, false);
  });
});

describe('dropTableRow', () => {
  it('tira a linha da feature e preserva cabeçalho, separador e irmãs', () => {
    const out = dropTableRow(DOC, '\\| Captcha \\|');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('CaptchaProvider` | `CAPTCHA_DRIVER'));
    assert.ok(out.content.includes('| Recurso | Port | Env |'), 'o cabeçalho fica');
    assert.ok(out.content.includes('| --- | --- | --- |'), 'o separador fica');
    assert.ok(out.content.includes('| Storage |'));
    assert.ok(out.content.includes('| Jobs |'));
  });

  it('nunca leva o separador, mesmo com padrão frouxo', () => {
    // Um padrão que casasse o separador transformaria a tabela num parágrafo de pipes.
    const out = dropTableRow(DOC, '\\|');
    assert.ok(out.content.includes('| --- | --- | --- |'));
    assert.ok(out.content.includes('| Recurso | Port | Env |'));
  });

  it('não casa tabela sem a linha', () => {
    assert.equal(dropTableRow(DOC, '\\| Webhooks \\|').matched, false);
  });
});
