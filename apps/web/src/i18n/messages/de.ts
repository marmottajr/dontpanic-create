import type { Messages } from './types';

export const de: Messages = {
  meta: {
    title:
      'DontPanic — das SaaS-Boilerplate, bei dem die Sicherheitsentscheidungen schon getroffen sind',
    description:
      'Erzeuge ein Full-Stack-SaaS mit NestJS und Next.js, Multi-Tenancy durch Row Level Security, 2FA, Einladungen und Social Login. Die Entscheidungen, die eine KI still falsch trifft, sind hier schon getroffen, dokumentiert und getestet.',
  },

  nav: {
    skipToContent: 'Zum Inhalt springen',
    proof: 'Der Beweis',
    configure: 'Befehl zusammenbauen',
    how: 'So funktioniert es',
    inside: 'Was drin ist',
    faq: 'Fragen',
    repo: 'Repository',
    languageLabel: 'Sprache',
    themeLabel: 'Darstellung',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    themeSystem: 'System',
  },

  hero: {
    mastheadLabel: 'Don’t Panic',
    title:
      'Die Sicherheitsentscheidungen, die eine KI still falsch trifft, sind hier schon getroffen, dokumentiert und getestet.',
    lead: 'DontPanic ist ein Full-Stack-SaaS-Boilerplate — NestJS, Next.js, Prisma, Postgres mit echtem Row Level Security. Jede Sicherheitsentscheidung ist gefallen, steht in der `CLAUDE.md`, die dein Agent vor der ersten Zeile liest, und hat einen Test, der fehlschlägt, sobald jemand sie rückgängig macht. Nebeneffekt: der Kontext geht in dein Produkt, statt Refresh-Token-Rotation neu herzuleiten.',
    commandLabel: 'Befehl des Standard-Presets',
    commandNote:
      'Braucht Node 24 und pnpm. Für die Auswahl der Teile: weiter unten den eigenen Befehl bauen.',
    ctaConfigure: 'Meinen Befehl bauen',
    ctaProof: 'Die vermiedenen Fehler ansehen',
    facts: [
      {
        value: '78.533',
        label: 'Zeilen TypeScript, die kompilieren, den Lint und die Tests bestehen',
      },
      {
        value: '5',
        label: 'Ressourcen, per Umgebungsvariable austauschbar, ohne die Logik anzufassen',
      },
      {
        value: '2 Min.',
        label: 'von npx bis `pnpm dev`, Datenbank migriert und Admin per Seed angelegt',
      },
    ],
  },

  proof: {
    title: 'Der Beweis',
    lead: 'Nichts davon ist hypothetisch. Es sind Fehler, die Code erzeugen, der kompiliert, die Tests besteht und das Code Review besteht — und Monate später auftaucht, bei einem Nutzer, der nicht du bist. Jeder davon ist im Boilerplate schon entschieden, mit der Begründung direkt neben der Entscheidung.',
    labels: {
      surface: 'Wo es lebt',
      code: 'Der Code, der das Review besteht',
      whyItPasses: 'Warum es niemand bemerkt',
      whatHappens: 'Was passiert',
      ours: 'In DontPanic',
    },
    items: [
      {
        id: 'oauth-identity',
        title: 'Die Social-Identität über die E-Mail-Adresse zuordnen',
        whyItPasses:
          'Es kompiliert und funktioniert bei jedem Login in deiner Entwicklungsumgebung. Der Test — mit genau einem Benutzer — besteht. Das Review nickt es ab, denn so machen es die meisten OAuth-Tutorials.',
        whatHappens:
          'Firmenadressen werden weiterverwendet. Ana geht, die Personalabteilung gibt `ana@firma.de` an die nächste Einstellung, er meldet sich mit Google an und **erbt Anas Konto**: Historie, Berechtigungen, alles. Niemand ist eingebrochen — das System hat genau das getan, was dort stand.',
        ours: 'Der Identitätsschlüssel ist die unveränderliche `providerAccountId` — `sub` bei Google und Apple, die numerische id bei GitHub — mit `@@unique([provider, providerAccountId])`. Die Spalte `email` in `oauth_accounts` dient der Anzeige und darf veraltet sein. Und eine Adresse, die der Provider nicht als verifiziert markiert hat, verknüpft nichts: der Callback gibt `unverified_email` zurück.',
      },
      {
        id: 'oauth-2fa',
        title: 'Im OAuth-Callback eine Session ausgeben, ohne den zweiten Faktor zu prüfen',
        whyItPasses:
          'Der `TwoFactorGateGuard` existiert und ist registriert. Er prüft, dass 2FA *aktiviert* ist — nie, dass *diese* Session sie durchlaufen hat. Der 2FA-Test deckt den Passwort-Flow ab, und der Passwort-Flow ist korrekt.',
        whatHappens:
          'Wer TOTP absichtlich eingeschaltet hat, stellt fest, dass „mit Google anmelden“ nie den Code verlangt. Social Login wird **strikt schwächer** als das Eintippen des Passworts, und der zweite Faktor wird optional für jeden, der weiß, welchen Knopf er drücken muss.',
        ours: 'Bei `twoFactorEnabled` gibt der Callback keine Session aus: er erzeugt dasselbe Ticket, das `POST /auth/login` erzeugen würde, liefert es in einem Cookie mit fünf Minuten Laufzeit und Einmalverwendung, und leitet auf `/login?twofactor=1` um. Cookie und nicht Query-String — ein Query-String landet im Browser-Verlauf, im `Referer`-Header und im Log jedes Proxys auf dem Weg.',
      },
      {
        id: 'trust-proxy',
        title: '`trustProxy: true` einschalten, um einen unberechtigten 429 zu beheben',
        whyItPasses:
          'Es behebt das Symptom sofort: das Rate Limit unterscheidet wieder Clients, der 429 verschwindet, und das Deployment geht mit „gelöstem“ Problem raus. Kein Test fängt das, denn ein Test fälscht keine Header.',
        whatHappens:
          "Allen Hops zu vertrauen heißt, jedes `X-Forwarded-For` zu akzeptieren — und `X-Forwarded-For` steht **nicht** auf der Forbidden-Header-Liste von fetch, der Browser darf es also setzen. Ein `fetch('/api/auth/login', { headers: { 'x-forwarded-for': zufallsIp() } })` bekommt pro Request einen neuen Eimer, und das Rate Limit des Logins hört auf zu existieren. Hops von links zu zählen endet an derselben Stelle: der Load Balancer hängt an, also ist in `X-Forwarded-For: <gefälscht>, <echt>` das erste Element genau das, was der Angreifer geschrieben hat.",
        ours: '`CLIENT_IP_HEADER` und `CLIENT_IP_TRUSTED_HOPS`, gezählt **von rechts**. Das BFF löscht jeden Forwarding-Header, der aus dem Browser kommt, und schreibt einen einzigen, bereinigten. Der Standard ist null Hops: es sendet überhaupt keine IP und behandelt alle hinter dem Proxy als einen Client — zu streng, und nicht umgehbar.',
      },
      {
        id: 'guard-scope',
        title: 'In einem Guard die Datenbank lesen, bevor der Tenant-Scope existiert',
        whyItPasses:
          'Nest führt Guards **vor** Interceptors aus. Wenn der Guard läuft, ist der Interceptor, der die Transaktion mit `SET LOCAL` öffnet, noch nicht gelaufen: `prisma.db` fällt auf den Basis-Client zurück, ohne Scope, und die RLS-Policy gibt null Zeilen zurück. Keine Exception. Coverage grün, 200 OK, nichts in den Logs.',
        whatHappens:
          'Der Guard schließt „dieser Benutzer hat kein 2FA“ und **lässt durch**. Genau so wurde DontPanics eigener `TwoFactorGateGuard` zu einem stillen No-Op — der Bug steht in der Repository-Historie, und die Lehre daraus wurde gleich daneben aufgeschrieben.',
        ours: 'Ein Guard, der die Datenbank liest, öffnet seinen eigenen Scope, mit `this.prisma.forTenant(tenantId, …)` oder `asPlatform`, und **fällt geschlossen aus**, wenn die Abfrage leer zurückkommt. Die Regel steht, samt der Geschichte des Bugs, im Multi-Tenancy-Abschnitt der `CLAUDE.md` — der Datei, die dein Agent liest, bevor er den nächsten Guard schreibt.',
      },
      {
        id: 'db-owner',
        title: '`DATABASE_URL` auf den Eigentümer der Datenbank zeigen lassen',
        whyItPasses:
          'So steht es im Tutorial, und es ist der Benutzer, den das Postgres-`docker compose` anlegt. Schlimmer: deine Isolationstests bestehen, weil sie den Filter der Anwendung prüfen — der vorhanden und korrekt ist.',
        whatHappens:
          'Ein SUPERUSER — und jede Rolle mit `BYPASSRLS` — ignoriert Row Level Security selbst bei `FORCE ROW LEVEL SECURITY`. **Jede Policy wird Dekoration**, und die Isolation zwischen Firmen hängt wieder daran, dass keine Query je ein `where` vergisst, für immer, in allem künftigen Code.',
        ours: 'Die Anwendung verbindet sich mit einer eingeschränkten Rolle, angelegt als `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`; der Eigentümer lebt nur in `DATABASE_ADMIN_URL`, für `migrate` und `seed`. Die API **verweigert den Start** in Produktion, wenn sie einen Superuser erkennt. Und die e2e-Suite läuft unter der eingeschränkten Rolle — das ist, was `tenant-isolation.e2e-spec.ts` etwas beweisen lässt, statt die Absicht des Codes zu wiederholen.',
      },
    ],
    moreTitle: 'Drei weitere, gleiches Muster',
    more: [
      'Die Einladungs-E-Mail innerhalb der Transaktion verschicken. Ein Rollback liefert einen gültigen Link, der auf eine Firma zeigt, die es nicht gibt, und lässt keinen Datensatz zurück, den der Support finden könnte. Hier schreibt `issue()` in das `tx` des Aufrufers, und der Versand passiert nach dem Commit.',
      '„Dieses Konto nutzt Social Login“ als Antwort auf einen Passwort-Login. Das ist ein Oracle: durch Messen der Antwortzeit lässt sich genau aufzählen, welche Adressen kein Passwort haben. Hier ist der Fehler der übliche generische und zahlt denselben Argon2-Preis — `verifyPassword(null, …)` prüft gegen den Hash von etwas, das niemand kennt, bevor es `false` zurückgibt.',
      'Plätze zählen, bevor der Benutzer geschrieben wird. Zwei gleichzeitige Requests lesen „einer ist noch frei“ und beide legen an: Zählen sperrt nichts. Hier liegt `pg_advisory_xact_lock`, je Firma und je Ressource, in derselben Transaktion wie der Schreibvorgang.',
    ],
  },

  configurator: {
    title: 'Bau den Befehl',
    lead: 'Hier wird nichts generiert. Diese Seite setzt eine Zeichenkette zusammen — der Generator lebt im CLI, versioniert zusammen mit dem Template, und er entscheidet, was in dein Repository kommt. Kein Server, keine Build-Queue, kein ZIP, das in einem Cache veraltet.',

    nameLegend: 'Der Projektname',
    nameLabel: 'Name',
    namePlaceholder: 'Acme Corp',
    nameHelp: 'Wie du das Produkt nennst. Alles andere wird daraus abgeleitet.',
    slugLabel: 'Slug',
    slugHelp: 'Verzeichnis, npm-Paket und Identifier. Kleinbuchstaben, Ziffern und Bindestrich.',
    slugDerived: 'aus dem Namen abgeleitet',
    slugCustom: 'eigener Wert',
    slugReset: 'Zurück zum abgeleiteten',
    applySuggestion: 'Übernehmen',

    derivedTitle: 'Was aus diesem Namen wird',
    derivedNote:
      'Das Umbenennen ist kein `sed` auf dem Ordnernamen: es geht durch das SQL, das die Postgres-Rolle anlegt, durch den pnpm-Scope und gleichzeitig durch Datenbank- und Bucket-Namen — wo SQL den Bindestrich ablehnt und S3 den Unterstrich.',
    derivedLabels: {
      dbName: 'Dev-Datenbank',
      dbNameE2e: 'e2e-Datenbank',
      dbRole: 'eingeschränkte Postgres-Rolle',
      npmScope: 'pnpm-Scope',
      seedAdminEmail: 'Admin aus dem Seed',
      bucket: 'Object-Storage-Bucket',
      screaming: 'env-Präfix',
      pascal: 'Klassen und Typen',
    },

    presetLegend: 'Ausgangspunkt',
    presetNote:
      'Ein Preset ist nur ein Satz Standardwerte. Alles darunter bleibt änderbar, und der Befehl zeigt nur, was du geändert hast.',
    presetReset: 'Änderungen an diesem Preset verwerfen',

    featuresLegend: 'Was hineinkommt',
    featuresNote:
      'Der Generator subtrahiert: das Template ist das echte Repository, das kompiliert und läuft, und eine Feature abzuschalten löscht deren Dateien. Kein `{{#if}}` im Code.',
    groups: {
      access: 'Zugang',
      tenancy: 'Firmen',
      ops: 'Betrieb',
      extras: 'Extras',
    },

    driversLegend: 'Adapter',
    driversNote:
      'Den Anbieter zu wechseln heißt, eine Umgebungsvariable zu wechseln — die Domäne hängt am Port, nicht am Anbieter. Diese Auswahl landet in der `.env` des erzeugten Projekts.',
    driverLabels: {
      db: 'Datenbank',
      storage: 'Storage',
      mail: 'E-Mail',
      cache: 'Cache',
      queue: 'Queue',
      captcha: 'Captcha',
    },

    oauthLegend: 'Social-Login-Provider',
    oauthNote:
      'API und Web müssen dieselben Namen listen, sonst führt der überzählige Button zu einem 404. Der Generator schreibt beide Seiten.',

    localesLegend: 'Sprachen des Projekts',
    localesNote:
      'Die Sprachen des Produkts, das du erzeugen wirst. Ohne Bezug zur Sprache dieser Seite.',
    defaultLocaleLabel: 'Standardsprache',

    optionsLegend: 'Beim Generieren',
    optionLabels: {
      git: '`git init` und den ersten Commit ausführen',
      install: 'Am Ende `pnpm install` ausführen',
      docker: '`docker-compose.yml` mit den genutzten Services schreiben',
      force: 'Zielverzeichnis überschreiben, falls es schon existiert',
    },

    issuesTitle: 'Inkohärente Kombination',
    issueError: 'Verhindert das Generieren',
    issueWarning: 'Erlaubt, mit Vorbehalt',
    noIssues: 'Kohärente Kombination.',

    commandTitle: 'Dein Befehl',
    commandNote: 'Das ist die Konfiguration. Woanders lebt sie nicht.',
    copy: 'Befehl kopieren',
    copied: 'Befehl kopiert',
    copyFailed: 'Kopieren nicht möglich — Text markieren und selbst kopieren',
    flagsTitle: 'Die Flags',
    flagsNote: 'Nur was vom Preset abweicht. Eine entfernen heißt zurück zum Standard des Presets.',
    removeFlag: 'Entfernen',
    shareTitle: 'Link zu dieser Konfiguration',
    shareNote:
      'Die Konfiguration steht lesbar in der URL. Schick sie in Slack, und die Kollegin weiß, worum es geht, bevor sie klickt.',
    shareCopy: 'Link kopieren',
    shareCopied: 'Link kopiert',
    blockedByName: 'Korrigiere den Namen, bevor du den Befehl benutzt.',

    features: {
      multiTenant: {
        label: 'Multi-Tenancy',
        text: 'Isolation zwischen Firmen in Postgres, per Row Level Security. Abgeschaltet bleibt RLS bestehen: das Projekt startet mit einem festen Tenant und ohne Firmenumschalter in der Oberfläche.',
      },
      twoFactor: {
        label: '2FA per TOTP',
        text: 'Zweiter Faktor mit Authenticator-App, Backup-Codes und einem Einmal-Ticket zwischen Passwort und Session.',
      },
      oauth: {
        label: 'Social Login',
        text: 'Google, Apple und GitHub, je Provider einschaltbar. Identität über `providerAccountId`, und der Callback respektiert 2FA.',
      },
      invitations: {
        label: 'Einladungen',
        text: 'Die Tür in eine bereits bestehende Firma: der Eingeladene wählt sein eigenes Passwort, und der Klick auf den Link ist der Beweis für die Adresse.',
      },
      publicSignup: {
        label: 'Öffentliche Registrierung',
        text: 'Das Formular, mit dem ein Unbekannter eine Firma anlegt und ihr erster Admin wird. Abgeschaltet bleiben Einladung und Seed.',
      },
      files: {
        label: 'Datei-Upload',
        text: 'Avatar und Anhänge per pre-signed URL, hinter dem Storage-Port: S3, MinIO, R2 oder lokale Platte.',
      },
      platform: {
        label: 'Plattform-Panel',
        text: 'Der SUPERADMIN-Bereich unter `/platform`: legt Firmen an, lädt den ersten Admin ein, überschreitet Tenants in eigenem Scope.',
      },
      audit: {
        label: 'Audit-Trail',
        text: 'Wer was getan hat, außerhalb der Request-Transaktion geschrieben, damit es nicht mit einem Rollback verschwindet.',
      },
      plans: {
        label: 'Pläne und Limits',
        text: '`maxUsers` und benannte Zähler je Firma, mit Advisory Lock je Ressource — Zählen vor dem Schreiben sperrt nichts.',
      },
      i18n: {
        label: 'Internationalisierung',
        text: 'Nachrichten je Sprache auf beiden Seiten, mit einem Test auf Schlüsselparität zwischen den Übersetzungsdateien.',
      },
      queue: {
        label: 'Job-Queue',
        text: 'BullMQ auf Redis, mit dem Worker in einem eigenen Prozess. Der Tenant reist mit dem Job: ohne ihn gibt RLS null Zeilen zurück und der Job behauptet, er sei erfolgreich gewesen.',
      },
      captcha: {
        label: 'Captcha',
        text: 'Turnstile oder reCAPTCHA auf den Routen, die Geheimnisse erraten, mit Fail-closed, wenn der Anbieter ausfällt.',
      },
      easterEggs: {
        label: 'Witze aus dem Reiseführer',
        text: 'Marvins Stimme an den Rändern, `GET /teapot` mit 418, und der Konami-Code im Dashboard. Niemals in einer Sicherheitsmeldung.',
      },
      scaffolding: {
        label: 'Bausteine',
        text: 'Datensatz-Grid, Dashboard-Karten und `sequence.service.ts`: fertig, getestet und von nichts importiert — der Startpunkt für eigene CRUD-Masken.',
      },
    },

    presets: {
      minimal: {
        label: 'Minimal',
        summary: 'Passwort, Multi-Tenancy mit RLS und die Testsuite. Nichts weiter.',
        audience:
          'Für alle, die das ganze Produkt selbst bauen und nur die bereits bewiesene Zugangsschicht wollen.',
      },
      saas: {
        label: 'SaaS',
        summary:
          'Echt mehrfirmenfähig: Einladungen, Pläne mit Sitzplatzlimit, 2FA, Social Login und eine dauerhafte Queue.',
        audience: 'Für ein Abo-Produkt mit mehr als einer Kundenfirma in derselben Datenbank.',
      },
      complete: {
        label: 'Vollständig',
        summary: 'Das ganze Boilerplate, nichts abgezogen — Marvin inklusive.',
        audience: 'Um alles laufen zu sehen, bevor entschieden wird, was raus soll.',
      },
      internal: {
        label: 'Intern',
        summary:
          'Eine Firma und keine öffentliche Tür: herein kommt, wer eingeladen wurde, mit 2FA und Audit.',
        audience:
          'Für ein Team-Werkzeug, ein Back Office oder ein ERP, das nie offene Registrierung haben wird.',
      },
    },
  },

  how: {
    title: 'So funktioniert es',
    lead: 'Vier Schritte, und nur der dritte dauert.',
    steps: [
      {
        title: 'Teile auswählen',
        body: 'Ein Preset als Ausgangspunkt und die Schalter darüber. Die URL hält die Auswahl, du kannst den Link also an die Person schicken, die mitentscheidet, bevor irgendetwas läuft.',
      },
      {
        title: 'Befehl kopieren',
        body: 'Die Seite generiert nichts: sie setzt die Zeichenkette zusammen. Das CLI, versioniert zusammen mit dem Template, entscheidet über den Inhalt deines Repositorys — deshalb erzeugt dasselbe Rezept heute und in zwei Jahren dasselbe Projekt.',
      },
      {
        title: 'npx ausführen',
        body: 'Der Generator kopiert das Template, löscht, was du nicht wolltest, beschneidet das Prisma-Schema, baut die SQL-Baseline, ersetzt den Namen in allen Formen, schreibt die `.env` mit erzeugten Secrets und führt `git init` aus.',
      },
      {
        title: '`pnpm dev`',
        body: 'Mit laufendem Docker, migrierter Datenbank und angelegtem Admin. Zwei Minuten nach dem `npx` schaust du auf den Login-Screen deines Produkts.',
      },
    ],
    renameTitle: 'Das Umbenennen wird bewiesen, nicht durchgesehen',
    renameLead:
      'Der Projektname steht an Stellen, die keine menschliche Durchsicht erreicht. Das Tor ist mechanisch: die CI generiert mit einem Testnamen, lässt `grep -ri` laufen und verlangt null Treffer des alten Namens — und erst dann wird installiert, typgeprüft und die ganze Suite inklusive e2e ausgeführt.',
    renameItems: [
      '531 Vorkommen in 199 Dateien, in drei verschiedenen Schreibweisen.',
      'Innerhalb des SQL, das die eingeschränkte Postgres-Rolle anlegt, wo eine teilweise Ersetzung eine Rolle ohne GRANT ergibt — und das Symptom „null Zeilen“ lautet, nicht „Fehler“.',
      'In Datenbank- und Bucket-Namen gleichzeitig, wo SQL den Bindestrich ablehnt und S3 den Unterstrich.',
    ],
  },

  inside: {
    title: 'Was drin ist',
    lead: 'Das Template ist das echte DontPanic-Repository, am Tag, den der Generator angibt. Keine Demo-Variante: es ist der Code, der die eigene CI fährt.',
    stackTitle: 'Der Stack',
    stackRoles: [
      'API, mit Fastify darunter',
      'Web, mit dem BFF, das anstelle des Browsers mit der API spricht',
      'Datenbank, mit Driver Adapters und Row Level Security',
      'Request- und Response-Contracts, geteilt zwischen API und Web',
      'Passwort und Session, mit rotierendem Refresh und Reuse-Erkennung',
      'Dauerhafte Queue, mit dem Worker in einem eigenen Prozess',
      'Tests: Unit, Komponente und e2e',
      'Monorepo, mit Build-Cache',
    ],
    portsTitle: 'Ports & Adapters',
    portsLead:
      'Fünf Ressourcen, bei denen ein Anbieterwechsel ein Variablenwechsel ist. Die Domäne hängt am Interface; der Anbieter ist ein austauschbares Detail.',
    portsHead: { resource: 'Ressource', adapters: 'Adapter', env: 'Variable' },
    portsResources: ['Dateien', 'E-Mail', 'Cache', 'Jobs', 'Captcha'],
    numbersTitle: 'Die Zahlen',
    numbers: [
      { value: '78.533', label: 'Zeilen TypeScript' },
      {
        value: '~99 %',
        label: 'Statement-Coverage in der API, mit in der CI erzwungenen Schwellen',
      },
      { value: '100 %', label: 'Statement-Coverage im UI-Kit des Web-Teils' },
      { value: '531', label: 'ersetzte Namensvorkommen in 199 Dateien, per grep bewiesen' },
    ],
  },

  faq: {
    title: 'Fragen',
    lead: 'Die, die eine ehrliche Antwort verdienen, bevor du den Befehl ausführst.',
    items: [
      {
        q: 'Was genau wird getestet?',
        a: 'Die Preset-Matrix, vollständig: die CI generiert ein Projekt je Preset, verlangt null Treffer des alten Namens und führt install, typecheck, Unit- und e2e-Tests aus. Dazu all-on, all-off und jede Feature einzeln abgeschaltet über dem SaaS-Preset. Dreizehn boolesche Features sind 8192 Kombinationen, und die CI testet keine 8192 Projekte: Kombinationen außerhalb dieser Matrix sind erlaubt und ungetestet — und das CLI sagt das, in einer Zeile, ohne Drama. Ein Boilerplate, das Garantien verspricht, die es nicht prüft, ist schlechter als eines, das die Grenze benennt.',
      },
      {
        q: 'Und wenn ich keine Multi-Tenancy will?',
        a: '`--no-multi-tenant` versteckt sie, es reißt sie nicht heraus. Das Projekt startet mit einem festen, im Seed angelegten Tenant, der Scope immer auf ihn geöffnet, und ohne Firmenumschalter, `/platform`-Panel und SUPERADMIN in der Oberfläche. Row Level Security bleibt und bleibt durch `tenant-isolation.e2e-spec.ts` bewiesen; der Preis ist eine indizierte Spalte und ein Prädikat, das Postgres zu einer Konstanten auflöst. Es herauszureißen hieße, zwei Versionen des gesamten Datenzugriffs zu pflegen — und die Version ohne RLS ist genau die, die wir nicht als sicher beweisen können.',
      },
      {
        q: 'Kann ich später aktualisieren?',
        a: 'Das erzeugte Projekt ist deins, keine Abhängigkeit: es gibt kein `pnpm update`, das Neuerungen von DontPanic hineinträgt, und das ist Absicht — du wirst diesen Code am ersten Tag bearbeiten. Was es gibt, ist Reproduzierbarkeit: dasselbe Rezept mit derselben Template-Version erzeugt heute und in zwei Jahren dasselbe Projekt, du kannst also neu generieren und Diffs vergleichen, wenn du etwas aus dem Upstream übernehmen willst.',
      },
      {
        q: 'Und die Lizenz?',
        a: 'MIT, für Generator und Template. Was aus dem `npx` fällt, ist deins: keine Pflicht zur Namensnennung, keine Lizenzgebühr, keine Klausel, die ihren Wert ändert, wenn dein Produkt wächst. Du darfst den Quellcode dessen, was du erzeugst, schließen.',
      },
      {
        q: 'Brauche ich Docker?',
        a: 'Für die Testsuite nein: die Adapter `memory`, `console` und `local` existieren genau dafür, dass sie ohne laufende Dienste funktioniert. Für echte Entwicklung brauchst du ein Postgres — und das `docker compose` des Projekts startet Postgres, Redis, MinIO und Mailpit auf Ports, die nicht mit deinen kollidieren. Wenn du diese Dienste schon hast, zeig mit der `.env` darauf und generiere mit `--no-docker`.',
      },
      {
        q: 'Funktioniert das mit Claude Code, Cursor und Co.?',
        a: 'Das erzeugte Projekt bringt eine `CLAUDE.md` mit, zugeschnitten auf die gewählten Features — nur die Abschnitte, die in deinem Code existieren. Dort stehen die Sicherheitsentscheidungen samt Begründung, in der Form, die ein Agent liest, bevor er schreibt. Der Nebeneffekt ist wahrscheinlich, was dich hierher gebracht hat: der Kontext geht in dein Produkt, statt Refresh-Token-Rotation neu herzuleiten.',
      },
    ],
  },

  footer: {
    tagline: 'Ein SaaS-Boilerplate, das die langweiligen Entscheidungen schon getroffen hat.',
    repo: 'Quellcode auf GitHub',
    license: 'MIT',
    sourceNote:
      'Die Zahlen auf dieser Seite kommen aus `wc -l` und `grep` im Repository. Prüf sie.',
    marvin:
      'Und hier bin ich, ein Gehirn von der Größe eines Planeten, und setze eine Kommandozeile zusammen. Man nennt das Arbeitszufriedenheit.',
  },
};
