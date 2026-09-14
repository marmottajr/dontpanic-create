import { generate } from 'otplib';
import { hash } from 'argon2';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createE2EApp, closeOwnerDb, ownerDb, resetDb } from './e2e-app';
import { E2EClient } from './e2e-client';
import { sha256 } from '../src/modules/auth/support/crypto.util';
import { provisionTenant } from '../src/modules/tenants/support/tenant-provisioning';

/**
 * Full-stack auth E2E against a REAL Postgres (`dontpanic_e2e`). The app is
 * booted from AppModule with the production cookie/csrf wiring; every request
 * goes through Fastify -> guards -> Zod pipe -> services -> Prisma -> Postgres.
 *
 * We exercise the genuine double-submit CSRF path (token fetched, cookie +
 * header echoed) and the httpOnly cookie session: login sets `access_token` /
 * `refresh_token`, /users/me reads them, refresh rotates them, logout clears.
 *
 * Contas nascem SEMEADAS pela conexão de dono, e não por `POST /auth/signup`.
 *
 * Este projeto não tem registro público: as portas de entrada são o seed, o
 * painel do operador e o convite. A versão original desta suíte fazia nascer
 * toda conta pelo signup — sem ele, cada teste morria no primeiro request com
 * 404, e nenhum pelo motivo que verifica. Semear pelo `ownerDb()` é o que
 * `tenant-isolation.e2e-spec.ts` já faz, e pelo mesmo motivo: a role restrita
 * da app não cria linha para um tenant em que não está escopada.
 *
 * A empresa sai de `provisionTenant`, o MESMO helper que o seed e o painel
 * usam, e não de um `tenant.create` escrito à mão: é o que garante que a
 * empresa semeada aqui tem os perfis e permissões que uma empresa de verdade
 * teria, e que esta suíte acompanha o helper quando ele muda. Um usuário sem
 * empresa seria recusado pelo `TenantStatusGuard` no primeiro request.
 *
 * O que saiu, e por quê: os testes de conflito e validação do CORPO do signup
 * (e-mail repetido, slug ocupado ou reservado, senha fraca, termos recusados)
 * testavam uma rota que não existe aqui. No lugar deles entra um teste que
 * prova que a porta está fechada de verdade. O teste de CSRF usava o signup
 * como rota insegura qualquer; agora usa o login, que tem o mesmo guard.
 */
