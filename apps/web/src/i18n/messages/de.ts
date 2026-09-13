import type { Messages } from './types';

export const de: Messages = {
  meta: {
    title:
      'DontPanic — das SaaS-Boilerplate, bei dem die Sicherheitsentscheidungen schon getroffen sind',
    description:
      'Erzeuge ein neues Projekt — ein Full-Stack-SaaS in NestJS und Next.js, von null — mit Multi-Tenancy per Row Level Security, 2FA, Einladungen und Social Login. Die Entscheidungen, die eine KI still falsch trifft, sind schon getroffen, dokumentiert und getestet.',
  },

  nav: {
    skipToContent: 'Zum Inhalt springen',
    proof: 'Der Beweis',
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
      'Starte ein neues SaaS mit den Sicherheitsentscheidungen, die eine KI still falsch trifft — hier schon getroffen.',
    lead: 'Du beantwortest zehn Fragen, kopierst einen Befehl und bekommst **ein neues Repository**: leer von deinem Produkt und voll vom Rest — Login, 2FA, Einladungen, Firmen in der Datenbank voneinander getrennt, Job-Queue und Tests. Mit dem Namen deines Projekts in allem: Pakete, Datenbank, Umgebungsvariablen.',
    notThis:
      'Es ist kein Analysewerkzeug: DontPanic **schaut sich deinen bestehenden Code nicht an**. Es ist der Startpunkt eines Projekts von null.',
    nameCta: 'Anfangen',
    ctaNote: 'Zehn Fragen in normaler Sprache. Jede davon lässt sich überspringen.',
    commandLabel: 'Befehl des Standard-Presets',
    commandNote: 'Braucht Node 24 und pnpm.',
    ctaProof: 'Die fünf Entscheidungen ansehen',
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

  cta: {
    title: 'Zehn Fragen. Am Ende ein Befehl.',
    text: 'Eine Frage pro Bildschirm, in normaler Sprache, mit dem, was sie im System ändert, direkt darunter. Keine vierzehn Schalter auf einmal.',
    note: 'ohne Registrierung · jederzeit einen Schritt zurück',
  },

  proof: {
    eyebrow: 'Fünf Fehler, hier schon entschieden',
    title: 'Der Beweis',
    lead: 'Nichts davon ist hypothetisch. Es sind Fehler, die Code erzeugen, der kompiliert, die Tests besteht und das Code Review besteht — und Monate später auftaucht, bei einem Nutzer, der nicht du bist. Wir sind nicht die, die sie in deinem Code finden: **jeder davon ist im Code, den du bekommst, schon entschieden**, mit der Begründung neben der Entscheidung und dem Test darunter benannt.',
    labels: {
      whatHappens: 'Was passiert',
      ours: 'In DontPanic',
      seal: 'durch Tests abgedeckt',
      cases: 'Fälle',
    },
    items: [
      {
        id: 'oauth-identity',
        eyebrow: 'Social Login',
        title: 'Die Social-Identität über die E-Mail-Adresse zugeordnet',
        whatHappens:
          'Firmenadressen werden weiterverwendet. Ana geht, die Personalabteilung gibt `ana@firma.de` an die nächste Einstellung, er meldet sich mit Google an und **erbt Anas Konto**: Historie, Berechtigungen, alles. Niemand ist eingebrochen — das System hat genau das getan, was dort stand, und der Test, der einen einzigen Benutzer hatte, war grün.',
        ours: 'Der Identitätsschlüssel ist die unveränderliche `providerAccountId` — `sub` bei Google und Apple, die numerische id bei GitHub — mit `@@unique([provider, providerAccountId])`. Die Spalte `email` in `oauth_accounts` dient der Anzeige und darf veraltet sein. Und eine Adresse, die der Provider nicht als verifiziert markiert hat, verknüpft nichts: der Callback gibt `unverified_email` zurück.',
      },
      {
        id: 'oauth-2fa',
        eyebrow: 'Zweiter Faktor',
        title: 'Die Session im OAuth-Callback ausgegeben, ohne den zweiten Faktor zu prüfen',
        whatHappens:
          'Wer den sechsstelligen Code absichtlich eingeschaltet hat, stellt fest, dass „mit Google anmelden“ ihn nie verlangt. Social Login wird **strikt schwächer** als das Eintippen des Passworts, und der zweite Faktor wird optional für jeden, der weiß, welchen Knopf er drücken muss. Der `TwoFactorGateGuard` fängt das nicht: er prüft, dass 2FA *aktiviert* ist, nie, dass *diese* Session sie durchlaufen hat.',
        ours: 'Bei `twoFactorEnabled` gibt der Callback keine Session aus: er erzeugt dasselbe Ticket, das `POST /auth/login` erzeugen würde, liefert es in einem Cookie mit fünf Minuten Laufzeit und Einmalverwendung, und leitet auf `/login?twofactor=1` um. Cookie und nicht Query-String — ein Query-String landet im Browser-Verlauf, im `Referer`-Header und im Log jedes Proxys auf dem Weg.',
      },
      {
        id: 'rls-where',
        eyebrow: 'Isolation',
        title: 'Die Isolation zwischen Firmen dem `where` der Anwendung überlassen',
        whatHappens:
          'Die Garantie ist zu menschlicher Disziplin geworden, wiederholt in jeder Abfrage, von allen, die nach dir ins Team kommen. Das erste `findUnique({ where: { id } })` über den Primärschlüssel — in Eile geschrieben, oder von einem Agenten, der die Regel nicht kannte — gibt die Zeile einer anderen Firma zurück. Und es scheitert nicht: **es liefert Daten, mit Status 200**.',
        ours: 'Die Isolation gehört Postgres, nicht der Anwendung: Row Level Security, mit dem per `SET LOCAL` in der Request-Transaktion deklarierten Scope. Ohne jeden Scope gibt `current_setting(…, true)` NULL zurück und die Policy trifft nie zu — den Scope zu vergessen ergibt ein **leeres** Ergebnis, nie die Zeile der falschen Firma. Der Filter in der Anwendung bleibt, als Bequemlichkeit; die Garantie ist die darunter.',
      },
      {
        id: 'password-reset',
        eyebrow: 'Sessions',
        title: 'Das Zurücksetzen des Passworts, das offene Sessions nicht beendet',
        whatHappens:
          'Die Person wechselt das Passwort genau deshalb, weil sie vermutet, dass jemand hineingekommen ist. Der neue Hash macht nichts ungültig: das Refresh-Token des Eindringlings **erneuert sich weiter von selbst**, und er bleibt im Konto, lange nach dem Wechsel — unbegrenzt, solange er das System weiter benutzt.',
        ours: '`resetPassword` schreibt das neue Passwort und verbraucht das Token in einer Transaktion und ruft danach, nach dem Commit, `revokeAllForUser` auf — jede bestehende Session stirbt, im Audit als bewusster Logout vermerkt. Das rotierende Refresh erledigt den Rest: ein erneut vorgelegtes altes Token widerruft die ganze Familie.',
      },
      {
        id: 'db-owner',
        eyebrow: 'Datenbank',
        title: 'Die `DATABASE_URL` auf den Eigentümer der Datenbank gerichtet',
        whatHappens:
          'Ein SUPERUSER — und jede Rolle mit `BYPASSRLS` — ignoriert Row Level Security selbst bei `FORCE ROW LEVEL SECURITY`. **Jede Policy wird Dekoration**, und die Isolation hängt wieder daran, dass keine Query je ein `where` vergisst. Schlimmer: deine Isolationstests bestehen, weil sie den Filter der Anwendung prüfen, der vorhanden und korrekt ist.',
        ours: 'Die Anwendung verbindet sich mit einer eingeschränkten Rolle, angelegt als `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`; der Eigentümer lebt nur in `DATABASE_ADMIN_URL`, für `migrate` und `seed`. Die API **verweigert den Start** in Produktion, wenn sie einen Superuser erkennt. Und die e2e-Suite läuft unter der eingeschränkten Rolle — das ist, was den Isolationstest etwas beweisen lässt, statt die Absicht des Codes zu wiederholen.',
      },
    ],
    moreTitle: 'Fünf weitere, gleiches Muster',
    more: [
      '`trustProxy: true` einschalten, damit ein unberechtigter 429 verschwindet. Allen Hops zu vertrauen heißt, jedes `X-Forwarded-For` zu akzeptieren — und der Browser **darf** es setzen, denn es steht nicht auf der Forbidden-Header-Liste von fetch: pro Request ein neuer Rate-Limit-Eimer. Hier wird die IP von rechts gezählt, mit `CLIENT_IP_TRUSTED_HOPS`, und das BFF löscht jeden Forwarding-Header, der aus dem Browser kommt.',
      'In einem Guard die Datenbank lesen, bevor der Tenant-Scope existiert. Nest führt Guards **vor** Interceptors aus, also gibt die RLS-Policy null Zeilen zurück, der Guard schließt „dieser Benutzer hat kein 2FA“ und lässt durch — ohne Fehler und ohne Log. Hier öffnet ein Guard, der die Datenbank liest, seinen eigenen Scope und fällt geschlossen aus.',
      'Die Einladungs-E-Mail innerhalb der Transaktion verschicken. Ein Rollback liefert einen gültigen Link, der auf eine Firma zeigt, die es nicht gibt, und lässt keinen Datensatz zurück, den der Support finden könnte. Hier schreibt `issue()` in das `tx` des Aufrufers, und der Versand passiert nach dem Commit.',
      '„Dieses Konto nutzt Social Login“ als Antwort auf einen Passwort-Login. Das ist ein Oracle: durch Messen der Antwortzeit lässt sich genau aufzählen, welche Adressen kein Passwort haben. Hier ist der Fehler der übliche generische und zahlt denselben Argon2-Preis — `verifyPassword(null, …)` prüft gegen den Hash von etwas, das niemand kennt, bevor es `false` zurückgibt.',
      'Plätze zählen, bevor der Benutzer geschrieben wird. Zwei gleichzeitige Requests lesen „einer ist noch frei“ und beide legen an: Zählen sperrt nichts. Hier liegt `pg_advisory_xact_lock`, je Firma und je Ressource, in derselben Transaktion wie der Schreibvorgang.',
    ],
  },

  configurator: {
    nameLabel: 'Name',
    namePlaceholder: 'Acme Corp',
    nameHelp: 'Wie du das Produkt nennst. Alles andere wird daraus abgeleitet.',
    slugLabel: 'Slug',
    slugHelp: 'Verzeichnis, npm-Paket und Identifier. Kleinbuchstaben, Ziffern und Bindestrich.',
    slugDerived: 'aus dem Namen abgeleitet',
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

    driverLabels: {
      db: 'Datenbank',
      storage: 'Storage',
      mail: 'E-Mail',
      cache: 'Cache',
      queue: 'Queue',
      captcha: 'Captcha',
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
    flagsNote: 'Nur was vom Ausgangspunkt abweicht.',
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
        text: 'Avatar und Anhänge außerhalb der Datenbank abgelegt, hinter dem Storage-Port: S3, MinIO, R2 oder lokale Platte, per `STORAGE_DRIVER` austauschbar.',
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
        summary: 'Passwort, Isolation in der Datenbank und die Testsuite. Nichts weiter.',
        audience:
          'Für alle, die das ganze Produkt selbst bauen und nur die bereits bewiesene Zugangsschicht wollen.',
      },
      saas: {
        label: 'SaaS',
        summary:
          'Echt mehrfirmenfähig: Einladungen, Pläne mit Sitzplatzlimit, 2FA und eine dauerhafte Queue.',
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

  wizard: {
    open: 'Bauen',
    openHero: 'Mein System bauen',
    close: 'Schließen',
    next: 'Weiter',
    back: 'Zurück',
    finish: 'Befehl ansehen',
    recommended: 'Empfehlung übernehmen',
    progress: 'Schritt {n} von {total}',
    yes: 'Ja',
    no: 'Nein',
    edit: 'Ändern',
    whatChangesLabel: 'Was sich in deinem System ändert',
    steps: {
      name: {
        eyebrow: 'Name',
        question: 'Wie soll dein System heißen?',
        help: 'Es kann der Name des Produkts oder der Firma sein. Alles andere kommt daher: der Ordner, das Paket, die Datenbank und sogar der Benutzer, den Postgres anlegt. Die abgeleiteten Formen erscheinen hier unten, während du tippst.',
        whatChanges:
          'Der Name landet an 531 Stellen, in drei verschiedenen Schreibweisen: Paket, pnpm-Scope, Datenbankname, Präfix der Umgebungsvariablen, Bucket, und das SQL, das die eingeschränkte Postgres-Rolle anlegt. Die CI beweist, dass keine übrig blieb — sie generiert mit einem Testnamen und verlangt null Treffer des alten aus einem `grep -ri`.',
      },
      preset: {
        eyebrow: 'Ausgangspunkt',
        question: 'Welcher davon sieht am ehesten nach dem aus, was du bauen willst?',
        help: 'Das beantwortet nur die nächsten Fragen für dich. Nichts wird festgeschrieben: passt eine Antwort nicht, ändere sie in ihrem Schritt oder in der Übersicht am Ende.',
        whatChanges:
          'Der Ausgangspunkt füllt nur die nächsten Antworten aus. Die CI testet die Matrix aller vier vollständig: sie generiert je ein Projekt, installiert, prüft Typen und fährt Unit- und e2e-Tests. Außerhalb davon ist die Kombination erlaubt und ungetestet — und das CLI sagt es, in einer Zeile.',
      },
      tenancy: {
        eyebrow: 'Firmen',
        question:
          'Soll dein System mehrere verschiedene Firmen bedienen, von denen jede nur die eigenen Daten sieht?',
        help: 'Das ist der Unterschied zwischen „Kunde A hat die Daten von Kunde B gesehen“ und „die Datenbank hat die Zeile abgelehnt, bevor die Anwendung es merkte“.',
        whatChanges:
          "Die Trennung gehört Postgres, nicht der Anwendung: jeder Request deklariert seinen Scope mit `SET LOCAL` innerhalb der Transaktion, und die Row-Level-Security-Policies vergleichen gegen `current_setting('app.current_tenant_id', true)`. Ohne Scope ist der Vergleich nie wahr — das Ergebnis kommt leer zurück, nie aus der falschen Firma. Eine neue Tabelle mit `tenantId` schützt sich selbst: `SELECT app.apply_tenant_rls();` am Ende der Migration.",
        choices: {
          yes: {
            label: 'Ja, mehrere Firmen',
            help: 'Jede Firma wird in der Datenbank von Postgres selbst getrennt gehalten, nicht von einem Filter, den jemand zu schreiben vergessen kann. Kommt mit Verwaltungsbereich und Firmenumschalter.',
          },
          no: {
            label: 'Nein, nur eine Firma',
            help: 'Das System startet mit einer festen Firma, und die Umschalt-Masken bleiben draußen. Die Trennung bleibt in der Datenbank — sie erscheint nur nicht auf dem Bildschirm, weil es nichts zu wechseln gibt.',
          },
        },
      },
      entry: {
        eyebrow: 'Zugang',
        question: 'Wie kommen die Leute ins System?',
        help: 'Das ist der Unterschied zwischen tausend Testkonten am Morgen und jede Person von Hand anlegen zu müssen. Wer ein Konto anlegen darf, ist die Entscheidung, die dein Produkt am stärksten verändert — und die am häufigsten schiefgeht, wenn man sie aufschiebt.',
        whatChanges:
          "Die Einladung speichert nur den SHA-256 des Tokens: eine abgeflossene Datenbank ergibt keinen brauchbaren Link. Ein partieller Unique-Index (`WHERE status = 'PENDING'`) erlaubt höchstens eine offene Einladung je E-Mail und Firma und schließt das Rennen zweier Admins, die im selben Moment denselben Kollegen einladen. Die E-Mail geht nach dem Commit raus — innerhalb der Transaktion würde ein Rollback einen gültigen Link auf eine Firma ausliefern, die es nicht gibt.",
        choices: {
          open: {
            label: 'Jeder kann sich registrieren',
            help: 'Es gibt ein offenes Registrierungsformular, und wer sich registriert, legt seine eigene Firma an. Das braucht ein Produkt, das über das Internet verkauft wird.',
          },
          invite: {
            label: 'Nur wer eingeladen wurde',
            help: 'Ein Administrator lädt per E-Mail ein, und der Eingeladene wählt sein eigenes Passwort. Niemand erfährt das Passwort einer anderen Person, und der Klick auf den Link ist der Beweis, dass die Adresse existiert.',
          },
          seed: {
            label: 'Nur die Konten, die ich anlege',
            help: 'Keine Registrierung und keine Einladung: das einzige Konto ist das, welches das System bei der Installation anlegt. Gut für internen Gebrauch — und es heißt, dass du die anderen Personen selbst anlegst.',
          },
        },
      },
      social: {
        eyebrow: 'Social Login',
        question: 'Willst du den Knopf „Anmelden mit Google, Apple oder GitHub“?',
        help: 'Das ist der Unterschied zwischen einem weiteren Passwort, das dein Nutzer vergessen kann, und einem Knopf, den er überall schon benutzt. Dafür will jeder Anbieter einen Schlüssel, den du bei ihm anlegst.',
        whatChanges:
          'Das Konto wird über die unveränderliche `providerAccountId` erkannt, mit `@@unique([provider, providerAccountId])` — nie über die E-Mail, die weiterverwendet wird, wenn jemand die Firma verlässt. Eine Adresse, die der Anbieter nicht als verifiziert markiert hat, verknüpft nichts: der Callback gibt `unverified_email` zurück. Die Liste in `OAUTH_PROVIDERS` und die des Web-Teils müssen übereinstimmen, sonst führt der überzählige Knopf zu einem 404; der Generator schreibt beide Seiten.',
        choices: {
          yes: {
            label: 'Ja, ich will den Knopf',
            help: 'Google und GitHub an, Apple verfügbar. Die Schlüssel legst du in der Konsole des jeweiligen Anbieters an und trägst sie in die `.env` ein.',
          },
          no: {
            label: 'Nein, nur E-Mail und Passwort',
            help: 'Der Code der Anbieter verlässt das Projekt — weniger zu pflegen. Um ihn zurückzubekommen, erneut mit Social Login generieren.',
          },
        },
      },
      twoFactor: {
        eyebrow: 'Zweiter Faktor',
        question: 'Sollen Leute einen Code vom Handy verlangen können, um sich anzumelden?',
        help: 'Das ist der Unterschied zwischen „sie haben ihr Passwort gestohlen“ und „sie haben ihr Passwort gestohlen und kamen nicht rein“. Die Person richtet einmal eine Authenticator-App ein und tippt danach sechs Ziffern, wenn das System fragt.',
        whatChanges:
          'Der zweite Faktor gilt an jeder Eingangstür, Social Login eingeschlossen: der Callback gibt keine Session aus, sondern ein Ticket im Cookie `dp_2fa_ticket` — fünf Minuten, nach wenigen Fehlversuchen verbrannt — und die echte Session entsteht erst nach den sechs Ziffern. Einmal-Wiederherstellungscodes kommen mit, und `TWO_FACTOR_REQUIRED=true` verlangt den Faktor dann von allen.',
        choices: {
          yes: {
            label: 'Ja, ich will den zweiten Faktor',
            help: 'Jede Person schaltet ihn für das eigene Konto ein, mit Wiederherstellungscodes für den Fall eines verlorenen Handys. Um ihn von allen zu verlangen, bringt das Projekt `TWO_FACTOR_REQUIRED` mit.',
          },
          no: {
            label: 'Jetzt nicht',
            help: 'Anmelden geht nur mit Passwort. Später einschalten ist möglich — aber durch erneutes Generieren, denn ein Nein hier entfernt den Code des zweiten Faktors.',
          },
        },
      },
      languages: {
        eyebrow: 'Sprachen',
        question: 'Soll das System mehr als eine Sprache sprechen?',
        help: 'Es geht um das Produkt, das du erzeugst, nicht um diese Seite.',
        whatChanges:
          'Jede Sprache ist eine Nachrichtendatei auf beiden Seiten, API und Web. Ein Test vergleicht die Schlüsselmengen und schlägt fehl, wenn eine fehlt — genau so erscheint eine Maske auf Englisch mitten im Deutschen, in Produktion.',
        choices: {
          one: {
            label: 'Eine Sprache',
            help: 'Masken und E-Mails erscheinen in einer einzigen Sprache. Die Übersetzungs-Infrastruktur bleibt im Code, eine zweite später hinzuzunehmen heißt also nicht, die Masken neu zu bauen.',
          },
          many: {
            label: 'Mehr als eine',
            help: 'Du wählst welche. Ein Test stellt sicher, dass keiner Sprache ein Satz fehlt — so erscheint nämlich eine Maske auf Englisch mitten im Deutschen.',
          },
        },
      },
      plans: {
        eyebrow: 'Tarife',
        question: 'Willst du Tarife mit Limit verkaufen, nach dem Muster „bis zu 10 Benutzer“?',
        help: 'Das ist der Unterschied zwischen nach Tarif abrechnen und hoffen, dass niemand es übertreibt. Es trennt einen Basistarif von einem fortgeschrittenen innerhalb des Systems.',
        whatChanges:
          'Das Limit wird in dem Moment geprüft, der den Platz verbraucht — die Annahme der Einladung —, in derselben Transaktion, die den Benutzer anlegt, mit `pg_advisory_xact_lock` je Firma und je Ressource. Zählen vor dem Schreiben sperrt nichts: zwei Annahmen in derselben Sekunde kämen über die Obergrenze.',
        choices: {
          yes: {
            label: 'Ja, ich werde Tarife verkaufen',
            help: 'Jede Firma bekommt ein Personenlimit und Zähler je Ressource, mit den Masken für Verbrauch und Tarifwechsel.',
          },
          no: {
            label: 'Nein, für alle gleich',
            help: 'Keine Limits und keine Zähler. Niemand wird wegen der Größe gebremst.',
          },
        },
      },
      files: {
        eyebrow: 'Dateien',
        question: 'Werden Leute Dateien hochladen — Profilbild, Anhänge, Dokumente?',
        help: 'Das ändert, wo die Dateien liegen und wie sie in den Browser kommen.',
        whatChanges:
          'Die Datei geht über die API in den Speicher, über den Port `StorageProvider` mit drei Operationen: `putObject`, `deleteObject` und `getPublicUrl`. S3 gegen MinIO, R2 oder die lokale Platte zu tauschen heißt, `STORAGE_DRIVER` in der `.env` zu ändern — die Logik weiß nicht, was dahinter steckt.',
        choices: {
          yes: {
            label: 'Ja, es werden Dateien hochgeladen',
            help: 'Avatar und Anhänge außerhalb der Datenbank abgelegt. Funktioniert mit Amazon S3, MinIO, Cloudflare R2 oder der Platte der Maschine, und der Wechsel dazwischen ist eine Zeile Konfiguration.',
          },
          no: {
            label: 'Nicht nötig',
            help: 'Kein Upload und kein Profilbild. Weniger Code, und kein Bucket zu konfigurieren.',
          },
        },
      },
      captcha: {
        eyebrow: 'Bots',
        question: 'Brauchen die öffentlichen Masken Schutz gegen Bots?',
        help: 'Das ist der Unterschied zwischen einem Bot, der tausend Passwörter pro Minute probiert, und einem, der beim ersten Rätsel stehen bleibt. Gilt für Registrierung, Anmeldung und Passwort-Wiederherstellung.',
        whatChanges:
          'Das Captcha greift auf den mit `@RequireCaptcha` markierten Routen: Registrierung, Anmeldung, erneuter Verifizierungsversand und Passwort-Wiederherstellung. `CAPTCHA_DRIVER` und `NEXT_PUBLIC_CAPTCHA_DRIVER` müssen zusammenpassen, sonst wird jedes Absenden ein 400 wegen eines Tokens, das die Maske nie bekommen konnte — der Generator schreibt beide. Ein ausgefallener Anbieter antwortet mit 503, nicht mit „alle durchlassen“: `CAPTCHA_FAIL_OPEN=false` ist der Standard.',
        choices: {
          yes: {
            label: 'Ja, ich will den Schutz',
            help: 'Kommt mit Cloudflare Turnstile, und Google reCAPTCHA als Alternative. Die Schlüssel legst du beim Anbieter an.',
          },
          no: {
            label: 'Jetzt nicht',
            help: 'Kein Rätsel auf dem Bildschirm. Das Versuchslimit pro Netzadresse gilt weiter, es ist also nicht „kein Schutz“: es ist ohne diese Schicht.',
          },
        },
      },
      review: {
        eyebrow: 'Übersicht',
        question: 'Prüf es, bevor du es ausführst.',
        help: 'Jede Zeile führt zurück zu der Frage, die sie erzeugt hat. Der Befehl ist genau das, was der Generator bekommt.',
      },
      done: {
        eyebrow: 'Fertig',
        question: 'Kopieren und ausführen.',
        help: 'Ins Terminal einfügen, in dem Ordner, in dem du das Projekt willst. Zwei Minuten später schaust du auf dessen Login-Maske.',
      },
    },
  },

  how: {
    title: 'Vier Schritte, und der vierte ist `pnpm dev`.',
    steps: [
      {
        title: 'Die Fragen beantworten',
        body: 'Hier, eine nach der anderen. Jede sagt, was sich im Code ändert, wenn du ja oder nein antwortest. Überspringen geht mit „Empfehlung übernehmen“.',
      },
      {
        title: 'Den Befehl kopieren',
        body: 'Der letzte Bildschirm zeigt einen einzigen Befehl, mit deinen Entscheidungen darin. Dazu ein teilbarer Link, falls du die Konfiguration vorher im Team besprechen willst.',
      },
      {
        title: 'Im Terminal ausführen',
        body: 'Er lädt den Code, benennt alles auf dein Projekt um — Pakete, Datenbank, Variablen, Container —, startet Postgres und Redis in Docker und befüllt die Datenbank.',
      },
      {
        title: '`pnpm dev`',
        body: 'API auf `:4201`, Web auf `:4200`, E-Mail von Mailpit auf `:4207` abgefangen. Der Login des angelegten Admins steht im README.',
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
    stackHead: { tech: 'Technologie', solves: 'Was sie löst' },
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
    factoryTitle: 'Ab Werk',
    factory: [
      {
        label: 'Zugang und Session',
        text: 'Passwort mit Argon2, Session im httpOnly-Cookie, rotierendes Refresh mit Reuse-Erkennung — ein gestohlenes Token reißt die ganze Familie mit. Das Passwort zu wechseln beendet die anderen Sessions.',
      },
      {
        label: 'Isolation in der Datenbank',
        text: 'Row Level Security in Postgres, mit dem Scope je Request deklariert. Eine neue Tabelle mit `tenantId` schützt sich selbst: `SELECT app.apply_tenant_rls();` am Ende der Migration.',
      },
      {
        label: 'Einladungen und Onboarding',
        text: 'Token nur als Hash gespeichert, höchstens eine offene Einladung je E-Mail (partieller Unique-Index), und die E-Mail geht nach dem Commit raus — nie innerhalb der Transaktion.',
      },
      {
        label: 'Fünf Wechsel per Variable',
        text: 'Storage, E-Mail, Cache, Queue und Captcha hinter Interfaces: `STORAGE_DRIVER`, `MAIL_DRIVER`, `CACHE_DRIVER`, `QUEUE_DRIVER`, `CAPTCHA_DRIVER`.',
      },
      {
        label: 'Arbeit im Hintergrund',
        text: 'BullMQ auf Redis, mit dem Worker in einem eigenen Prozess und dem Tenant, der mit dem Job mitreist. Ohne ihn sähe der Job eine leere Datenbank und meldete Erfolg.',
      },
      {
        label: 'Tests, die es beweisen',
        text: 'Unit-Tests mit gemockter Datenbank, e2e gegen ein echtes Postgres unter der eingeschränkten Rolle, und das UI-Kit des Web-Teils in Vitest.',
      },
    ],
    decisionsTitle: 'Der Teil, den niemand schreibt',
    decisionsText:
      'Jede Sicherheitsentscheidung hat eine Datei in `docs/decisions/` und einen Abschnitt in der `CLAUDE.md`, mit der Begründung und damit, was passiert, wenn jemand sie rückgängig macht. Das liest ein Agent, bevor er schreibt — und das liest du sechs Monate später, wenn du nicht mehr weißt, warum es so ist.',
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
        q: 'Analysiert das die App, die ich schon habe?',
        a: 'Nein. DontPanic liest, prüft und repariert keinen bestehenden Code — es **erzeugt ein neues Projekt**, von null, mit diesen Entscheidungen schon darin. Wenn deine App bereits läuft, hilft hier das Lesen: erzeuge ein Beispielprojekt und vergleiche es mit deinem, oder geh „Der Beweis“ durch und prüfe in deinem eigenen Code, ob jeder der fünf Fälle abgedeckt ist. Der Befehl fasst nichts an, was du geschrieben hast.',
      },
      {
        q: 'Was genau wird getestet?',
        a: 'Die Preset-Matrix, vollständig: die CI generiert ein Projekt je Preset, verlangt null Treffer des alten Namens und führt install, typecheck, Unit- und e2e-Tests aus. Dazu all-on, all-off und jede Feature einzeln abgeschaltet über dem SaaS-Preset. Vierzehn boolesche Features sind 16.384 Kombinationen, und die CI testet keine 16.384 Projekte: Kombinationen außerhalb dieser Matrix sind erlaubt und ungetestet — und das CLI sagt das, in einer Zeile, ohne Drama. Ein Boilerplate, das Garantien verspricht, die es nicht prüft, ist schlechter als eines, das die Grenze benennt.',
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
    brandNote:
      'Projektgenerator auf Basis des DontPanic-Boilerplates. Du wählst die Teile; der Befehl erzeugt das Repository.',
    sourceNote:
      'Die Zahlen auf dieser Seite kommen aus `wc -l` und `grep` im Repository. Prüf sie.',
    license: 'MIT',
    productTitle: 'Produkt',
    docsTitle: 'Dokumentation',
    contactTitle: 'Kontakt',
    joke: 'Diese Fußzeile wurde von einer Intelligenz von der Größe eines Planeten zusammengestellt. Sie enthält vier Linklisten. Keine Panik: der restliche Code ist interessanter.',
  },
};
