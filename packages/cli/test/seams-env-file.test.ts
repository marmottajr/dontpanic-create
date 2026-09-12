/**
 * Testes do editor de `.env.example`.
 *
 * O `.env.example` do boilerplate não é uma lista de chaves: é documentação executável,
 * com um parágrafo explicando cada variável e a armadilha dela. Remover só a linha `KEY=`
 * deixa o parágrafo órfão — e quem lê um `.env.example` está tentando descobrir o que
 * precisa configurar, então prosa fantasma ali custa uma hora procurando por uma variável
 * que o projeto não lê.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dropEnvKey, dropEnvSection, setEnvValue } from '../src/seams/env-file.ts';

/** Réplica reduzida do `.env.example`, com a forma que importa: régua, título, prosa. */
const ENV = [
  '# ─────────────────────────────────────────────────────────────',
  '# Banco de dados',
  '# ─────────────────────────────────────────────────────────────',
  '# A aplicação conecta pela role RESTRITA; migration e seed pelo dono.',
  'DATABASE_URL=postgresql://app:app@localhost:4202/dp',
  'DATABASE_ADMIN_URL=postgresql://owner:owner@localhost:4202/dp',
  '',
  '# ─────────────────────────────────────────────────────────────',
  '# Social sign-in (OAuth)  --  desligado por padrão',
  '# ─────────────────────────────────────────────────────────────',
  '# Lista separada por vírgula. Vazia = nenhum botão na tela de login.',
  '# A API recusa subir se um provider listado estiver sem credencial.',
  'OAUTH_PROVIDERS=',
  '# Tem de bater caractere a caractere com o redirect URI registrado.',
  'OAUTH_CALLBACK_BASE_URL=',
  '# PEM do .p8 da Apple, multi-linha.',
  'OAUTH_APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----',
  'MIGTAgEAMBMGByqG',
  '-----END PRIVATE KEY-----"',
  '',
  '# ─────────────────────────────────────────────────────────────',
  '# Quem pode entrar',
  '# ─────────────────────────────────────────────────────────────',
  '# Desligado, sobram o convite e o seed.',
  'PUBLIC_SIGNUP_ENABLED=true',
  '# A metade pública precisa concordar, ou todo submit dá 403.',
  'NEXT_PUBLIC_SIGNUP_ENABLED=true',
].join('\n');

describe('dropEnvKey', () => {
  it('leva o comentário que descrevia a variável', () => {
    const out = dropEnvKey(ENV, 'OAUTH_CALLBACK_BASE_URL');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('OAUTH_CALLBACK_BASE_URL'));
    assert.ok(
      !out.content.includes('caractere a caractere'),
      'o parágrafo que explicava a variável sai com ela',
    );
    // E não come o comentário da variável ANTERIOR.
    assert.ok(out.content.includes('Vazia = nenhum botão'));
    assert.ok(out.content.includes('OAUTH_PROVIDERS='));
  });

  it('não come a régua de seção — ela pertence à seção, não à variável', () => {
    // Comer a régua deixaria a próxima variável sem cabeçalho, e o arquivo vira uma
    // lista corrida onde hoje há seções.
    const out = dropEnvKey(ENV, 'DATABASE_URL');
    assert.equal(out.matched, true);
    assert.ok(out.content.includes('# Banco de dados'));
    assert.ok(out.content.match(/─{10}/), 'a régua fica');
  });

  it('leva o valor multi-linha entre aspas junto', () => {
    // A `.p8` da Apple é PEM: três linhas. Deixar as duas últimas produz linhas soltas
    // que o parser de `.env` interpreta como chaves malformadas.
    const out = dropEnvKey(ENV, 'OAUTH_APPLE_PRIVATE_KEY');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('BEGIN PRIVATE KEY'));
    assert.ok(!out.content.includes('MIGTAgEAMBMGByqG'));
    assert.ok(!out.content.includes('END PRIVATE KEY'));
  });

  it('remove TODAS as ocorrências, incluindo a metade NEXT_PUBLIC', () => {
    const out = dropEnvKey(ENV, 'NEXT_PUBLIC_SIGNUP_ENABLED');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('NEXT_PUBLIC_SIGNUP_ENABLED'));
    // E o prefixo não confunde: `PUBLIC_SIGNUP_ENABLED` é outra chave.
    assert.ok(out.content.includes('PUBLIC_SIGNUP_ENABLED=true'));
  });

  it('não casa chave ausente e é idempotente', () => {
    assert.equal(dropEnvKey(ENV, 'SMTP_HOST').matched, false);
    const once = dropEnvKey(ENV, 'OAUTH_PROVIDERS');
    const twice = dropEnvKey(once.content, 'OAUTH_PROVIDERS');
    assert.equal(twice.matched, false);
    assert.equal(twice.content, once.content);
  });
});

describe('dropEnvSection', () => {
  it('apaga a seção inteira, régua e prosa inclusive, e para na seguinte', () => {
    const out = dropEnvSection(ENV, '^#\\s+Social sign-in');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('OAUTH_PROVIDERS'));
    assert.ok(!out.content.includes('PRIVATE KEY'));
    assert.ok(!out.content.includes('Social sign-in'));
    // As seções vizinhas sobrevivem intactas, cabeçalho incluído.
    assert.ok(out.content.includes('# Banco de dados'));
    assert.ok(out.content.includes('DATABASE_ADMIN_URL='));
    assert.ok(out.content.includes('# Quem pode entrar'));
    assert.ok(out.content.includes('PUBLIC_SIGNUP_ENABLED=true'));
  });

  it('casa o cabeçalho com prosa depois do título', () => {
    // A armadilha nº 1 deste arquivo: TODAS as seções levam uma frase explicativa na
    // própria linha do título, então uma âncora `^# Captcha\\s*$` nunca casa.
    const out = dropEnvSection(ENV, '^#\\s+Social sign-in\\b');
    assert.equal(out.matched, true);
  });

  it('não casa seção ausente', () => {
    assert.equal(dropEnvSection(ENV, '^#\\s+Observabilidade').matched, false);
  });
});

describe('setEnvValue', () => {
  it('reescreve o valor sem tocar o comentário', () => {
    // I11: em single-tenant, as DUAS metades do par de signup vão para `false`. Escrever
    // só uma dá um formulário que renderiza e responde 403 em todo submit.
    let out = setEnvValue(ENV, 'PUBLIC_SIGNUP_ENABLED', 'false');
    assert.equal(out.matched, true);
    out = setEnvValue(out.content, 'NEXT_PUBLIC_SIGNUP_ENABLED', 'false');
    assert.equal(out.matched, true);

    assert.ok(out.content.includes('PUBLIC_SIGNUP_ENABLED=false'));
    assert.ok(out.content.includes('NEXT_PUBLIC_SIGNUP_ENABLED=false'));
    assert.ok(!out.content.includes('=true'));
    assert.ok(out.content.includes('sobram o convite e o seed'), 'o comentário fica');
  });

  it('é idempotente e não casa chave ausente', () => {
    const once = setEnvValue(ENV, 'PUBLIC_SIGNUP_ENABLED', 'false');
    const twice = setEnvValue(once.content, 'PUBLIC_SIGNUP_ENABLED', 'false');
    assert.equal(twice.content, once.content);
    assert.equal(setEnvValue(ENV, 'NOPE', 'x').matched, false);
  });
});
