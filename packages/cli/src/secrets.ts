/**
 * Geração de segredos.
 *
 * Um gerador que copia o `.env.example` entrega um projeto que sobe com segredos
 * públicos: a única validação do boilerplate é `min(16)`, e
 * `dev-access-secret-change-me-aaaa…` (40 chars) passa. Então os segredos nascem aqui,
 * um por chamada, e o `.env` recebe valor novo a cada projeto gerado.
 *
 * Este módulo é o ÚNICO lugar que produz aleatoriedade no gerador. Duas razões:
 * o motor de rename e o escritor de `.env` precisam da MESMA senha do admin do seed
 * (um a grava no `seed.ts`, o outro a imprime para o usuário), e uma função de segredo
 * duplicada é uma função que vai divergir em formato — e formato aqui é requisito de
 * consumidor, não estética.
 */

import { randomBytes } from 'node:crypto';

import type { NameForms } from './types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Alfabetos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Alfabeto das senhas: letras e dígitos, e nada mais.
 *
 * A escolha é entre "escapar corretamente" e "não precisar escapar", e a mesma senha
 * atravessa QUATRO regras de escape diferentes antes de alguém digitar `pnpm dev`:
 *
 *   1. `postgresql://role:SENHA@host:5432/db` — userinfo de URL. `@` encerra o
 *      userinfo, `:` separa usuário de senha, `/` `?` `#` encerram a autoridade. Uma
 *      senha com qualquer um deles faz o Prisma conectar em outro lugar (ou falhar com
 *      uma mensagem sobre host inválido, que não aponta para a senha).
 *   2. `POSTGRES_PASSWORD: SENHA` — YAML do compose. `#` inicia comentário, `:` e `{`
 *      mudam o tipo do nó.
 *   3. `CREATE ROLE x LOGIN PASSWORD 'SENHA'` — literal SQL na baseline. `'` fecha a
 *      string.
 *   4. `mc alias set local http://minio:9000 USER SENHA` — argumento de shell dentro do
 *      `entrypoint` do compose.
 *
 * Acertar os quatro escapes é possível; acertá-los e manter acertado quando alguém
 * mexer num dos quatro geradores, não. Um alfabeto que não exige nenhum escape custa
 * ~0,08 bit por caractere contra base64url e é compensado com folga pelo comprimento:
 * 24 caracteres de `[A-Za-z0-9]` são ~143 bits.
 *
 * Corolário: a senha também nunca começa com `-`, que em posição de argumento de shell
 * seria lida como flag pelo `mc`.
 */
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGIT = '0123456789';

// ─────────────────────────────────────────────────────────────────────────────
// Primitivas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sorteia `length` caracteres de `alphabet` sem viés de módulo.
 *
 * `randomBytes(n)[i] % 62` parece inofensivo e não é: 256 não é múltiplo de 62, então
 * os 8 primeiros símbolos do alfabeto sairiam com probabilidade 5/256 e os outros 54
 * com 4/256 — 25% mais frequentes. Não quebra nada hoje, mas é exatamente o tipo de
 * erro que some num code review e reaparece num writeup de quem quebrou a senha.
 * Rejeição por amostragem custa alguns bytes extras e elimina o viés.
 */
