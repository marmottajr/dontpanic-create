import type { Messages } from './types';

export const en: Messages = {
  meta: {
    title: 'DontPanic — the SaaS boilerplate where the security decisions are already made',
    description:
      'Generate a full-stack SaaS on NestJS and Next.js with multi-tenancy enforced by Row Level Security, 2FA, invitations and social login. The decisions an AI gets silently wrong are already made, documented and tested.',
  },

  nav: {
    skipToContent: 'Skip to content',
    proof: 'The proof',
    configure: 'Build the command',
    how: 'How it works',
    inside: "What's inside",
    faq: 'Questions',
    repo: 'Repository',
    languageLabel: 'Language',
    themeLabel: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
  },

  hero: {
    mastheadLabel: 'Don’t Panic',
    title:
      'The security decisions an AI gets silently wrong are already made, documented and tested.',
    lead: 'DontPanic is a full-stack SaaS boilerplate — NestJS, Next.js, Prisma, Postgres with real Row Level Security. Every security choice has already been made, is explained in the `CLAUDE.md` your agent reads before writing a line, and has a test that fails when someone undoes it. As a side effect, context goes into your product instead of rediscovering how refresh token rotation works.',
    commandLabel: 'Command for the default preset',
    commandNote: 'Needs Node 24 and pnpm. To pick the parts, build your own command below.',
    ctaConfigure: 'Build my command',
    ctaProof: 'See the mistakes this avoids',
    facts: [
      {
        value: '78,533',
        label: 'lines of TypeScript that compile, pass lint and pass the test suite',
      },
      { value: '5', label: 'resources swappable by environment variable, without touching logic' },
      { value: '2 min', label: 'from npx to `pnpm dev`, database migrated and admin seeded' },
    ],
  },

  proof: {
    title: 'The proof',
    lead: 'None of this is hypothetical. These are mistakes that produce code which compiles, passes the tests and passes code review — and shows up months later, in a user who is not you. Each one is already decided in the boilerplate, with the reasoning written next to the decision.',
    labels: {
      surface: 'Where it lives',
      code: 'The code that passes review',
      whyItPasses: 'Why nobody catches it',
      whatHappens: 'What happens',
      ours: 'In DontPanic',
    },
    items: [
      {
        id: 'oauth-identity',
        title: 'Matching a social identity by email address',
        whyItPasses:
          'It compiles, and it works for every login in your development environment. The test — which has exactly one user — passes. Review approves it, because this is how most OAuth tutorials do it.',
        whatHappens:
          'Corporate addresses get recycled. Ana leaves, HR hands `ana@company.com` to the next hire, he signs in with Google and **inherits Ana’s account**: history, permissions, everything. Nobody broke in — the system did exactly what was written.',
        ours: 'The identity key is the immutable `providerAccountId` — `sub` on Google and Apple, the numeric id on GitHub — with `@@unique([provider, providerAccountId])`. The `email` column on `oauth_accounts` is for display and may be stale. And an address the provider did not mark as verified links nothing: the callback returns `unverified_email`.',
      },
      {
        id: 'oauth-2fa',
        title: 'Issuing a session in the OAuth callback without checking the second factor',
        whyItPasses:
          'The `TwoFactorGateGuard` exists and is registered. It verifies that 2FA is *enabled* — never that *this* session went through it. The 2FA test covers the password flow, and the password flow is correct.',
        whatHappens:
          'Anyone who deliberately turned on TOTP discovers that “sign in with Google” never asks for the code. Social login becomes **strictly weaker** than typing the password, and the second factor turns optional for whoever knows which button to click.',
        ours: 'If `twoFactorEnabled`, the callback does not issue a session: it creates the same ticket `POST /auth/login` would create, hands it over in a five-minute single-use cookie, and redirects to `/login?twofactor=1`. A cookie and not a query string — a query string lands in browser history, in the `Referer` header and in the logs of every proxy along the way.',
      },
      {
        id: 'trust-proxy',
        title: 'Turning on `trustProxy: true` to fix a spurious 429',
        whyItPasses:
          'It fixes the symptom immediately: rate limiting tells clients apart again, the 429 disappears, and the deploy ships with the problem solved. No test catches this, because tests do not forge headers.',
        whatHappens:
          "Trusting every hop means accepting any `X-Forwarded-For` — and `X-Forwarded-For` is **not** on the fetch forbidden-headers list, so the browser can set it. A `fetch('/api/auth/login', { headers: { 'x-forwarded-for': randomIp() } })` earns a fresh bucket on every request, and the login rate limit stops existing. Counting hops from the left ends up in the same place: the load balancer appends, so in `X-Forwarded-For: <forged>, <real>` the first element is whatever the attacker typed.",
        ours: '`CLIENT_IP_HEADER` and `CLIENT_IP_TRUSTED_HOPS`, counted **from the right**. The BFF strips every forwarding header coming from the browser and rewrites a single sanitised one. The default is zero hops: it sends no IP at all and treats everyone behind the proxy as one client — too restrictive, and not bypassable.',
      },
      {
        id: 'guard-scope',
        title: 'Reading the database in a guard, before the tenant scope exists',
        whyItPasses:
          'Nest runs guards **before** interceptors. When the guard executes, the interceptor that opens the transaction with `SET LOCAL` has not run yet: `prisma.db` falls back to the base client, with no scope, and the RLS policy returns zero rows. It does not throw. Coverage green, 200 OK, nothing in the logs.',
        whatHappens:
          'The guard concludes “this user has no 2FA” and **lets the request through**. This is exactly how DontPanic’s own `TwoFactorGateGuard` became a silent no-op — the bug is in the repository history, and the lesson was written down next to it.',
        ours: 'A guard that reads the database opens its own scope, with `this.prisma.forTenant(tenantId, …)` or `asPlatform`, and **fails closed** when the read comes back empty. The rule, with the bug’s story beside it, is in the multi-tenancy section of `CLAUDE.md` — the file your agent reads before writing the next guard.',
      },
      {
        id: 'db-owner',
        title: 'Pointing `DATABASE_URL` at the database owner',
        whyItPasses:
          'It is what the tutorial says, and it is the user the Postgres `docker compose` creates. Worse: your isolation tests pass, because they exercise the application-level filter — which is there, and is correct.',
        whatHappens:
          'A SUPERUSER — and any role with `BYPASSRLS` — ignores Row Level Security even with `FORCE ROW LEVEL SECURITY`. **Every policy becomes decoration**, and isolation between companies goes back to depending on no query ever forgetting a `where`, forever, in all future code.',
        ours: 'The application connects as a restricted role, created `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`; the owner lives only in `DATABASE_ADMIN_URL`, for `migrate` and `seed`. The API **refuses to boot** in production if it detects a superuser. And the e2e suite runs under the restricted role — which is what makes `tenant-isolation.e2e-spec.ts` prove something instead of restating the code’s intent.',
      },
    ],
    moreTitle: 'Three more, same shape',
    more: [
      'Sending the invitation email inside the transaction. A rollback hands out a valid link pointing at a company that does not exist, and leaves no record for support to find. Here, `issue()` writes to the caller’s `tx` and the email goes out after the commit.',
      'Answering “this account uses social login” on a password login. That is an oracle: you can enumerate, by timing the form, exactly which addresses have no password. Here the error is the same generic one and pays the same Argon2 cost — `verifyPassword(null, …)` verifies against a hash of something nobody knows before returning `false`.',
      'Counting seats before writing the user. Two concurrent requests both read “one left” and both create: counting locks nothing. Here `pg_advisory_xact_lock`, per company and per resource, sits inside the same transaction as the write.',
    ],
  },

  configurator: {
    title: 'Build the command',
    lead: 'Nothing is generated here. This page assembles a string — the generator lives in the CLI, versioned together with the template, and it decides what goes into your repository. No server, no build queue, no zip file to go stale in a cache.',

    nameLegend: 'The project name',
    nameLabel: 'Name',
    namePlaceholder: 'Acme Corp',
    nameHelp: 'What you call the product. Everything else is derived from it.',
    slugLabel: 'Slug',
    slugHelp: 'Directory, npm package and identifiers. Lowercase, digits and hyphen.',
    slugDerived: 'derived from the name',
    slugCustom: 'custom',
    slugReset: 'Back to derived',
    applySuggestion: 'Use',

    derivedTitle: 'What that name becomes',
    derivedNote:
      'The rename is not a `sed` on the folder name: it goes through the SQL that creates the Postgres role, through the pnpm scope, and through database and bucket names at the same time — where SQL rejects hyphens and S3 rejects underscores.',
    derivedLabels: {
      dbName: 'dev database',
      dbNameE2e: 'e2e database',
      dbRole: 'restricted Postgres role',
      npmScope: 'pnpm scope',
      seedAdminEmail: 'seeded admin',
      bucket: 'object storage bucket',
      screaming: 'env prefix',
      pascal: 'classes and types',
    },

    presetLegend: 'Starting point',
    presetNote:
      'A preset is just a set of defaults. Everything below stays editable, and the command shows only what you changed.',
    presetReset: 'Discard changes to this preset',

    featuresLegend: 'What goes in',
    featuresNote:
      'The generator subtracts: the template is the real repository, which compiles and runs, and turning a feature off deletes its files. No `{{#if}}` in the code.',
    groups: {
      access: 'Access',
      tenancy: 'Companies',
      ops: 'Operations',
      extras: 'Extras',
    },

    driversLegend: 'Adapters',
    driversNote:
      'Switching provider means switching an environment variable — the domain depends on the port, not on the vendor. These choices land in the generated `.env`.',
    driverLabels: {
      db: 'Database',
      storage: 'Storage',
      mail: 'Email',
      cache: 'Cache',
      queue: 'Queue',
      captcha: 'Captcha',
    },

    oauthLegend: 'Social login providers',
    oauthNote:
      'The API and the web app must list the same names, or the extra button 404s. The generator writes both sides.',

    localesLegend: 'Project languages',
    localesNote: 'The languages of the product you are about to generate. Unrelated to this page.',
    defaultLocaleLabel: 'Default language',

    optionsLegend: 'At generation time',
    optionLabels: {
      git: 'Run `git init` and the first commit',
      install: 'Run `pnpm install` at the end',
      docker: 'Emit `docker-compose.yml` with the services in use',
      force: 'Overwrite the target directory if it already exists',
    },

    issuesTitle: 'Incoherent combination',
    issueError: 'Blocks generation',
    issueWarning: 'Allowed, with a caveat',
    noIssues: 'Coherent combination.',

    commandTitle: 'Your command',
    commandNote: 'This is the configuration. There is nowhere else it lives.',
    copy: 'Copy command',
    copied: 'Command copied',
    copyFailed: 'Could not copy — select the text and copy it',
    flagsTitle: 'The flags',
    flagsNote: 'Only what differs from the preset. Remove one to go back to its default.',
    removeFlag: 'Remove',
    shareTitle: 'Link to this configuration',
    shareNote:
      'The configuration is in the URL, readable. Paste it in Slack and a colleague knows what it is before opening it.',
    shareCopy: 'Copy link',
    shareCopied: 'Link copied',
    blockedByName: 'Fix the name before using the command.',

    features: {
      multiTenant: {
        label: 'Multi-tenancy',
        text: 'Isolation between companies in Postgres, by Row Level Security. Turned off, RLS stays: the project starts with one fixed tenant and no company switcher in the UI.',
      },
      twoFactor: {
        label: 'TOTP 2FA',
        text: 'Second factor with an authenticator app, backup codes and a single-use ticket between the password and the session.',
      },
      oauth: {
        label: 'Social login',
        text: 'Google, Apple and GitHub, enabled per provider. Identity by `providerAccountId`, and the callback respects 2FA.',
      },
      invitations: {
        label: 'Invitations',
        text: 'The door into a company that already exists: the invitee picks their own password, and clicking the link is what proves the address.',
      },
      publicSignup: {
        label: 'Public signup',
        text: 'The form that lets a stranger create a company and become its first admin. Turned off, invitations and the seed remain.',
      },
      files: {
        label: 'File uploads',
        text: 'Avatars and attachments via pre-signed URL, behind the storage port: S3, MinIO, R2 or local disk.',
      },
      platform: {
        label: 'Platform panel',
        text: 'The SUPERADMIN area at `/platform`: creates companies, invites the first admin, crosses tenants in its own scope.',
      },
      audit: {
        label: 'Audit trail',
        text: 'Who did what, written outside the request transaction so it does not vanish with a rollback.',
      },
      plans: {
        label: 'Plans and limits',
        text: '`maxUsers` and named counters per company, with an advisory lock per resource — counting before writing locks nothing.',
      },
      i18n: {
        label: 'Internationalisation',
        text: 'Messages per language on both sides, with a key-parity test across the translation files.',
      },
      queue: {
        label: 'Job queue',
        text: 'BullMQ on Redis, with the worker in a separate process. The tenant travels with the job: without it RLS returns zero rows and the job lies about succeeding.',
      },
      captcha: {
        label: 'Captcha',
        text: 'Turnstile or reCAPTCHA on the routes that guess secrets, failing closed when the provider goes down.',
      },
      easterEggs: {
        label: 'Guide jokes',
        text: 'Marvin’s voice at the edges, `GET /teapot` returning 418, and the Konami code on the dashboard. Never in a security message.',
      },
      scaffolding: {
        label: 'Building blocks',
        text: 'Record grids, dashboard cards and `sequence.service.ts`: ready, tested and imported by nothing — the starting point for your own CRUD screens.',
      },
    },

    presets: {
      minimal: {
        label: 'Minimal',
        summary: 'Password auth, multi-tenancy with RLS, and the test suite. Nothing else.',
        audience:
          'For someone building the whole product and who only wants the access layer already proven.',
      },
      saas: {
        label: 'SaaS',
        summary:
          'Genuinely multi-company: invitations, plans with seat limits, 2FA, social login and a durable queue.',
        audience:
          'For a subscription product with more than one customer company in the same database.',
      },
      complete: {
        label: 'Complete',
        summary: 'The whole boilerplate, nothing subtracted — Marvin included.',
        audience: 'For seeing everything work before deciding what to remove.',
      },
      internal: {
        label: 'Internal',
        summary:
          'One company and no public door: you get in by invitation, with 2FA and an audit trail.',
        audience: 'For a team tool, back office or ERP that will never have open signup.',
      },
    },
  },

  how: {
    title: 'How it works',
    lead: 'Four steps, and only the third one takes any time.',
    steps: [
      {
        title: 'Pick the parts',
        body: 'A preset as a starting point and toggles on top. The URL keeps the choice, so you can send the link to whoever decides with you before running anything.',
      },
      {
        title: 'Copy the command',
        body: 'The page generates nothing: it assembles the string. The CLI, versioned together with the template, decides your repository’s contents — which is why the same recipe produces the same project today and in two years.',
      },
      {
        title: 'Run the npx',
        body: 'The generator copies the template, deletes what you did not ask for, prunes the Prisma schema, assembles the SQL baseline, replaces the name in every form, writes the `.env` with generated secrets, and runs `git init`.',
      },
      {
        title: '`pnpm dev`',
        body: 'With Docker up, the database migrated and the admin seeded. Two minutes after the `npx` you are looking at your product’s login screen.',
      },
    ],
    renameTitle: 'The rename is proven, not reviewed',
    renameLead:
      'The project name shows up in places no human review covers. The gate is mechanical: CI generates with a test name, runs `grep -ri` demanding zero occurrences of the old name, and only then installs, typechecks and runs the whole suite, e2e included.',
    renameItems: [
      '531 occurrences across 199 files, in three different cases.',
      'Inside the SQL that creates the restricted Postgres role, where a partial replacement yields a role with no GRANT — and the symptom is “zero rows”, not an error.',
      'In database and bucket names at once, where SQL rejects hyphens and S3 rejects underscores.',
    ],
  },

  inside: {
    title: "What's inside",
    lead: 'The template is the real DontPanic repository, at the tag the generator declares. It is not a demo build: it is the code that runs its own CI.',
    stackTitle: 'The stack',
    stackRoles: [
      'API, with Fastify underneath',
      'Web, with the BFF that talks to the API instead of the browser',
      'Database, with driver adapters and Row Level Security',
      'Request and response contracts, shared between API and web',
      'Password and session, with rotating refresh and reuse detection',
      'Durable queue, with the worker in a separate process',
      'Tests: unit, component and e2e',
      'Monorepo, with build caching',
    ],
    portsTitle: 'Ports & Adapters',
    portsLead:
      'Five resources where switching provider means switching an environment variable. The domain depends on the interface; the vendor is a pluggable detail.',
    portsHead: { resource: 'Resource', adapters: 'Adapters', env: 'Variable' },
    portsResources: ['Files', 'Email', 'Cache', 'Jobs', 'Captcha'],
    numbersTitle: 'The numbers',
    numbers: [
      { value: '78,533', label: 'lines of TypeScript' },
      { value: '~99%', label: 'statement coverage on the API, with thresholds enforced in CI' },
      { value: '100%', label: 'statement coverage on the web UI kit' },
      { value: '531', label: 'name occurrences replaced across 199 files, proven by grep' },
    ],
  },

  faq: {
    title: 'Questions',
    lead: 'The ones worth an honest answer before you run the command.',
    items: [
      {
        q: 'What exactly is tested?',
        a: 'The preset matrix, in full: CI generates a project from each preset, demands zero occurrences of the old name, and runs install, typecheck, unit and e2e. Plus all-on, all-off, and each feature turned off individually on top of the SaaS preset. Thirteen boolean features are 8,192 combinations, and CI does not test 8,192 projects: combinations outside that matrix are allowed and untested — and the CLI says so, in one line, without drama. A boilerplate that promises guarantees it does not verify is worse than one that states the limit.',
      },
      {
        q: 'What if I do not want multi-tenancy?',
        a: '`--no-multi-tenant` hides it, it does not tear it out. The project starts with one fixed tenant created in the seed, the scope always open on it, and the company switcher, the `/platform` panel and SUPERADMIN out of the UI. Row Level Security stays, and stays proven by `tenant-isolation.e2e-spec.ts`; the cost is one indexed column and a predicate Postgres resolves to a constant. Tearing it out would mean maintaining two versions of all data access — and the version without RLS is precisely the one we cannot prove safe.',
      },
      {
        q: 'Can I update later?',
        a: 'The generated project is yours, not a dependency: there is no `pnpm update` that pulls DontPanic changes into it, and that is deliberate — you will be editing this code on day one. What you do get is reproducibility: the same recipe on the same template version generates the same project today and in two years, so you can generate again and compare diffs when you want to adopt something from upstream.',
      },
      {
        q: 'What about the licence?',
        a: 'MIT, on the generator and on the template. What comes out of the `npx` is yours: no required attribution, no royalty, no clause that changes value if your product grows. You can close the source of what you generate.',
      },
      {
        q: 'Do I need Docker?',
        a: 'To run the test suite, no: the `memory`, `console` and `local` adapters exist exactly so it runs with nothing else up. To develop properly you need a Postgres — and the project’s `docker compose` brings up Postgres, Redis, MinIO and Mailpit on ports that will not collide with yours. If you already have those services, point the `.env` at them and generate with `--no-docker`.',
      },
      {
        q: 'Does it work with Claude Code, Cursor and friends?',
        a: 'The generated project ships a `CLAUDE.md` pruned to the features you chose — only the sections that exist in your code. That is where the security decisions live, each with its reasoning, in the form an agent reads before writing. The side effect is probably what brought you here: context goes into your product instead of rediscovering how refresh token rotation works.',
      },
    ],
  },

  footer: {
    tagline: 'A SaaS boilerplate that already made the boring decisions.',
    repo: 'Source on GitHub',
    license: 'MIT',
    sourceNote:
      'The numbers on this page come from `wc -l` and `grep` on the repository. Check them.',
    marvin:
      'Here I am, brain the size of a planet, assembling a command line. They call this job satisfaction.',
  },
};
