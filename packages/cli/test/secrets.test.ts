import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateSecrets,
  hexSecret,
  objectStorageKeyPair,
  seedPassword,
  urlSafePassword,
} from '../src/secrets.ts';
import { makeNames } from './support.ts';

const names = makeNames();

describe('hexSecret', () => {
  it('passa com folga o min(16) que faz o boot falhar', () => {
    // `envSchema` exige min(16) em JWT_ACCESS_SECRET, JWT_REFRESH_SECRET e CSRF_SECRET;
    // menos que isso é uma das 10 condições que fazem `validateEnv` recusar subir.
    const secret = hexSecret();
    assert.equal(secret.length, 64);
    assert.ok(secret.length >= 16);
    assert.match(secret, /^[0-9a-f]+$/);
  });

  it('não precisa de aspas em .env nem em YAML', () => {
    // Hex não tem `+`, `/`, `=`, `#` nem espaço: atravessa `.env`, `environment:` do
    // compose e argumento de shell sem quoting — e sem parser nenhum reinterpretá-lo.
    for (let i = 0; i < 200; i += 1) {
      assert.doesNotMatch(hexSecret(), /[\s#"'$`\\]/);
    }
  });

  it('duas chamadas diferem', () => {
    assert.notEqual(hexSecret(), hexSecret());
  });
});

describe('urlSafePassword', () => {
  it('nunca contém caractere que quebre o parse de uma URL de conexão', () => {
    // O teste mais forte possível: não checar uma lista de caracteres proibidos, e sim
    // montar a URL de conexão de verdade e exigir que o parser devolva a MESMA senha.
    // `@` encerraria o userinfo, `:` separaria usuário de senha, `/` `?` `#` encerrariam
    // a autoridade — e o sintoma seria o Prisma conectando em outro host.
    for (let i = 0; i < 1000; i += 1) {
      const password = urlSafePassword();
      const url = new URL(`postgresql://acme_corp_app:${password}@localhost:4202/acme_corp`);
      assert.equal(url.password, password, `senha mutilada pelo parse: ${password}`);
      assert.equal(url.hostname, 'localhost');
      assert.equal(url.port, '4202');
      assert.equal(url.pathname, '/acme_corp');
    }
  });

  it('é segura também como literal SQL e como argumento de shell', () => {
    // A mesma senha vai para `CREATE ROLE … PASSWORD '…'` na baseline e para o
    // `mc alias set` dentro do entrypoint do compose. Aspas simples fechariam a string
    // SQL; um `-` inicial seria lido como flag pelo `mc`.
    for (let i = 0; i < 1000; i += 1) {
      const password = urlSafePassword();
      assert.match(password, /^[A-Za-z0-9]+$/);
      assert.doesNotMatch(password, /^-/);
    }
  });

  it('tem entropia: mil senhas, mil valores', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) seen.add(urlSafePassword());
    assert.equal(seen.size, 1000);
  });

  it('respeita o comprimento pedido', () => {
    assert.equal(urlSafePassword(8).length, 8);
    assert.equal(urlSafePassword(64).length, 64);
  });
});

describe('seedPassword', () => {
  it('sempre passa o passwordSchema do boilerplate', () => {
    // 8..128 com minúscula, maiúscula e dígito (packages/shared/src/primitives.ts).
    // Sortear alfanumérico e torcer falharia em ~1 de alguns milhares de projetos, e o
    // sintoma seria o `db:seed` recusando a própria senha no ÚLTIMO passo do setup,
    // depois de o usuário esperar o install inteiro.
    for (let i = 0; i < 500; i += 1) {
      const password = seedPassword();
      assert.ok(password.length >= 8 && password.length <= 128);
      assert.match(password, /[a-z]/);
      assert.match(password, /[A-Z]/);
      assert.match(password, /[0-9]/);
      // Vai para um literal de aspas simples no seed.ts e para o terminal.
      assert.match(password, /^[A-Za-z0-9]+$/);
    }
  });

  it('duas chamadas diferem', () => {
    assert.notEqual(seedPassword(), seedPassword());
  });
});

describe('objectStorageKeyPair', () => {
  it('cabe nos mínimos do MinIO e imita o formato da AWS', () => {
    // MINIO_ROOT_USER >= 3 e MINIO_ROOT_PASSWORD >= 8, ou o container recusa subir.
    const { accessKey, secretKey } = objectStorageKeyPair();
    assert.equal(accessKey.length, 20);
    assert.equal(secretKey.length, 40);
    assert.match(accessKey, /^[A-Za-z0-9]+$/);
    assert.match(secretKey, /^[A-Za-z0-9]+$/);
  });
});

describe('generateSecrets', () => {
  it('os três segredos obrigatórios são distintos e válidos', () => {
    const secrets = generateSecrets(names);
    const trio = [secrets.jwtAccessSecret, secrets.jwtRefreshSecret, secrets.csrfSecret];
    for (const secret of trio) assert.ok(secret.length >= 16);
    assert.equal(new Set(trio).size, 3);
  });

  it('access e refresh nunca são o mesmo valor', () => {
    // Com o mesmo segredo nos dois, um access token expirado passaria pelo verificador
    // de refresh, e a rotação com detecção de reuso ganharia um bypass.
    for (let i = 0; i < 100; i += 1) {
      const secrets = generateSecrets(names);
      assert.notEqual(secrets.jwtAccessSecret, secrets.jwtRefreshSecret);
    }
  });

  it('a credencial do Postgres local segue a convenção que o harness de e2e embute', () => {
    // apps/api/test/e2e-setup.ts, global-setup.ts e tenant-isolation.e2e-spec.ts
    // embutem `postgresql://<role>:<role>@localhost:4202/<base>`. O motor de rename só
    // troca o NOME; não há por onde esses arquivos aprenderem uma senha sorteada. Uma
    // senha aleatória aqui deixa o `pnpm test:e2e` do projeto gerado falhando no
    // connect — e o teste que ele derruba é justamente o que prova o isolamento entre
    // empresas, que é o lastro do argumento de segurança do produto.
    const secrets = generateSecrets(names);
    assert.equal(secrets.dbAppPassword, names.dbRole);
    assert.equal(secrets.dbOwnerPassword, names.dbName);
  });

  it('o modo random sorteia as duas senhas do banco', () => {
    const secrets = generateSecrets(names, { dbCredentials: 'random' });
    assert.notEqual(secrets.dbAppPassword, names.dbRole);
    assert.notEqual(secrets.dbOwnerPassword, names.dbName);
    assert.match(secrets.dbAppPassword, /^[A-Za-z0-9]{24}$/);
  });

  it('duas gerações não compartilham segredo nenhum', () => {
    const a = generateSecrets(names);
    const b = generateSecrets(names);
    assert.notEqual(a.jwtAccessSecret, b.jwtAccessSecret);
    assert.notEqual(a.csrfSecret, b.csrfSecret);
    assert.notEqual(a.s3SecretKey, b.s3SecretKey);
    assert.notEqual(a.seedAdminPassword, b.seedAdminPassword);
  });
});
