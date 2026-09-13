import type { Messages } from './types';

export const en: Messages = {
  meta: {
    title: 'DontPanic — the SaaS boilerplate where the security decisions are already made',
    description:
      'Generate a new project — a full-stack SaaS in NestJS and Next.js, from scratch — with multi-tenancy by Row Level Security, 2FA, invitations and social login. The decisions an AI gets silently wrong are already made, documented and tested.',
  },

  nav: {
    skipToContent: 'Skip to content',
    proof: 'The proof',
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
      'Start a new SaaS with the security decisions already made — the ones an AI gets silently wrong.',
    lead: 'You answer ten questions, copy one command and get **a brand-new repository**: empty of your product and full of everything else — login, 2FA, invitations, companies isolated inside the database, a job queue and tests. With your project’s name in everything: packages, database, environment variables.',
    notThis:
      'It is not a scanner: DontPanic **never looks at code you already have**. It is the starting point of a project built from scratch.',
    nameCta: 'Start',
    ctaNote: 'Ten questions in plain language. You can skip any of them.',
    commandLabel: 'Command for the default preset',
    commandNote: 'Needs Node 24 and pnpm.',
    ctaProof: 'See the five decisions',
    facts: [
      {
        value: '78,533',
        label: 'lines of TypeScript that compile, pass lint and pass the test suite',
      },
      { value: '5', label: 'resources swappable by environment variable, without touching logic' },
      { value: '2 min', label: 'from npx to `pnpm dev`, database migrated and admin seeded' },
    ],
  },

  cta: {
    title: 'Ten questions. One command at the end.',
    text: 'One question per screen, in plain language, with what it changes in the system written underneath. No wall of fourteen switches.',
    note: 'no sign-up · you can go back at any step',
  },

  proof: {
    eyebrow: 'Five mistakes, already decided here',
    title: 'The proof',
    lead: 'None of this is hypothetical. These are mistakes that produce code which compiles, passes the tests and passes code review — and shows up months later, in a user who is not you. We are not the ones who will find them in your code: **each one is already decided in the code you receive**, with the reasoning beside the decision and the test named underneath.',
    labels: {
      whatHappens: 'What happens',
      ours: 'In DontPanic',
      seal: 'covered by tests',
      cases: 'cases',
    },
    items: [
      {
        id: 'oauth-identity',
        eyebrow: 'Social login',
        title: 'A social identity matched by email address',
        whatHappens:
          'Corporate addresses get recycled. Ana leaves, HR hands `ana@company.com` to the next hire, he signs in with Google and **inherits Ana’s account**: history, permissions, everything. Nobody broke in — the system did exactly what was written, and the test, which had a single user, passed.',
        ours: 'The identity key is the immutable `providerAccountId` — `sub` on Google and Apple, the numeric id on GitHub — with `@@unique([provider, providerAccountId])`. The `email` column on `oauth_accounts` is for display and may be stale. And an address the provider did not mark as verified links nothing: the callback returns `unverified_email`.',
      },
      {
        id: 'oauth-2fa',
        eyebrow: 'Second factor',
        title: 'A session issued in the OAuth callback without checking the second factor',
        whatHappens:
          'Anyone who deliberately turned on the six-digit code discovers that “sign in with Google” never asks for it. Social login becomes **strictly weaker** than typing the password, and the second factor turns optional for whoever knows which button to click. The `TwoFactorGateGuard` does not catch it: it verifies that 2FA is *enabled*, never that *this* session went through it.',
        ours: 'If `twoFactorEnabled`, the callback does not issue a session: it creates the same ticket `POST /auth/login` would create, hands it over in a five-minute single-use cookie, and redirects to `/login?twofactor=1`. A cookie and not a query string — a query string lands in browser history, in the `Referer` header and in the logs of every proxy along the way.',
      },
      {
        id: 'rls-where',
        eyebrow: 'Isolation',
        title: 'Isolation between companies left to the application’s `where`',
        whatHappens:
          'The guarantee has become human discipline, repeated in every query, by everyone who joins the team after you. The first `findUnique({ where: { id } })` by primary key — written in a hurry, or by an agent that did not know the rule — returns another company’s row. And it does not fail: **it returns data, with status 200**.',
        ours: 'Isolation belongs to Postgres, not to the application: Row Level Security, with the scope declared by `SET LOCAL` inside the request transaction. With no scope at all, `current_setting(…, true)` returns NULL and the policy never matches — forgetting the scope yields an **empty** result, never the wrong company’s row. The application-level filter is still there, as a convenience; the guarantee is the one underneath.',
      },
      {
        id: 'password-reset',
        eyebrow: 'Sessions',
        title: 'A password reset that does not end the open sessions',
        whatHappens:
          'People reset their password precisely because they suspect someone got in. The new hash invalidates nothing: the intruder’s refresh token **keeps renewing itself**, and he stays inside the account long after the change — indefinitely, as long as he keeps using the system.',
        ours: '`resetPassword` writes the new password and burns the reset token in one transaction and then, after the commit, calls `revokeAllForUser` — every existing session dies, recorded in the audit trail as a deliberate logout. Rotating refresh closes the rest: an old token presented again revokes the whole family.',
      },
      {
        id: 'db-owner',
        eyebrow: 'Database',
        title: '`DATABASE_URL` pointing at the database owner',
        whatHappens:
          'A SUPERUSER — and any role with `BYPASSRLS` — ignores Row Level Security even with `FORCE ROW LEVEL SECURITY`. **Every policy becomes decoration**, and isolation goes back to depending on no query ever forgetting a `where`. Worse: your isolation tests pass, because they exercise the application filter, which is there and is correct.',
        ours: 'The application connects as a restricted role, created `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`; the owner lives only in `DATABASE_ADMIN_URL`, for `migrate` and `seed`. The API **refuses to boot** in production if it detects a superuser. And the e2e suite runs under the restricted role — which is what makes the isolation test prove something instead of restating the code’s intent.',
      },
    ],
    moreTitle: 'Five more, same shape',
    more: [
      'Turning on `trustProxy: true` to make a spurious 429 go away. Trusting every hop means accepting any `X-Forwarded-For` — and the browser **can** set it, because it is not on the fetch forbidden-headers list: a fresh rate-limit bucket on every request. Here the IP is counted from the right, with `CLIENT_IP_TRUSTED_HOPS`, and the BFF strips every forwarding header coming from the browser.',
      'Reading the database in a guard, before the tenant scope exists. Nest runs guards **before** interceptors, so the RLS policy returns zero rows, the guard concludes “this user has no 2FA” and lets the request through — no error, no log. Here, a guard that reads the database opens its own scope and fails closed.',
      'Sending the invitation email inside the transaction. A rollback hands out a valid link pointing at a company that does not exist, and leaves no record for support to find. Here, `issue()` writes to the caller’s `tx` and the email goes out after the commit.',
      'Answering “this account uses social login” on a password login. That is an oracle: you can enumerate, by timing the form, exactly which addresses have no password. Here the error is the same generic one and pays the same Argon2 cost — `verifyPassword(null, …)` verifies against a hash of something nobody knows before returning `false`.',
      'Counting seats before writing the user. Two concurrent requests both read “one left” and both create: counting locks nothing. Here `pg_advisory_xact_lock`, per company and per resource, sits inside the same transaction as the write.',
    ],
  },

  configurator: {
    nameLabel: 'Name',
    namePlaceholder: 'Acme Corp',
    nameHelp: 'What you call the product. Everything else is derived from it.',
    slugLabel: 'Slug',
    slugHelp: 'Directory, npm package and identifiers. Lowercase, digits and hyphen.',
    slugDerived: 'derived from the name',
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

    driverLabels: {
      db: 'Database',
      storage: 'Storage',
      mail: 'Email',
      cache: 'Cache',
      queue: 'Queue',
      captcha: 'Captcha',
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
    flagsNote: 'Only what differs from the starting point.',
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
        text: 'Avatars and attachments kept outside the database, behind the storage port: S3, MinIO, R2 or local disk, swapped with `STORAGE_DRIVER`.',
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
        summary: 'Password auth, isolation in the database, and the test suite. Nothing else.',
        audience:
          'For someone building the whole product and who only wants the access layer already proven.',
      },
      saas: {
        label: 'SaaS',
        summary:
          'Genuinely multi-company: invitations, plans with seat limits, 2FA and a durable queue.',
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

  wizard: {
    open: 'Build',
    openHero: 'Build my system',
    close: 'Close',
    next: 'Continue',
    back: 'Back',
    finish: 'See the command',
    recommended: 'Use the recommended',
    progress: 'Step {n} of {total}',
    yes: 'Yes',
    no: 'No',
    edit: 'Edit',
    whatChangesLabel: 'What changes in your system',
    steps: {
      name: {
        eyebrow: 'Name',
        question: 'What will your system be called?',
        help: 'It can be the product’s name or the company’s. Everything else comes from it: the folder, the package, the database, even the user Postgres creates. The derived forms appear below as you type.',
        whatChanges:
          'The name goes into 531 places, in three different cases: package, pnpm scope, database name, environment-variable prefix, bucket, and the SQL that creates the restricted Postgres role. CI proves none was missed — it generates with a test name and demands zero occurrences of the old one from a `grep -ri`.',
      },
      preset: {
        eyebrow: 'Starting point',
        question: 'Which of these looks most like what you are about to build?',
        help: 'This only answers the next questions for you. Nothing gets locked: if an answer does not fit, change it on its own step or in the review at the end.',
        whatChanges:
          'The starting point only fills in the next answers. CI tests the matrix of all four in full: it generates a project from each, installs, typechecks and runs unit and e2e. Outside it, the combination is allowed and untested — and the CLI says so, in one line.',
      },
      tenancy: {
        eyebrow: 'Companies',
        question:
          'Will your system serve several different companies, each one seeing only its own data?',
        help: 'It is the difference between “customer A saw customer B’s data” and “the database refused the row before the application noticed”.',
        whatChanges:
          "The separation belongs to Postgres, not to the application: every request declares its scope with `SET LOCAL` inside the transaction, and the Row Level Security policies compare against `current_setting('app.current_tenant_id', true)`. With no scope, the comparison is never true — the result comes back empty, never from the wrong company. A new table with `tenantId` protects itself: `SELECT app.apply_tenant_rls();` at the end of the migration.",
        choices: {
          yes: {
            label: 'Yes, several companies',
            help: 'Each company is kept apart inside the database by Postgres itself, not by a filter someone can forget to write. Comes with an admin panel and a company switcher.',
          },
          no: {
            label: 'No, one company only',
            help: 'The system starts with one fixed company and the switching screens stay out. The separation is still in the database — it just does not show on screen, because there is nothing to switch.',
          },
        },
      },
      entry: {
        eyebrow: 'Getting in',
        question: 'How will people get into the system?',
        help: 'It is the difference between waking up to a thousand test accounts and having to create every person by hand. Who may create an account is the decision that changes your product the most — and the one that goes wrong most often when it is left for later.',
        whatChanges:
          "The invitation stores only the token’s SHA-256: a leaked database yields no usable link. A partial unique index (`WHERE status = 'PENDING'`) allows at most one live invitation per email per company, and closes the race of two admins inviting the same colleague at the same moment. The email goes out after the commit — inside the transaction, a rollback would hand out a valid link to a company that does not exist.",
        choices: {
          open: {
            label: 'Anyone can sign up',
            help: 'There is an open signup form, and whoever signs up creates their own company. It is what a product sold over the internet needs.',
          },
          invite: {
            label: 'Only by invitation',
            help: 'An administrator invites by email and the invitee picks their own password. Nobody ever learns someone else’s password, and clicking the link is what proves that address exists.',
          },
          seed: {
            label: 'Only the accounts I create',
            help: 'No signup and no invitations: the only account is the one the system creates on install. Good for internal use — and it means you create the other people by hand.',
          },
        },
      },
      social: {
        eyebrow: 'Social login',
        question: 'Do you want the sign-in-with-Google, Apple or GitHub button?',
        help: 'It is the difference between one more password for your user to forget and a button they already use everywhere. In exchange, each provider wants a key you create on their site.',
        whatChanges:
          'The account is recognised by the immutable `providerAccountId`, with `@@unique([provider, providerAccountId])` — never by the email, which gets recycled when someone leaves the company. An address the provider did not mark as verified links nothing: the callback returns `unverified_email`. The `OAUTH_PROVIDERS` list and the web one must match, or the extra button 404s; the generator writes both sides.',
        choices: {
          yes: {
            label: 'Yes, I want the button',
            help: 'Google and GitHub on, Apple available. You create the keys in each provider’s console and paste them into the `.env`.',
          },
          no: {
            label: 'No, email and password only',
            help: 'The providers’ code leaves the project — less to maintain. To get it back, generate again with social login on.',
          },
        },
      },
      twoFactor: {
        eyebrow: 'Second factor',
        question: 'Should people be able to require a code from their phone to sign in?',
        help: 'It is the difference between “they stole her password” and “they stole her password and did not get in”. The person registers an authenticator app once, then types six digits when the system asks.',
        whatChanges:
          'The second factor applies at every door in, social login included: the callback issues no session, hands over a ticket in the `dp_2fa_ticket` cookie — five minutes, burned after a few wrong attempts — and the real session is only born after the six digits. Single-use recovery codes come with it, and `TWO_FACTOR_REQUIRED=true` starts demanding the factor from everyone.',
        choices: {
          yes: {
            label: 'Yes, I want a second factor',
            help: 'Each person turns it on for their own account, with recovery codes in case the phone is lost. To require it from everyone, the project ships `TWO_FACTOR_REQUIRED`.',
          },
          no: {
            label: 'Not now',
            help: 'Signing in is password only. You can turn it on later — but by generating the project again, because answering no here removes the second factor’s code.',
          },
        },
      },
      languages: {
        eyebrow: 'Languages',
        question: 'Will the system speak more than one language?',
        help: 'This is about the product you are generating, not about this page.',
        whatChanges:
          'Each language is a message file on both sides, API and web. A test compares the key sets between them and fails when one is missing — which is exactly how a screen shows up in English in the middle of Portuguese, in production.',
        choices: {
          one: {
            label: 'One language',
            help: 'Screens and emails come out in a single language. The translation plumbing stays in the code, so adding a second one later is not rebuilding the screens.',
          },
          many: {
            label: 'More than one',
            help: 'You pick which. A test makes sure no language ends up missing a sentence — which is how a screen shows up in English in the middle of Portuguese.',
          },
        },
      },
      plans: {
        eyebrow: 'Plans',
        question: 'Will you sell plans with limits, the “up to 10 users” kind?',
        help: 'It is the difference between charging per plan and hoping nobody abuses it. It is what separates a basic plan from an advanced one inside the system itself.',
        whatChanges:
          'The limit is checked at the moment the seat is consumed — accepting the invitation — inside the same transaction that creates the user, with `pg_advisory_xact_lock` per company and per resource. Counting before writing locks nothing: two acceptances in the same second would go over the cap.',
        choices: {
          yes: {
            label: 'Yes, I will sell plans',
            help: 'Each company gets a people limit and counters per resource, with the usage and plan-change screens.',
          },
          no: {
            label: 'No, everyone the same',
            help: 'No limits and no counters. Nobody is stopped for being too big.',
          },
        },
      },
      files: {
        eyebrow: 'Files',
        question: 'Will people upload files — profile pictures, attachments, documents?',
        help: 'It changes where the files live and how they reach the browser.',
        whatChanges:
          'The file goes up through the API and into storage via the `StorageProvider` port, which has three operations: `putObject`, `deleteObject` and `getPublicUrl`. Swapping S3 for MinIO, R2 or local disk is changing `STORAGE_DRIVER` in the `.env` — the logic does not know which one is behind it.',
        choices: {
          yes: {
            label: 'Yes, people will upload files',
            help: 'Avatars and attachments kept outside the database. Works with Amazon S3, MinIO, Cloudflare R2 or the machine’s disk, and switching between them is one line of configuration.',
          },
          no: {
            label: 'Not needed',
            help: 'No uploads and no profile picture. Less code, and no bucket to configure.',
          },
        },
      },
      captcha: {
        eyebrow: 'Bots',
        question: 'Do the public screens need protection against bots?',
        help: 'It is the difference between a bot trying a thousand passwords a minute and it stopping at the first puzzle. It applies to signup, login and password recovery.',
        whatChanges:
          'The captcha goes on the routes marked `@RequireCaptcha`: signup, login, verification resend and password recovery. `CAPTCHA_DRIVER` and `NEXT_PUBLIC_CAPTCHA_DRIVER` have to match, or every submit becomes a 400 over a token the screen never had a way to get — the generator writes both. A provider that is down answers 503, not “let everyone through”: `CAPTCHA_FAIL_OPEN=false` is the default.',
        choices: {
          yes: {
            label: 'Yes, I want protection',
            help: 'Comes with Cloudflare Turnstile, and Google reCAPTCHA as an alternative. You create the keys at the provider.',
          },
          no: {
            label: 'Not now',
            help: 'No puzzle on screen. The attempt limit per network address still applies, so it is not “no protection”: it is without that layer.',
          },
        },
      },
      review: {
        eyebrow: 'Review',
        question: 'Check it before you run it.',
        help: 'Every line goes back to the question that produced it. The command is exactly what the generator will receive.',
      },
      done: {
        eyebrow: 'Done',
        question: 'Copy it and run it.',
        help: 'Paste it in the terminal, in the folder where you want the project. Two minutes later you are looking at its login screen.',
      },
    },
  },

  how: {
    title: 'Four steps, and the fourth is `pnpm dev`.',
    steps: [
      {
        title: 'Answer the questions',
        body: 'Right here, one at a time. Each one says what changes in the code if you answer yes or no. You can skip with “use the recommended”.',
      },
      {
        title: 'Copy the command',
        body: 'The last screen shows a single command with your choices inside it. There is a shareable link, if you want to discuss the configuration with your team first.',
      },
      {
        title: 'Run it in the terminal',
        body: 'It downloads the code, renames everything to your project — packages, database, variables, containers —, brings Postgres and Redis up in Docker and seeds the database.',
      },
      {
        title: '`pnpm dev`',
        body: 'API on `:4201`, web on `:4200`, email caught by Mailpit on `:4207`. The seeded admin login is in the README.',
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
    stackHead: { tech: 'Technology', solves: 'What it solves' },
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
    factoryTitle: 'Out of the box',
    factory: [
      {
        label: 'Access and session',
        text: 'Argon2 passwords, session in an httpOnly cookie, rotating refresh with reuse detection — a stolen token takes down the whole family. Changing the password ends the other sessions.',
      },
      {
        label: 'Isolation in the database',
        text: 'Row Level Security in Postgres, with the scope declared per request. A new table with `tenantId` protects itself: `SELECT app.apply_tenant_rls();` at the end of the migration.',
      },
      {
        label: 'Invitations and onboarding',
        text: 'Token stored only as a hash, at most one pending invitation per email (partial unique index), and the email going out after the commit — never inside the transaction.',
      },
      {
        label: 'Five swaps by variable',
        text: 'Storage, email, cache, queue and captcha behind interfaces: `STORAGE_DRIVER`, `MAIL_DRIVER`, `CACHE_DRIVER`, `QUEUE_DRIVER`, `CAPTCHA_DRIVER`.',
      },
      {
        label: 'Background work',
        text: 'BullMQ on Redis, with the worker in a separate process and the tenant travelling along with the job. Without it, the job would see an empty database and report success.',
      },
      {
        label: 'Tests that prove it',
        text: 'Unit tests with the database mocked, e2e against a real Postgres under the restricted role, and the web UI kit in Vitest.',
      },
    ],
    decisionsTitle: 'The part nobody writes',
    decisionsText:
      'Every security decision has a file in `docs/decisions/` and a section in `CLAUDE.md`, with the reasoning and what happens if someone undoes it. It is what an agent reads before writing — and what you read six months later, when you cannot remember why it is like that.',
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
        q: 'Does this analyse the app I already have?',
        a: 'No. DontPanic does not read, audit or fix existing code — it **generates a new project**, from scratch, with these decisions already made inside it. If your app is already running, what is useful here is the reading: generate a sample project and compare it with yours, or go through “The proof” and check, in your own code, whether each of the five cases is handled. The command never touches anything you have written.',
      },
      {
        q: 'What exactly is tested?',
        a: 'The preset matrix, in full: CI generates a project from each preset, demands zero occurrences of the old name, and runs install, typecheck, unit and e2e. Plus all-on, all-off, and each feature turned off individually on top of the SaaS preset. Fourteen boolean features are 16,384 combinations, and CI does not test 16,384 projects: combinations outside that matrix are allowed and untested — and the CLI says so, in one line, without drama. A boilerplate that promises guarantees it does not verify is worse than one that states the limit.',
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
    brandNote:
      'A project generator built on the DontPanic boilerplate. You pick the parts; the command generates the repository.',
    sourceNote:
      'The numbers on this page come from `wc -l` and `grep` on the repository. Check them.',
    license: 'MIT',
    productTitle: 'Product',
    docsTitle: 'Documentation',
    contactTitle: 'Contact',
    joke: 'This footer was assembled by an intelligence the size of a planet. It contains four lists of links. Don’t panic: the rest of the code is more interesting.',
  },
};