describe('Auth & Users (e2e)', () => {
  let app: NestFastifyApplication;

  const STRONG_PASSWORD = 'Sup3rSecret!';
  const NEW_PASSWORD = 'Even5tronger!';

  /**
   * Prefix on every slug and e-mail this suite creates.
   *
   * The suites share one database and hand it back empty (see the isolation
   * contract at the top of `test/e2e-app.ts`). The prefix is what makes a row
   * that escaped anyway point straight at the suite that left it, instead of
   * failing somewhere else as an unexplained duplicate.
   */
  const SUITE = 'authe2e';

  /** Código de verificação conhecido: só o hash dele vai para o banco. */
  const VERIFICATION_CODE = '123456';

  /** Rows read directly go through the owner connection: the app's restricted
   *  role sees nothing outside a tenant scope, so it would report every table
   *  as empty and every assertion would pass for the wrong reason. */
  const db = ownerDb();

  beforeAll(async () => {
    app = await createE2EApp();
  });

  afterAll(async () => {
    // Hand the database back empty: the next suite's createE2EApp() asserts it
    // (see the isolation contract at the top of test/e2e-app.ts).
    await resetDb();
    await app.close();
    await closeOwnerDb();
  });

  beforeEach(async () => {
    await resetDb();
  });

  /** A fresh, CSRF-primed client per use — keeps cookie jars isolated. */
  async function newClient(): Promise<E2EClient> {
    const client = new E2EClient(app);
    await client.bootstrapCsrf();
    return client;
  }

  /** The company and the e-mail one `handle` gets, both inside our namespace. */
  function accountFor(handle: string): { slug: string; email: string } {
    return { slug: `${SUITE}-${handle}`, email: `${handle}@${SUITE}.test` };
  }

  /**
   * Semeia uma empresa e o seu administrador — o estado em que o signup
   * deixava as coisas: e-mail ainda NÃO verificado, e um código de
   * verificação pendente.
   *
   * O código é gravado aqui mesmo, pelo hash, em vez de pedido por
   * `POST /auth/resend-verification`. Não é atalho: aquela rota tem um
   * cooldown por e-mail guardado no cache, que o `resetDb()` não limpa — e
   * esta suíte reusa handles entre testes, então o segundo pedido cairia no
   * cooldown, voltaria a resposta genérica sem gerar código nenhum, e o teste
   * falharia por um motivo que não tem nada a ver com o que ele verifica.
   */
  async function seedAccount(
    handle: string,
    password = STRONG_PASSWORD,
  ): Promise<{ userId: string; email: string; tenantId: string }> {
    const { slug, email } = accountFor(handle);
    const passwordHash = await hash(password);

    // Uma transação, como toda porta de criação de empresa: `provisionTenant`
    // exige que o chamador a abra (empresa sem administrador é órfã).
    const { userId, tenantId } = await db.$transaction(async (tx) => {
      const { tenant, adminProfileId } = await provisionTenant(tx, {
        slug,
        name: `${handle} & co`,
        email,
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          name: 'Arthur Dent',
          passwordHash,
          role: 'ADMIN',
          profileId: adminProfileId,
        },
      });
      return { userId: user.id, tenantId: tenant.id };
    });

    await db.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: sha256(VERIFICATION_CODE),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    return { userId, email, tenantId };
  }

  /** Seed a company + verify its admin's email + log in; returns the client. */
  async function seedVerifyLogin(
    handle: string,
    password = STRONG_PASSWORD,
  ): Promise<{ client: E2EClient; userId: string; email: string; tenantId: string }> {
    const client = await newClient();
    const { userId, email, tenantId } = await seedAccount(handle, password);

    const verify = await client.post('/api/auth/verify-email', { email, code: VERIFICATION_CODE });
    expect(verify.status).toBe(200);

    const login = await client.post('/api/auth/login', { email, password });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe(email);
    expect(client.hasCookie('access_token')).toBe(true);
    expect(client.hasCookie('refresh_token')).toBe(true);

    return { client, userId, email, tenantId };
  }

  async function rawPasswordResetToken(userId: string): Promise<string> {
    const raw = `e2e-reset-${userId}-token-1234567890`;
    const record = await db.passwordResetToken.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new Error('no password reset token row created by forgot-password');
    await db.passwordResetToken.update({
      where: { id: record.id },
      data: { tokenHash: sha256(raw) },
    });
    return raw;
  }

  // ---------------------------------------------------------------------------
  // Happy path: verify -> login -> /me -> refresh -> logout
  // ---------------------------------------------------------------------------

  it('completes the full verify -> login -> me -> refresh -> logout flow', async () => {
    const { client, userId, email, tenantId } = await seedVerifyLogin('arthur');

    // emailVerified flipped in the DB — pela rota, não pelo seed, que o deixou falso.
    const dbUser = await db.user.findUnique({ where: { id: userId } });
    expect(dbUser?.emailVerified).toBe(true);
    expect(dbUser?.tenantId).toBe(tenantId);

    // /users/me reads the access_token cookie and returns the profile.
    const me = await client.get('/api/users/me');
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(userId);
    expect(me.body.email).toBe(email);
    expect(me.body).not.toHaveProperty('passwordHash');

    // Refresh rotates: a new refresh_token row is minted, old one revoked.
    const beforeTokens = await db.refreshToken.findMany({ where: { userId } });
    expect(beforeTokens).toHaveLength(1);
    const oldRefresh = client.getCookie('refresh_token');

    const refresh = await client.post('/api/auth/refresh');
    expect(refresh.status).toBe(200);
    expect(client.getCookie('refresh_token')).not.toBe(oldRefresh);

    const afterTokens = await db.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(afterTokens).toHaveLength(2);
    expect(afterTokens[0].revokedAt).not.toBeNull(); // old one claimed/rotated
    expect(afterTokens[0].replacedById).toBe(afterTokens[1].id);
    expect(afterTokens[1].familyId).toBe(afterTokens[0].familyId); // same family

    // New access cookie still authenticates /me.
    const me2 = await client.get('/api/users/me');
    expect(me2.status).toBe(200);

    // Logout revokes the live refresh token and clears cookies.
    const logout = await client.post('/api/auth/logout');
    expect(logout.status).toBe(200);
    expect(client.hasCookie('refresh_token')).toBe(false);

    const live = await db.refreshToken.findMany({ where: { userId, revokedAt: null } });
    expect(live).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Sem registro público: a porta está fechada de verdade.
  // ---------------------------------------------------------------------------

  it('has no public registration route, and a signup attempt creates nothing', async () => {
    // O cliente tem CSRF, então um 403 aqui não seria "fechado", seria o guard
    // de CSRF mascarando uma rota viva. 404 é a prova de que a rota não existe.
    const client = await newClient();
    const res = await client.post('/api/auth/signup', {
      companyName: 'Intruder & co',
      slug: `${SUITE}-intruder`,
      name: 'Intruder',
      email: `intruder@${SUITE}.test`,
      password: STRONG_PASSWORD,
      acceptTerms: true,
    });
    expect(res.status).toBe(404);
    expect(await db.tenant.count()).toBe(0);
    expect(await db.user.count()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Refresh reuse detection: replaying a rotated token nukes the family.
  // ---------------------------------------------------------------------------

  it('detects refresh-token reuse and revokes the whole family', async () => {
    const { client, userId } = await seedVerifyLogin('ford');
    const stolen = client.getCookie('refresh_token');

    // Legitimate rotation: client now holds a new token; `stolen` is revoked.
    const ok = await client.post('/api/auth/refresh');
    expect(ok.status).toBe(200);

    // Age the rotation past REFRESH_REUSE_GRACE so this is a LATE replay — the
    // real theft signature — and not two tabs racing (which is now tolerated).
    await ageRotation(userId);

    // Replay the OLD (revoked) token -> reuse detected -> 401 + family revoked.
    // The csrf cookie still rides along via the jar; only refresh_token is swapped.
    const replay = await client.post('/api/auth/refresh', undefined, {
      cookies: { refresh_token: stolen! },
    });
    expect(replay.status).toBe(401);

    const live = await db.refreshToken.findMany({ where: { userId, revokedAt: null } });
    expect(live).toHaveLength(0); // even the freshly-minted token was nuked
  });

  /** Push every rotation of this user well outside the reuse grace window. */
  async function ageRotation(userId: string): Promise<void> {
    await db.refreshToken.updateMany({
      where: { userId, NOT: { revokedAt: null } },
      data: { revokedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
  }

  // ---------------------------------------------------------------------------
  // The three refresh defects: cookie lifetime, concurrency, refused refresh.
  // ---------------------------------------------------------------------------

  it('gives the access cookie the session lifetime, not the JWT lifetime', async () => {
    const client = await newClient();
    const { email } = await seedAccount('zaphod');
    await client.post('/api/auth/verify-email', { email, code: VERIFICATION_CODE });

    const login = await client.post('/api/auth/login', { email, password: STRONG_PASSWORD });
    const setCookies = login.headers['set-cookie'] as unknown as string[];

    const maxAgeOf = (name: string) => {
      const line = setCookies.find((c) => c.startsWith(`${name}=`));
      expect(line).toBeDefined();
      return Number(/max-age=(\d+)/i.exec(line!)?.[1]);
    };

    // The Next proxy gates navigations on the presence of access_token. If the
    // browser dropped it after JWT_ACCESS_TTL (900s) the user would be bounced
    // to /login while the refresh token was still good for days.
    expect(maxAgeOf('access_token')).toBe(Number(process.env.JWT_REFRESH_TTL));
    expect(maxAgeOf('access_token')).not.toBe(Number(process.env.JWT_ACCESS_TTL));
    expect(maxAgeOf('access_token')).toBe(maxAgeOf('refresh_token'));
  });

  it('survives two simultaneous refreshes with the same token', async () => {
    const { client, userId } = await seedVerifyLogin('trillian');
    const shared = client.getCookie('refresh_token')!;

    // Two tabs (or two parallel queries) each hit refresh with the SAME cookie,
    // because neither has seen the rotated one yet.
    const [a, b] = await Promise.all([
      client.post('/api/auth/refresh', undefined, { cookies: { refresh_token: shared } }),
      client.post('/api/auth/refresh', undefined, { cookies: { refresh_token: shared } }),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    // The session is intact: losing that race is concurrency, not theft.
    const live = await db.refreshToken.findMany({ where: { userId, revokedAt: null } });
    expect(live.length).toBeGreaterThan(0);

    // And the session still works afterwards.
    const me = await client.get('/api/users/me');
    expect(me.status).toBe(200);
  });

  it('clears the auth cookies when the refresh is rejected', async () => {
    const { client, userId } = await seedVerifyLogin('marvin');
    const stolen = client.getCookie('refresh_token')!;

    await client.post('/api/auth/refresh');
    await ageRotation(userId);

    // A late replay: 401 AND both cookies wiped. Without the wipe the access
    // cookie would outlive the dead session (it now lasts the whole refresh
    // TTL) and the proxy would keep bouncing the user from /login back inside.
    const replay = await client.post('/api/auth/refresh', undefined, {
      cookies: { refresh_token: stolen },
    });
    expect(replay.status).toBe(401);

    const cleared = (replay.headers['set-cookie'] as unknown as string[]) ?? [];
    for (const name of ['access_token', 'refresh_token']) {
      const line = cleared.find((c) => c.startsWith(`${name}=`));
      expect(line).toBeDefined();
      expect(/expires=Thu, 01 Jan 1970/i.test(line!) || line!.startsWith(`${name}=;`)).toBe(true);
    }
    expect(client.hasCookie('access_token')).toBe(false);
    expect(client.hasCookie('refresh_token')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Login error paths.
  // ---------------------------------------------------------------------------

  it('rejects login with the wrong password (generic 401)', async () => {
    const { client, email } = await seedVerifyLogin('trillian');
    client.clearAuthCookies();

    const res = await client.post('/api/auth/login', { email, password: 'WrongPass9!' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials'); // generic, no enumeration
  });

  it('rejects login for an unknown email with the same generic 401', async () => {
    const client = await newClient();
    const res = await client.post('/api/auth/login', {
      email: `nobody@${SUITE}.test`,
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  // ---------------------------------------------------------------------------
  // Protected route guards.
  // ---------------------------------------------------------------------------

  it('blocks /users/me without an access cookie (401)', async () => {
    const client = await newClient();
    const res = await client.get('/api/users/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('rejects an unsafe request without a CSRF token (403)', async () => {
    // Fresh client that has NOT bootstrapped a csrf token. O login é a rota
    // insegura e pública que existe em qualquer combinação de features.
    const client = new E2EClient(app);
    const res = await client.post('/api/auth/login', {
      email: `nocsrf@${SUITE}.test`,
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // Email verification edge cases.
  // ---------------------------------------------------------------------------

  it('rejects an invalid email-verification code (400)', async () => {
    const client = await newClient();
    const res = await client.post('/api/auth/verify-email', {
      email: `nobody@${SUITE}.test`,
      code: '000000',
    });
    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // Forgot / reset password happy path + session invalidation.
  // ---------------------------------------------------------------------------

  it('resets a password and invalidates existing sessions', async () => {
    const { client, userId, email } = await seedVerifyLogin('marvin');

    // A live session exists (we're logged in).
    expect(await db.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(1);

    // forgot-password always 200s.
    const forgot = await client.post('/api/auth/forgot-password', { email });
    expect(forgot.status).toBe(200);

    const token = await rawPasswordResetToken(userId);
    const reset = await client.post('/api/auth/reset-password', { token, password: NEW_PASSWORD });
    expect(reset.status).toBe(200);

    // Old sessions revoked by the reset.
    expect(await db.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);

    // Old password no longer works; new one does.
    const fresh = await newClient();
    const oldLogin = await fresh.post('/api/auth/login', { email, password: STRONG_PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await fresh.post('/api/auth/login', { email, password: NEW_PASSWORD });
    expect(newLogin.status).toBe(200);
    expect(fresh.hasCookie('access_token')).toBe(true);
  });

  it('rejects reset-password with an unknown/used token (400)', async () => {
    const client = await newClient();
    const res = await client.post('/api/auth/reset-password', {
      token: 'totally-bogus-reset-token',
      password: NEW_PASSWORD,
    });
    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // Account lockout after repeated failed logins.
  // ---------------------------------------------------------------------------

  it('locks the account after too many failed logins (generic 401 throughout)', async () => {
    const { userId, email } = await seedVerifyLogin('slarti');
    const attacker = await newClient();

    // LOGIN_MAX_ATTEMPTS defaults to 5. Burn 5 wrong passwords.
    for (let i = 0; i < 5; i += 1) {
      const res = await attacker.post('/api/auth/login', { email, password: 'WrongPass9!' });
      expect(res.status).toBe(401);
    }

    // The account row is now locked.
    const locked = await db.user.findUnique({ where: { id: userId } });
    expect(locked?.lockedUntil).not.toBeNull();
    expect(locked!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // Even the CORRECT password is refused while locked.
    const correct = await attacker.post('/api/auth/login', {
      email,
      password: STRONG_PASSWORD,
    });
    expect(correct.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // Full 2FA cycle: setup -> enable -> login challenge -> verify -> tokens.
  // ---------------------------------------------------------------------------

  it('enables 2FA and completes a TOTP login challenge', async () => {
    const { client, userId, email } = await seedVerifyLogin('eddie');

    // 1. setup -> returns a base32 secret stashed in the (memory) cache.
    const setup = await client.post('/api/users/me/2fa/setup');
    expect(setup.status).toBe(200);
    const secret = setup.body.secret as string;
    expect(secret).toBeTruthy();

    // 2. enable -> prove a live TOTP; returns one-time backup codes.
    const enableCode = await generate({ secret });
    const enable = await client.post('/api/users/me/2fa/enable', { code: enableCode });
    expect(enable.status).toBe(200);
    expect(Array.isArray(enable.body.backupCodes)).toBe(true);
    expect(enable.body.backupCodes).toHaveLength(10);

    const dbUser = await db.user.findUnique({ where: { id: userId } });
    expect(dbUser?.twoFactorEnabled).toBe(true);
    expect(dbUser?.twoFactorSecret).toBe(secret);

    // 3. login now returns a 2FA challenge (ticket), NOT cookies.
    const fresh = await newClient();
    const login = await fresh.post('/api/auth/login', { email, password: STRONG_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.twoFactorRequired).toBe(true);
    expect(login.body.ticket).toBeTruthy();
    expect(fresh.hasCookie('access_token')).toBe(false); // no session yet

    // 4. verify the second factor with a fresh TOTP -> cookies issued.
    const loginCode = await generate({ secret });
    const verify = await fresh.post('/api/auth/2fa/verify', {
      ticket: login.body.ticket,
      code: loginCode,
    });
    expect(verify.status).toBe(200);
    expect(verify.body.user.email).toBe(email);
    expect(fresh.hasCookie('access_token')).toBe(true);
    expect(fresh.hasCookie('refresh_token')).toBe(true);

    // The freshly minted session works.
    const me = await fresh.get('/api/users/me');
    expect(me.status).toBe(200);
    expect(me.body.twoFactorEnabled).toBe(true);
  });

  it('rejects a 2FA challenge with a wrong code (401) and a backup code works', async () => {
    const { client, email } = await seedVerifyLogin('benjy');

    const setup = await client.post('/api/users/me/2fa/setup');
    const secret = setup.body.secret as string;
    const enable = await client.post('/api/users/me/2fa/enable', {
      code: await generate({ secret }),
    });
    const backupCodes = enable.body.backupCodes as string[];

    // Login -> challenge.
    const fresh = await newClient();
    const login = await fresh.post('/api/auth/login', { email, password: STRONG_PASSWORD });
    const ticket = login.body.ticket as string;

    // Wrong TOTP code -> 401, ticket survives (under the attempt limit).
    const wrong = await fresh.post('/api/auth/2fa/verify', { ticket, code: '000000' });
    expect(wrong.status).toBe(401);

    // A valid one-time backup code completes the challenge.
    const good = await fresh.post('/api/auth/2fa/verify', { ticket, code: backupCodes[0] });
    expect(good.status).toBe(200);
    expect(fresh.hasCookie('access_token')).toBe(true);

    // That backup code is now consumed (single-use) — reusing it on a new
    // challenge must fail.
    const again = await newClient();
    const login2 = await again.post('/api/auth/login', { email, password: STRONG_PASSWORD });
    const reuse = await again.post('/api/auth/2fa/verify', {
      ticket: login2.body.ticket,
      code: backupCodes[0],
    });
    expect(reuse.status).toBe(401);
  });
});