function randomFrom(alphabet: string, length: number): string {
  const n = alphabet.length;
  // Maior múltiplo de n que cabe em um byte: bytes acima disso são descartados.
  const limit = Math.floor(256 / n) * n;
  let out = '';
  while (out.length < length) {
    // Pede com folga para não voltar ao kernel a cada rejeição.
    const bytes = randomBytes((length - out.length) * 2 + 8);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out += alphabet[byte % n];
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * Segredo em hexadecimal.
 *
 * 32 bytes → 64 caracteres, o dobro do `min(16)` que o `envSchema` exige. Hex e não
 * base64 porque o valor vai para um `.env` e para `environment:` de YAML sem aspas:
 * `[0-9a-f]` não tem `+`, `/`, `=` nem `#`, então nunca precisa de quoting e nunca é
 * reinterpretado por um parser no caminho.
 */
export function hexSecret(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Senha segura para URL de conexão, YAML, literal SQL e argumento de shell.
 *
 * 24 caracteres alfanuméricos (~143 bits). Ver o comentário de `ALNUM` para o porquê
 * do alfabeto — a decisão foi "alfabeto URL-safe", não "escapar".
 */
export function urlSafePassword(length = 24): string {
  return randomFrom(ALNUM, length);
}

/**
 * Chave de acesso de object storage, no formato que o MinIO e a AWS aceitam.
 *
 * O MinIO exige `MINIO_ROOT_USER` com pelo menos 3 caracteres e
 * `MINIO_ROOT_PASSWORD` com pelo menos 8; ficamos bem acima dos dois. O formato imita
 * o da AWS (20/40) para que trocar o MinIO por S3 de verdade seja só trocar os valores.
 */
export function objectStorageKeyPair(): { accessKey: string; secretKey: string } {
  return { accessKey: randomFrom(ALNUM, 20), secretKey: randomFrom(ALNUM, 40) };
}

/**
 * Senha do admin criado pelo seed.
 *
 * Tem de passar o `passwordSchema` do boilerplate (`packages/shared/src/primitives.ts`:
 * 8..128 caracteres, com minúscula, maiúscula E dígito) — senão o `db:seed` falha na
 * própria validação, no ÚLTIMO passo do setup, depois de o usuário ter esperado o
 * install inteiro. Sortear alfanumérico e torcer não serve: em 20 caracteres a chance
 * de faltar uma das três classes é pequena, mas não é zero, e um gerador que falha em
 * 1 de 5 mil projetos é um gerador com um bug intermitente impossível de reproduzir.
 * Então as três classes são garantidas por construção, em posições sorteadas.
 *
 * Também precisa sobreviver como literal TypeScript de aspas simples no `seed.ts` (o
 * motor de rename a escreve lá) e como texto impresso no terminal: alfanumérico
 * resolve os dois sem escape.
 */
export function seedPassword(length = 20): string {
  const chars = randomFrom(ALNUM, length).split('');
  const guaranteed = [randomFrom(UPPER, 1), randomFrom(LOWER, 1), randomFrom(DIGIT, 1)];

  // Posições distintas, sorteadas: fixar "maiúscula no índice 0, dígito no 1" tornaria
  // o formato previsível, o que reduz o espaço de busca de quem já sabe que o projeto
  // foi gerado por esta ferramenta.
  const positions = new Set<number>();
  while (positions.size < guaranteed.length) {
    positions.add(randomBytes(1)[0]! % length);
  }

  for (const [i, position] of [...positions].entries()) {
    chars[position] = guaranteed[i]!;
  }

  return chars.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// O conjunto que o projeto gerado precisa
// ─────────────────────────────────────────────────────────────────────────────

export interface GeneratedSecrets {
  /** `JWT_ACCESS_SECRET` — 64 chars hex. */
  jwtAccessSecret: string;
  /** `JWT_REFRESH_SECRET` — 64 chars hex, DIFERENTE do de access. */
  jwtRefreshSecret: string;
  /** `CSRF_SECRET` — 64 chars hex. */
  csrfSecret: string;
  /** Senha do owner do Postgres (`POSTGRES_PASSWORD`, `DATABASE_ADMIN_URL`). */
  dbOwnerPassword: string;
  /** Senha da role restrita (`CREATE ROLE … PASSWORD`, `DATABASE_URL`). */
  dbAppPassword: string;
  /** `S3_ACCESS_KEY` ↔ `MINIO_ROOT_USER` ↔ `mc alias set`. */
  s3AccessKey: string;
  /** `S3_SECRET_KEY` ↔ `MINIO_ROOT_PASSWORD` ↔ `mc alias set`. */
  s3SecretKey: string;
  /** Senha do admin do seed — impressa para o usuário e gravada no `seed.ts`. */
  seedAdminPassword: string;
}

/**
 * Como nascem as credenciais do Postgres LOCAL.
 *
 * `convention` reproduz o boilerplate: senha igual ao nome da role. `random` sorteia.
 * O default é `convention`, e a razão é específica e verificável — ver
 * `generateSecrets`.
 */
export type DbCredentialMode = 'convention' | 'random';

export interface SecretOptions {
  dbCredentials?: DbCredentialMode;
}

/**
 * Gera o conjunto completo para uma geração.
 *
 * **Por que as senhas do Postgres seguem a convenção `senha = nome da role` por
 * padrão.** Três arquivos do harness de e2e do boilerplate embutem a URL de conexão
 * como literal — `apps/api/test/e2e-setup.ts`, `apps/api/test/global-setup.ts` e
 * `apps/api/test/tenant-isolation.e2e-spec.ts` — na forma
 * `postgresql://<role>:<role>@localhost:4202/<base>`. O motor de rename substitui
 * ocorrências textuais do nome, então depois do rename esses arquivos continuam
 * pedindo `senha == nome da role`, e não há por onde eles aprenderem uma senha
 * sorteada. Sortear aqui deixaria o `test:e2e` do projeto gerado falhando no
 * `connect` — e o `tenant-isolation.e2e-spec.ts` é justamente o teste que prova o
 * isolamento entre empresas, ou seja, o lastro do argumento de segurança que o produto
 * vende. Trocar "a prova de que o RLS funciona" por "entropia num Postgres de
 * container, escutando em localhost, com dados descartáveis" é um mau negócio.
 *
 * O `.env` gerado marca as duas URLs como credencial LOCAL e manda trocá-las em
 * produção, onde o Postgres é gerenciado e a senha vem do provedor — nunca desta
 * função. `random` existe para quando o chamador quiser justamente isso, e nesse caso
 * é dele a responsabilidade de reescrever os três arquivos do e2e.
 *
 * Os segredos que NÃO são embutidos por teste nenhum (JWT, CSRF, MinIO, seed) são
 * sempre sorteados: ali não há nada a perder.
 */
export function generateSecrets(names: NameForms, options: SecretOptions = {}): GeneratedSecrets {
  const mode = options.dbCredentials ?? 'convention';
  const { accessKey, secretKey } = objectStorageKeyPair();

  return {
    jwtAccessSecret: hexSecret(32),
    // Valor distinto do de access, e não é detalhe: com o mesmo segredo nos dois, um
    // access token expirado seria aceito como refresh token pelo verificador, e a
    // rotação com detecção de reuso — o mecanismo que revoga a família inteira quando
    // um token é roubado — passaria a ter um bypass.
    jwtRefreshSecret: hexSecret(32),
    csrfSecret: hexSecret(32),
    dbOwnerPassword: mode === 'random' ? urlSafePassword() : names.dbName,
    dbAppPassword: mode === 'random' ? urlSafePassword() : names.dbRole,
    s3AccessKey: accessKey,
    s3SecretKey: secretKey,
    seedAdminPassword: seedPassword(),
  };
}

/** Os nomes das chaves geradas, para o `GenerationReport.secretsGenerated`. */
export function generatedSecretKeys(): string[] {
  return [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'CSRF_SECRET',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
    'POSTGRES_PASSWORD',
    'DATABASE_URL (senha da role restrita)',
    'senha do admin do seed',
  ];
}
