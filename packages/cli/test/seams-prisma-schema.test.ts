/**
 * Testes da poda do schema Prisma.
 *
 * A asserção central é a da RELAÇÃO ÓRFÃ. Apagar `model OAuthAccount` e esquecer o
 * `oauthAccounts OAuthAccount[]` em `Tenant` faz o `prisma generate` falhar culpando
 * `Tenant`, onde não há nada de errado — e a falha aparece no `db:migrate` do projeto
 * gerado, depois do `pnpm install`, muitos minutos depois da geração. Detectar antes de
 * escrever, nomeando o tipo que SAIU, é a diferença entre cinco minutos e uma tarde.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertNoOrphanRelations,
  declaredTypes,
  dropBlocks,
  dropEnumValue,
  dropFields,
  findOrphanRelations,
  parseBlocks,
  tightenField,
} from '../src/seams/prisma-schema.ts';
import { SeamStructureError } from '../src/seams/result.ts';

const TENANCY = `
enum Role {
  SUPERADMIN
  ADMIN
  USER
}

/// Uma empresa. O \`tenantId\` de toda linha de negócio aponta para cá.
model Tenant {
  id            String         @id @default(cuid())
  slug          String         @unique
  users         User[]
  oauthAccounts OAuthAccount[]

  @@map("tenants")
}

model User {
  id       String  @id @default(cuid())
  tenantId String?
  tenant   Tenant? @relation(fields: [tenantId], references: [id])
  email    String

  /// Nulo para conta que só entra por provider social. O login com senha numa conta
  /// dessas falha com o erro genérico de credencial inválida.
  passwordHash String?
  role         Role    @default(USER)

  oauthAccounts OAuthAccount[]

  @@unique([tenantId, email])
  @@map("users")
}
`;

const OAUTH = `
enum OAuthProviderName {
  GOOGLE
  APPLE
  GITHUB
}

model OAuthAccount {
  id       String @id @default(cuid())
  tenantId String?
  tenant   Tenant? @relation(fields: [tenantId], references: [id])
  userId   String
  user     User   @relation(fields: [userId], references: [id])
  provider OAuthProviderName
  providerAccountId String

  @@unique([provider, providerAccountId])
  @@unique([userId, provider])
  @@map("oauth_accounts")
}
`;

describe('parseBlocks / declaredTypes', () => {
  it('acha models e enums e anexa o doc-comment ao bloco', () => {
    const blocks = parseBlocks(TENANCY);
    const tenant = blocks.find((block) => block.name === 'Tenant');
    assert.ok(tenant);
    assert.equal(tenant.kind, 'model');
    // O comentário `///` acima do model entra no span: apagar o model e deixar o
    // comentário produz documentação de um model fantasma.
    assert.ok(tenant.text.includes('Uma empresa.'));
  });

  it('lista o universo de tipos válidos', () => {
    const types = declaredTypes(`${TENANCY}\n${OAUTH}`);
    assert.ok(types.has('Tenant'));
    assert.ok(types.has('OAuthAccount'));
    assert.ok(types.has('OAuthProviderName'));
    assert.ok(!types.has('String'));
  });
});

describe('dropBlocks', () => {
  it('apaga model e enum inteiros, comentários inclusive', () => {
    const out = dropBlocks(OAUTH, ['OAuthAccount', 'OAuthProviderName']);
    assert.equal(out.matched, true);
    assert.equal(out.changes, 2);
    assert.ok(!out.content.includes('OAuthAccount'));
    assert.ok(!out.content.includes('GOOGLE'));
  });

  it('não casa quando o bloco já não existe', () => {
    const out = dropBlocks(OAUTH, ['WebhookDelivery']);
    assert.equal(out.matched, false);
    assert.equal(out.content, OAUTH);
  });

  it('é idempotente', () => {
    const once = dropBlocks(OAUTH, ['OAuthAccount']);
    const twice = dropBlocks(once.content, ['OAuthAccount']);
    assert.equal(twice.matched, false);
  });
});

describe('relação órfã', () => {
  it('DETECTA o campo que ficou apontando para o model removido', () => {
    // Este é o teste que o gerador existe para ter. `oauth.prisma` foi apagado inteiro e
    // ninguém tirou as duas relações inversas de `tenancy.prisma`.
    const orphans = findOrphanRelations([TENANCY]);
    const names = orphans.map((orphan) => `${orphan.model}.${orphan.field}`);
    assert.ok(names.includes('Tenant.oauthAccounts'));
    assert.ok(names.includes('User.oauthAccounts'));
    assert.equal(orphans[0]?.missingType, 'OAuthAccount');
  });

  it('FALHA a geração nomeando o tipo que saiu, não o model que sobrou', () => {
    // O erro do Prisma culparia `Tenant`. A mensagem precisa dizer "OAuthAccount foi
    // removido" — é a informação que orienta o conserto.
    assert.throws(
      () => assertNoOrphanRelations([TENANCY]),
      (error: unknown) => {
        assert.ok(error instanceof SeamStructureError);
        assert.match(error.message, /OAuthAccount/);
        assert.match(error.message, /Tenant\.oauthAccounts/);
        assert.match(error.message, /dropFields/);
        return true;
      },
    );
  });

  it('não acusa relação entre ARQUIVOS diferentes da mesma pasta de schema', () => {
    // O boilerplate usa uma pasta de schema com 5 arquivos, e `tenancy.prisma`
    // referencia um enum de `oauth.prisma`. Checar arquivo por arquivo acusaria toda
    // relação entre arquivos — o falso positivo que faria alguém desligar a checagem.
    assert.doesNotThrow(() => assertNoOrphanRelations([TENANCY, OAUTH]));
  });

  it('passa quando a poda foi completa', () => {
    const pruned = dropFields(TENANCY, 'Tenant', ['oauthAccounts']);
    const both = dropFields(pruned.content, 'User', ['oauthAccounts']);
    assert.doesNotThrow(() => assertNoOrphanRelations([both.content]));
  });
});

describe('dropFields', () => {
  it('remove o campo E os atributos de bloco que o citam', () => {
    // Um `@@unique([tenantId, email])` cujo campo saiu faz o Prisma recusar o schema
    // inteiro — então remover campo é sempre duas operações.
    const out = dropFields(TENANCY, 'User', ['tenantId']);
    assert.equal(out.matched, true);
    assert.ok(!/^\s*tenantId/m.test(out.content.split('model User')[1] ?? ''));
    assert.ok(!out.content.includes('@@unique([tenantId, email])'));
    assert.ok(out.content.includes('@@map("users")'), 'os outros atributos ficam');
  });

  it('mexe só no model pedido', () => {
    const out = dropFields(TENANCY, 'User', ['id']);
    assert.equal(out.matched, true);
    const tenantBlock = parseBlocks(out.content).find((block) => block.name === 'Tenant');
    assert.ok(tenantBlock?.text.includes('id            String'), 'Tenant.id sobrevive');
  });

  it('não casa quando o model não existe', () => {
    const out = dropFields(TENANCY, 'Webhook', ['id']);
    assert.equal(out.matched, false);
  });

  it('é idempotente', () => {
    const once = dropFields(TENANCY, 'Tenant', ['oauthAccounts']);
    const twice = dropFields(once.content, 'Tenant', ['oauthAccounts']);
    assert.equal(twice.matched, false);
  });
});

describe('tightenField', () => {
  it('aperta opcional para obrigatório — o caso do passwordHash sem oauth', () => {
    // O mapa provou que o ÚNICO escritor de `null` era `oauth.service.ts:474`. Deixar
    // opcional COMPILA, e é por isso que é o perigo: sobra a maquinaria de equalização de
    // tempo do `ABSENT_PASSWORD_HASH` sem nenhuma conta que ela possa descrever.
    const out = tightenField(TENANCY, 'User', 'passwordHash');
    assert.equal(out.matched, true);
    assert.match(out.content, /passwordHash String\b/);
    assert.ok(!/passwordHash String\?/.test(out.content));
    // Só o `?`: o comentário que explicava a nullability é outra costura, visível no
    // relatório, em vez de efeito colateral invisível deste.
    assert.ok(out.content.includes('Nulo para conta que só entra'));
  });

  it('não mexe em outro campo opcional do mesmo model', () => {
    const out = tightenField(TENANCY, 'User', 'passwordHash');
    assert.ok(out.content.includes('tenantId String?'), 'User.tenantId continua opcional');
  });

  it('recusa apertar campo que já é obrigatório — e isso FALHA a costura', () => {
    // Devolver "não casou" aqui é o comportamento certo: num manifesto `required`, avisa
    // que o boilerplate mudou a nullability sozinho, que é exatamente quando não se deve
    // seguir adiante presumindo.
    const once = tightenField(TENANCY, 'User', 'passwordHash');
    const twice = tightenField(once.content, 'User', 'passwordHash');
    assert.equal(twice.matched, false);
  });
});

describe('dropEnumValue', () => {
  it('tira SUPERADMIN e deixa o resto do enum', () => {
    const out = dropEnumValue(TENANCY, 'Role', 'SUPERADMIN');
    assert.equal(out.matched, true);
    assert.ok(!out.content.includes('SUPERADMIN'));
    assert.ok(out.content.includes('ADMIN'));
    assert.ok(out.content.includes('USER'));
    // O enum continua existindo: `Role` é usado por `User.role`.
    assert.ok(out.content.includes('enum Role'));
  });

  it('não casa valor ausente, e é idempotente', () => {
    const once = dropEnumValue(TENANCY, 'Role', 'SUPERADMIN');
    const twice = dropEnumValue(once.content, 'Role', 'SUPERADMIN');
    assert.equal(twice.matched, false);
  });
});
