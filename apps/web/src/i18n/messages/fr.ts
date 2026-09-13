import type { Messages } from './types';

export const fr: Messages = {
  meta: {
    title: 'DontPanic — le boilerplate SaaS où les décisions de sécurité sont déjà prises',
    description:
      'Générez un SaaS full-stack en NestJS et Next.js avec un multi-tenancy garanti par Row Level Security, 2FA, invitations et connexion sociale. Les décisions qu’une IA rate en silence sont déjà prises, documentées et testées.',
  },

  nav: {
    skipToContent: 'Aller au contenu',
    proof: 'La preuve',
    how: 'Comment ça marche',
    inside: 'Ce qu’il y a dedans',
    faq: 'Questions',
    repo: 'Dépôt',
    languageLabel: 'Langue',
    themeLabel: 'Thème',
    themeLight: 'Clair',
    themeDark: 'Sombre',
    themeSystem: 'Système',
  },

  hero: {
    mastheadLabel: 'Don’t Panic',
    title:
      'Les décisions de sécurité qu’une IA rate en silence sont déjà prises, documentées et testées.',
    lead: 'Choisissez ce dont votre système a besoin. Recevez une commande. Le code arrive avec le nom de votre projet partout — paquets, base de données, variables d’environnement — et les choix difficiles déjà faits comme il faut.',
    nameCta: 'Commencer',
    ctaNote: 'Dix questions en langage courant. Vous pouvez en sauter n’importe laquelle.',
    commandLabel: 'Commande du preset par défaut',
    commandNote: 'Nécessite Node 24 et pnpm.',
    ctaProof: 'Voir les cinq erreurs',
    facts: [
      {
        value: '78 533',
        label: 'lignes de TypeScript qui compilent, passent le lint et passent les tests',
      },
      {
        value: '5',
        label:
          'ressources interchangeables par variable d’environnement, sans toucher à la logique',
      },
      { value: '2 min', label: 'du npx à `pnpm dev`, base migrée et admin créé par le seed' },
    ],
  },

  cta: {
    title: 'Dix questions. Une commande à la fin.',
    text: 'Une question par écran, en langage courant, avec ce que ça change dans le système écrit en dessous. Pas quatorze interrupteurs d’un coup.',
    note: 'sans inscription · on peut revenir à chaque étape',
  },

  proof: {
    eyebrow: 'Des erreurs qui passent la revue',
    title: 'La preuve',
    lead: 'Rien ici n’est hypothétique. Ce sont des erreurs qui produisent du code qui compile, passe les tests et passe la revue — et qui ressort des mois plus tard, chez un utilisateur qui n’est pas vous. Chacune est déjà tranchée dans le boilerplate, avec la raison à côté de la décision et le test nommé en dessous.',
    labels: {
      whatHappens: 'Ce qui arrive',
      ours: 'Dans DontPanic',
      seal: 'couvert par des tests',
      cases: 'cas',
    },
    items: [
      {
        id: 'oauth-identity',
        eyebrow: 'Connexion sociale',
        title: 'L’identité sociale rapprochée par l’adresse e-mail',
        whatHappens:
          'Les adresses professionnelles sont recyclées. Ana quitte l’entreprise, les RH donnent `ana@societe.com` au suivant, il se connecte avec Google et **hérite du compte d’Ana** : historique, permissions, tout. Personne n’a rien forcé — le système a fait exactement ce qui était écrit, et le test, qui n’avait qu’un utilisateur, est passé.',
        ours: 'La clé d’identité est le `providerAccountId` immuable — `sub` chez Google et Apple, l’id numérique chez GitHub — avec `@@unique([provider, providerAccountId])`. La colonne `email` de `oauth_accounts` sert à l’affichage et peut être périmée. Et une adresse que le fournisseur n’a pas marquée comme vérifiée ne rattache rien : le callback renvoie `unverified_email`.',
      },
      {
        id: 'oauth-2fa',
        eyebrow: 'Second facteur',
        title: 'La session émise dans le callback OAuth sans vérifier le second facteur',
        whatHappens:
          'Celui qui a activé le code à six chiffres volontairement découvre que « se connecter avec Google » ne le demande jamais. La connexion sociale devient **strictement plus faible** que la saisie du mot de passe, et le second facteur devient optionnel pour qui sait sur quel bouton cliquer. Le `TwoFactorGateGuard` ne l’attrape pas : il vérifie que la 2FA est *activée*, jamais que *cette* session est passée par elle.',
        ours: 'Si `twoFactorEnabled`, le callback n’émet pas de session : il crée le même ticket que `POST /auth/login` créerait, le livre dans un cookie de cinq minutes à usage unique, et redirige vers `/login?twofactor=1`. Un cookie et pas une query string — la query string finit dans l’historique du navigateur, dans l’en-tête `Referer` et dans les logs de tous les proxys du trajet.',
      },
      {
        id: 'rls-where',
        eyebrow: 'Isolation',
        title: 'L’isolation entre entreprises confiée au `where` de l’application',
        whatHappens:
          'La garantie est devenue une discipline humaine, répétée à chaque requête, par tous ceux qui rejoindront l’équipe après vous. Le premier `findUnique({ where: { id } })` par clé primaire — écrit dans l’urgence, ou par un agent qui ne connaissait pas la règle — renvoie la ligne d’une autre entreprise. Et il n’échoue pas : **il renvoie des données, avec un statut 200**.',
        ours: 'L’isolation appartient à Postgres, pas à l’application : Row Level Security, avec le scope déclaré par `SET LOCAL` dans la transaction de la requête. Sans aucun scope, `current_setting(…, true)` renvoie NULL et la policy ne correspond jamais — oublier le scope donne un résultat **vide**, jamais la ligne de la mauvaise entreprise. Le filtre applicatif reste là, par commodité ; la garantie est celle du dessous.',
      },
      {
        id: 'password-reset',
        eyebrow: 'Sessions',
        title: 'La réinitialisation de mot de passe qui ne coupe pas les sessions ouvertes',
        whatHappens:
          'La personne change son mot de passe précisément parce qu’elle soupçonne une intrusion. Le nouveau hash n’invalide rien : le refresh token de l’intrus **continue de se renouveler tout seul**, et il reste dans le compte longtemps après le changement — indéfiniment, tant qu’il continue d’utiliser le système.',
        ours: '`resetPassword` écrit le nouveau mot de passe et consomme le jeton dans la même transaction puis, après le commit, appelle `revokeAllForUser` — toute session existante meurt, enregistrée dans l’audit comme une déconnexion volontaire. Le refresh rotatif fait le reste : un ancien jeton représenté révoque toute la famille.',
      },
      {
        id: 'db-owner',
        eyebrow: 'Base de données',
        title: 'La `DATABASE_URL` pointée sur le propriétaire de la base',
        whatHappens:
          'Un SUPERUSER — et tout rôle avec `BYPASSRLS` — ignore Row Level Security même avec `FORCE ROW LEVEL SECURITY`. **Toute policy devient décorative**, et l’isolation redevient dépendante du fait qu’aucune requête n’oublie un `where`. Pire : vos tests d’isolation passent, parce qu’ils exercent le filtre applicatif, qui est bien là et qui est juste.',
        ours: 'L’application se connecte avec un rôle restreint, créé `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS` ; le propriétaire ne vit que dans `DATABASE_ADMIN_URL`, pour `migrate` et `seed`. L’API **refuse de démarrer** en production si elle détecte un superuser. Et la suite e2e tourne sous le rôle restreint — c’est ce qui fait que le test d’isolation prouve quelque chose au lieu de répéter l’intention du code.',
      },
    ],
    moreTitle: 'Cinq autres, même schéma',
    more: [
      'Activer `trustProxy: true` pour faire disparaître un 429 injustifié. Faire confiance à tous les hops, c’est accepter n’importe quel `X-Forwarded-For` — et le navigateur **peut** le définir, puisqu’il n’est pas dans la liste des forbidden headers de fetch : un nouveau seau de rate limit à chaque requête. Ici l’IP est comptée depuis la droite, avec `CLIENT_IP_TRUSTED_HOPS`, et le BFF supprime tout en-tête de forwarding venant du navigateur.',
      'Lire la base dans un guard, avant que le scope de tenant existe. Nest exécute les guards **avant** les interceptors, donc la policy RLS renvoie zéro ligne, le guard conclut « cet utilisateur n’a pas la 2FA » et laisse passer — sans erreur ni log. Ici, un guard qui lit la base ouvre son propre scope et échoue fermé.',
      'Envoyer l’e-mail d’invitation à l’intérieur de la transaction. Un rollback livre un lien valide pointant vers une entreprise qui n’existe pas, et ne laisse aucune trace pour le support. Ici, `issue()` écrit dans le `tx` de l’appelant et l’envoi a lieu après le commit.',
      'Répondre « ce compte utilise la connexion sociale » sur un login par mot de passe. C’est un oracle : en chronométrant le formulaire, on énumère exactement les adresses sans mot de passe. Ici l’erreur est la même erreur générique et paie le même coût Argon2 — `verifyPassword(null, …)` vérifie contre le hash de quelque chose que personne ne connaît avant de renvoyer `false`.',
      'Compter les sièges avant d’écrire l’utilisateur. Deux requêtes simultanées lisent « il en reste un » et créent toutes les deux : compter ne verrouille rien. Ici, `pg_advisory_xact_lock`, par entreprise et par ressource, est dans la même transaction que l’écriture.',
    ],
  },

  configurator: {
    nameLabel: 'Nom',
    namePlaceholder: 'Acme Corp',
    nameHelp: 'Comme vous appelez le produit. Tout le reste en est dérivé.',
    slugLabel: 'Slug',
    slugHelp: 'Répertoire, paquet npm et identifiants. Minuscules, chiffres et tiret.',
    slugDerived: 'dérivé du nom',
    slugReset: 'Revenir au dérivé',
    applySuggestion: 'Utiliser',

    derivedTitle: 'Ce que ce nom devient',
    derivedNote:
      'Le renommage n’est pas un `sed` sur le nom du dossier : il traverse le SQL qui crée le rôle Postgres, le scope pnpm, et des noms de base et de bucket en même temps — là où SQL refuse le tiret et S3 refuse le souligné.',
    derivedLabels: {
      dbName: 'base de dev',
      dbNameE2e: 'base e2e',
      dbRole: 'rôle Postgres restreint',
      npmScope: 'scope pnpm',
      seedAdminEmail: 'admin du seed',
      bucket: 'bucket de stockage objet',
      screaming: 'préfixe d’env',
      pascal: 'classes et types',
    },

    driverLabels: {
      db: 'Base de données',
      storage: 'Stockage',
      mail: 'E-mail',
      cache: 'Cache',
      queue: 'File',
      captcha: 'Captcha',
    },

    issuesTitle: 'Combinaison incohérente',
    issueError: 'Empêche la génération',
    issueWarning: 'Autorisé, sous réserve',
    noIssues: 'Combinaison cohérente.',

    commandTitle: 'Votre commande',
    commandNote: 'Ceci est la configuration. Elle ne vit nulle part ailleurs.',
    copy: 'Copier la commande',
    copied: 'Commande copiée',
    copyFailed: 'Copie impossible — sélectionnez le texte et copiez-le',
    flagsTitle: 'Les flags',
    flagsNote: 'Seulement ce qui diffère du point de départ.',
    removeFlag: 'Retirer',
    shareTitle: 'Lien de cette configuration',
    shareNote:
      'La configuration est dans l’URL, lisible. Envoyez-la sur Slack : le collègue comprend ce que c’est avant de l’ouvrir.',
    shareCopy: 'Copier le lien',
    shareCopied: 'Lien copié',
    blockedByName: 'Corrigez le nom avant d’utiliser la commande.',

    features: {
      multiTenant: {
        label: 'Multi-tenancy',
        text: 'Isolation entre entreprises dans Postgres, par Row Level Security. Désactivé, le RLS reste : le projet naît avec un tenant fixe et sans sélecteur d’entreprise dans l’interface.',
      },
      twoFactor: {
        label: '2FA par TOTP',
        text: 'Second facteur avec application d’authentification, codes de secours et ticket à usage unique entre le mot de passe et la session.',
      },
      oauth: {
        label: 'Connexion sociale',
        text: 'Google, Apple et GitHub, activés fournisseur par fournisseur. Identité par `providerAccountId`, et le callback respecte la 2FA.',
      },
      invitations: {
        label: 'Invitations',
        text: 'La porte vers une entreprise qui existe déjà : l’invité choisit son propre mot de passe, et le clic sur le lien est ce qui prouve l’adresse.',
      },
      publicSignup: {
        label: 'Inscription publique',
        text: 'Le formulaire qui laisse un inconnu créer une entreprise et en devenir le premier admin. Désactivé, il reste l’invitation et le seed.',
      },
      files: {
        label: 'Envoi de fichiers',
        text: 'Avatar et pièces jointes gardés hors de la base, derrière le port de stockage : S3, MinIO, R2 ou disque local, interchangeables par `STORAGE_DRIVER`.',
      },
      platform: {
        label: 'Panneau plateforme',
        text: 'L’espace SUPERADMIN sur `/platform` : crée des entreprises, invite le premier admin, traverse les tenants dans son propre scope.',
      },
      audit: {
        label: 'Journal d’audit',
        text: 'Qui a fait quoi, écrit en dehors de la transaction de la requête pour ne pas disparaître avec un rollback.',
      },
      plans: {
        label: 'Plans et limites',
        text: '`maxUsers` et compteurs nommés par entreprise, avec un advisory lock par ressource — compter avant d’écrire ne verrouille rien.',
      },
      i18n: {
        label: 'Internationalisation',
        text: 'Messages par langue des deux côtés, avec un test de parité des clés entre les fichiers de traduction.',
      },
      queue: {
        label: 'File de jobs',
        text: 'BullMQ sur Redis, avec le worker dans un processus séparé. Le tenant voyage avec le job : sans lui, le RLS renvoie zéro ligne et le job prétend avoir réussi.',
      },
      captcha: {
        label: 'Captcha',
        text: 'Turnstile ou reCAPTCHA sur les routes qui devinent un secret, en échouant fermé quand le fournisseur tombe.',
      },
      easterEggs: {
        label: 'Blagues du Guide',
        text: 'La voix de Marvin dans les marges, `GET /teapot` qui renvoie 418, et le Konami sur le dashboard. Jamais dans un message de sécurité.',
      },
      scaffolding: {
        label: 'Blocs de construction',
        text: 'Grille d’enregistrements, cartes de dashboard et `sequence.service.ts` : prêts, testés et importés par rien — le point de départ de vos écrans CRUD.',
      },
    },

    presets: {
      minimal: {
        label: 'Minimal',
        summary: 'Mot de passe, isolation dans la base et la suite de tests. Rien d’autre.',
        audience:
          'Pour qui va construire tout le produit et ne veut que la couche d’accès déjà prouvée.',
      },
      saas: {
        label: 'SaaS',
        summary:
          'Vraiment multi-entreprise : invitations, plans avec limite de sièges, 2FA et file durable.',
        audience:
          'Pour un produit vendu par abonnement, avec plusieurs entreprises clientes dans la même base.',
      },
      complete: {
        label: 'Complet',
        summary: 'Le boilerplate entier, rien de soustrait — Marvin compris.',
        audience: 'Pour tout voir fonctionner avant de décider ce qu’on enlève.',
      },
      internal: {
        label: 'Interne',
        summary:
          'Une seule entreprise et aucune porte publique : on entre sur invitation, avec 2FA et audit.',
        audience:
          'Pour un outil d’équipe, un back-office ou un ERP qui n’aura jamais d’inscription ouverte.',
      },
    },
  },

  wizard: {
    open: 'Composer',
    openHero: 'Composer mon système',
    close: 'Fermer',
    next: 'Continuer',
    back: 'Retour',
    finish: 'Voir la commande',
    recommended: 'Utiliser la recommandation',
    progress: 'Étape {n} sur {total}',
    yes: 'Oui',
    no: 'Non',
    edit: 'Modifier',
    whatChangesLabel: 'Ce qui change dans votre système',
    steps: {
      name: {
        eyebrow: 'Nom',
        question: 'Comment votre système va-t-il s’appeler ?',
        help: 'Ce peut être le nom du produit ou celui de l’entreprise. Tout le reste en découle : le dossier, le paquet, la base de données, et même l’utilisateur que Postgres crée. Les formes dérivées apparaissent ci-dessous pendant que vous tapez.',
        whatChanges:
          'Le nom entre à 531 endroits, en trois casses différentes : paquet, scope pnpm, nom de base, préfixe de variable d’environnement, bucket, et le SQL qui crée le rôle Postgres restreint. La CI prouve qu’il n’en reste aucun — elle génère avec un nom de test et exige zéro occurrence de l’ancien dans un `grep -ri`.',
      },
      preset: {
        eyebrow: 'Point de départ',
        question: 'Lequel ressemble le plus à ce que vous allez construire ?',
        help: 'Ceci ne fait que répondre aux questions suivantes à votre place. Rien n’est verrouillé : si une réponse ne convient pas, changez-la à son étape ou dans la revue finale.',
        whatChanges:
          'Le point de départ ne fait que remplir les réponses suivantes. La CI teste la matrice des quatre intégralement : elle génère un projet de chacun, installe, vérifie les types et lance unitaires et e2e. En dehors, la combinaison est autorisée et non testée — et le CLI le dit, en une ligne.',
      },
      tenancy: {
        eyebrow: 'Entreprises',
        question:
          'Votre système va-t-il servir plusieurs entreprises différentes, chacune ne voyant que ses propres données ?',
        help: 'C’est la différence entre « le client A a vu la donnée du client B » et « la base a refusé la ligne avant que l’application s’en aperçoive ».',
        whatChanges:
          "La séparation appartient à Postgres, pas à l’application : chaque requête déclare son scope avec `SET LOCAL` dans la transaction, et les policies de Row Level Security comparent à `current_setting('app.current_tenant_id', true)`. Sans scope, la comparaison n’est jamais vraie — le résultat revient vide, jamais de la mauvaise entreprise. Une table nouvelle avec `tenantId` se protège seule : `SELECT app.apply_tenant_rls();` à la fin de la migration.",
        choices: {
          yes: {
            label: 'Oui, plusieurs entreprises',
            help: 'Chaque entreprise est séparée dans la base par Postgres lui-même, et non par un filtre que quelqu’un peut oublier d’écrire. Livré avec un panneau d’administration et un sélecteur d’entreprise.',
          },
          no: {
            label: 'Non, une seule entreprise',
            help: 'Le système naît avec une entreprise fixe et les écrans de changement restent dehors. La séparation reste dans la base — elle n’apparaît simplement pas à l’écran, puisqu’il n’y a rien à changer.',
          },
        },
      },
      entry: {
        eyebrow: 'Accès',
        question: 'Comment les gens vont-ils entrer dans le système ?',
        help: 'C’est la différence entre se réveiller avec mille comptes de test et devoir créer chaque personne à la main. Qui peut créer un compte est la décision qui change le plus votre produit — et celle qui tourne le plus mal quand on la remet à plus tard.',
        whatChanges:
          "L’invitation ne garde que le SHA-256 du jeton : une base fuitée ne donne aucun lien utilisable. Un index unique partiel (`WHERE status = 'PENDING'`) permet au plus une invitation vivante par e-mail et par entreprise, et ferme la course de deux admins invitant le même collègue au même instant. L’e-mail part après le commit — dans la transaction, un rollback livrerait un lien valide vers une entreprise qui n’existe pas.",
        choices: {
          open: {
            label: 'N’importe qui peut s’inscrire',
            help: 'Il y a un formulaire d’inscription ouvert, et celui qui s’inscrit crée sa propre entreprise. C’est ce dont un produit vendu sur internet a besoin.',
          },
          invite: {
            label: 'Uniquement sur invitation',
            help: 'Un administrateur invite par e-mail et l’invité choisit son propre mot de passe. Personne n’apprend le mot de passe d’un autre, et le clic sur le lien est ce qui prouve que l’adresse existe.',
          },
          seed: {
            label: 'Seulement les comptes que je crée',
            help: 'Ni inscription ni invitation : le seul compte est celui que le système crée à l’installation. Utile en interne — et cela veut dire que vous créez les autres personnes à la main.',
          },
        },
      },
      social: {
        eyebrow: 'Connexion sociale',
        question: 'Voulez-vous le bouton se connecter avec Google, Apple ou GitHub ?',
        help: 'C’est la différence entre un mot de passe de plus à oublier et un bouton que votre utilisateur utilise déjà partout. En échange, chaque fournisseur demande une clé que vous créez chez lui.',
        whatChanges:
          'Le compte est reconnu par le `providerAccountId` immuable, avec `@@unique([provider, providerAccountId])` — jamais par l’e-mail, recyclé quand quelqu’un quitte l’entreprise. Une adresse que le fournisseur n’a pas marquée comme vérifiée ne rattache rien : le callback renvoie `unverified_email`. La liste `OAUTH_PROVIDERS` et celle du web doivent coïncider, sinon le bouton en trop renvoie un 404 ; le générateur écrit les deux côtés.',
        choices: {
          yes: {
            label: 'Oui, je veux le bouton',
            help: 'Google et GitHub activés, Apple disponible. Les clés se créent dans la console de chacun et se collent dans le `.env`.',
          },
          no: {
            label: 'Non, e-mail et mot de passe',
            help: 'Le code des fournisseurs quitte le projet — moins à maintenir. Pour le récupérer, régénérez avec la connexion sociale activée.',
          },
        },
      },
      twoFactor: {
        eyebrow: 'Second facteur',
        question: 'Les gens doivent-ils pouvoir exiger un code du téléphone pour se connecter ?',
        help: 'C’est la différence entre « on lui a volé son mot de passe » et « on lui a volé son mot de passe et on n’est pas entré ». La personne enregistre une application d’authentification une fois, puis tape six chiffres quand le système le demande.',
        whatChanges:
          'Le second facteur vaut à toutes les portes d’entrée, connexion sociale comprise : le callback n’émet pas de session, il livre un ticket dans le cookie `dp_2fa_ticket` — cinq minutes, brûlé après quelques tentatives fausses — et la vraie session ne naît qu’après les six chiffres. Des codes de secours à usage unique viennent avec, et `TWO_FACTOR_REQUIRED=true` se met à exiger le facteur de tout le monde.',
        choices: {
          yes: {
            label: 'Oui, je veux un second facteur',
            help: 'Chacun l’active sur son propre compte, avec des codes de secours en cas de perte du téléphone. Pour l’exiger de tout le monde, le projet livre `TWO_FACTOR_REQUIRED`.',
          },
          no: {
            label: 'Pas maintenant',
            help: 'Se connecter, c’est le mot de passe seul. On peut l’activer plus tard — mais en régénérant le projet, car répondre non ici retire le code du second facteur.',
          },
        },
      },
      languages: {
        eyebrow: 'Langues',
        question: 'Le système va-t-il parler plus d’une langue ?',
        help: 'Il s’agit du produit que vous allez générer, pas de cette page.',
        whatChanges:
          'Chaque langue est un fichier de messages des deux côtés, API et web. Un test compare les jeux de clés entre eux et échoue quand il en manque une — c’est exactement ainsi qu’un écran apparaît en anglais au milieu du français, en production.',
        choices: {
          one: {
            label: 'Une langue',
            help: 'Les écrans et les e-mails sortent dans une seule langue. La plomberie de traduction reste dans le code, donc en ajouter une seconde plus tard ne veut pas dire refaire les écrans.',
          },
          many: {
            label: 'Plus d’une',
            help: 'Vous choisissez lesquelles. Un test garantit qu’aucune langue ne se retrouve avec une phrase manquante — c’est comme ça qu’un écran apparaît en anglais au milieu du français.',
          },
        },
      },
      plans: {
        eyebrow: 'Formules',
        question:
          'Allez-vous vendre des formules avec limite, du genre « jusqu’à 10 utilisateurs » ?',
        help: 'C’est la différence entre facturer par formule et espérer que personne n’abuse. C’est ce qui sépare une formule de base d’une formule avancée à l’intérieur du système.',
        whatChanges:
          'La limite est vérifiée au moment qui consomme le siège — l’acceptation de l’invitation —, dans la même transaction que la création de l’utilisateur, avec `pg_advisory_xact_lock` par entreprise et par ressource. Compter avant d’écrire ne verrouille rien : deux acceptations dans la même seconde dépasseraient le plafond.',
        choices: {
          yes: {
            label: 'Oui, je vendrai des formules',
            help: 'Chaque entreprise reçoit une limite de personnes et des compteurs par ressource, avec les écrans d’usage et de changement de formule.',
          },
          no: {
            label: 'Non, tout le monde pareil',
            help: 'Aucune limite et aucun compteur. Personne n’est bloqué pour cause de taille.',
          },
        },
      },
      files: {
        eyebrow: 'Fichiers',
        question:
          'Les gens vont-ils envoyer des fichiers — photo de profil, pièces jointes, documents ?',
        help: 'Cela change où les fichiers sont stockés et comment ils arrivent au navigateur.',
        whatChanges:
          'Le fichier monte par l’API et va au stockage via le port `StorageProvider`, qui a trois opérations : `putObject`, `deleteObject` et `getPublicUrl`. Remplacer S3 par MinIO, R2 ou le disque local, c’est changer `STORAGE_DRIVER` dans le `.env` — la logique ne sait pas lequel est derrière.',
        choices: {
          yes: {
            label: 'Oui, on enverra des fichiers',
            help: 'Avatar et pièces jointes gardés hors de la base. Fonctionne avec Amazon S3, MinIO, Cloudflare R2 ou le disque de la machine, et passer de l’un à l’autre est une ligne de configuration.',
          },
          no: {
            label: 'Pas besoin',
            help: 'Pas d’envoi de fichier ni de photo de profil. Moins de code, et aucun bucket à configurer.',
          },
        },
      },
      captcha: {
        eyebrow: 'Robots',
        question: 'Les écrans publics ont-ils besoin d’une protection contre les robots ?',
        help: 'C’est la différence entre un robot qui essaie mille mots de passe par minute et un robot qui s’arrête au premier casse-tête. Cela vaut pour l’inscription, la connexion et la récupération de mot de passe.',
        whatChanges:
          'Le captcha entre sur les routes marquées `@RequireCaptcha` : inscription, connexion, renvoi de vérification et récupération de mot de passe. `CAPTCHA_DRIVER` et `NEXT_PUBLIC_CAPTCHA_DRIVER` doivent coïncider, sinon chaque envoi devient un 400 à cause d’un jeton que l’écran n’avait aucun moyen d’obtenir — le générateur écrit les deux. Un fournisseur en panne répond 503, pas « on laisse tout passer » : `CAPTCHA_FAIL_OPEN=false` est la valeur par défaut.',
        choices: {
          yes: {
            label: 'Oui, je veux la protection',
            help: 'Livré avec Cloudflare Turnstile, et reCAPTCHA de Google en alternative. Les clés se créent chez le fournisseur.',
          },
          no: {
            label: 'Pas maintenant',
            help: 'Pas de casse-tête à l’écran. La limite de tentatives par adresse réseau reste active, donc ce n’est pas « sans protection » : c’est sans cette couche.',
          },
        },
      },
      review: {
        eyebrow: 'Revue',
        question: 'Vérifiez avant de lancer.',
        help: 'Chaque ligne renvoie à la question qui l’a produite. La commande est exactement ce que le générateur va recevoir.',
      },
      done: {
        eyebrow: 'Terminé',
        question: 'Il ne reste qu’à copier et lancer.',
        help: 'Collez-la dans le terminal, dans le dossier où vous voulez le projet. Deux minutes plus tard, vous regardez son écran de connexion.',
      },
    },
  },

  how: {
    title: 'Quatre étapes, et la quatrième est `pnpm dev`.',
    steps: [
      {
        title: 'Répondez aux questions',
        body: 'Ici même, une à la fois. Chacune dit ce qui change dans le code si vous répondez oui ou non. On peut passer avec « utiliser la recommandation ».',
      },
      {
        title: 'Copiez la commande',
        body: 'Le dernier écran affiche une seule commande, avec vos choix dedans. Il y a un lien partageable, si vous voulez discuter la configuration avec l’équipe avant.',
      },
      {
        title: 'Lancez-la dans le terminal',
        body: 'Elle télécharge le code, renomme tout pour votre projet — paquets, base, variables, conteneurs —, monte Postgres et Redis dans Docker et amorce la base.',
      },
      {
        title: '`pnpm dev`',
        body: 'API sur `:4201`, web sur `:4200`, e-mail capturé par Mailpit sur `:4207`. L’identifiant de l’admin amorcé est dans le README.',
      },
    ],
    renameTitle: 'Le renommage est prouvé, pas relu',
    renameLead:
      'Le nom du projet apparaît là où aucune relecture humaine ne va. La porte est mécanique : la CI génère avec un nom de test, lance `grep -ri` en exigeant zéro occurrence de l’ancien nom, et seulement ensuite installe, vérifie les types et lance toute la suite, e2e inclus.',
    renameItems: [
      '531 occurrences dans 199 fichiers, en trois casses différentes.',
      'Dans le SQL qui crée le rôle Postgres restreint, où un remplacement partiel donne un rôle sans GRANT — et le symptôme est « zéro ligne », pas une erreur.',
      'Dans des noms de base et de bucket à la fois, là où SQL refuse le tiret et S3 refuse le souligné.',
    ],
  },

  inside: {
    title: 'Ce qu’il y a dedans',
    lead: 'Le template est le vrai dépôt DontPanic, au tag que le générateur déclare. Ce n’est pas une version de démonstration : c’est le code qui fait tourner sa propre CI.',
    stackTitle: 'La stack',
    stackHead: { tech: 'Technologie', solves: 'Ce qu’elle résout' },
    stackRoles: [
      'API, avec Fastify dessous',
      'Web, avec le BFF qui parle à l’API à la place du navigateur',
      'Base de données, avec driver adapters et Row Level Security',
      'Contrats de requête et de réponse, partagés entre l’API et le web',
      'Mot de passe et session, avec refresh rotatif et détection de réutilisation',
      'File durable, avec le worker dans un processus séparé',
      'Tests : unitaires, de composant et e2e',
      'Monorepo, avec cache de build',
    ],
    factoryTitle: 'D’origine',
    factory: [
      {
        label: 'Accès et session',
        text: 'Mot de passe avec Argon2, session en cookie httpOnly, refresh rotatif avec détection de réutilisation — un jeton volé fait tomber toute la famille. Changer le mot de passe coupe les autres sessions.',
      },
      {
        label: 'Isolation dans la base',
        text: 'Row Level Security dans Postgres, avec le scope déclaré par requête. Une table nouvelle avec `tenantId` se protège seule : `SELECT app.apply_tenant_rls();` à la fin de la migration.',
      },
      {
        label: 'Invitations et onboarding',
        text: 'Jeton stocké seulement en hash, au plus une invitation en attente par e-mail (index unique partiel), et l’e-mail qui part après le commit — jamais dans la transaction.',
      },
      {
        label: 'Cinq échanges par variable',
        text: 'Stockage, e-mail, cache, file et captcha derrière des interfaces : `STORAGE_DRIVER`, `MAIL_DRIVER`, `CACHE_DRIVER`, `QUEUE_DRIVER`, `CAPTCHA_DRIVER`.',
      },
      {
        label: 'Travail en arrière-plan',
        text: 'BullMQ sur Redis, avec le worker dans un processus séparé et le tenant qui voyage avec le job. Sans lui, le job verrait une base vide et annoncerait un succès.',
      },
      {
        label: 'Des tests qui prouvent',
        text: 'Unitaires avec la base simulée, e2e contre un vrai Postgres sous le rôle restreint, et le kit d’UI du web dans Vitest.',
      },
    ],
    decisionsTitle: 'La partie que personne n’écrit',
    decisionsText:
      'Chaque décision de sécurité a un fichier dans `docs/decisions/` et une section dans `CLAUDE.md`, avec la raison et ce qui arrive si quelqu’un la défait. C’est ce qu’un agent lit avant d’écrire — et ce que vous lisez six mois plus tard, quand vous ne vous souvenez plus pourquoi c’est comme ça.',
    numbersTitle: 'Les chiffres',
    numbers: [
      { value: '78 533', label: 'lignes de TypeScript' },
      { value: '~99 %', label: 'de statements couverts sur l’API, seuils imposés en CI' },
      { value: '100 %', label: 'de statements couverts sur le kit d’UI du web' },
      { value: '531', label: 'occurrences du nom remplacées dans 199 fichiers, prouvées par grep' },
    ],
  },

  faq: {
    title: 'Questions',
    lead: 'Celles qui méritent une réponse honnête avant de lancer la commande.',
    items: [
      {
        q: 'Qu’est-ce qui est testé, exactement ?',
        a: 'La matrice des presets, intégralement : la CI génère un projet par preset, exige zéro occurrence de l’ancien nom, puis lance install, typecheck, tests unitaires et e2e. Plus all-on, all-off, et chaque feature désactivée isolément par-dessus le preset SaaS. Quatorze features booléennes font 16 384 combinaisons, et la CI ne teste pas 16 384 projets : les combinaisons hors de cette matrice sont autorisées et non testées — et le CLI le dit, en une ligne, sans drame. Un boilerplate qui promet des garanties qu’il ne vérifie pas est pire qu’un qui annonce la limite.',
      },
      {
        q: 'Et si je ne veux pas de multi-tenancy ?',
        a: '`--no-multi-tenant` le cache, il ne l’arrache pas. Le projet naît avec un tenant fixe créé par le seed, le scope toujours ouvert sur lui, et le sélecteur d’entreprise, le panneau `/platform` et le SUPERADMIN hors de l’interface. Row Level Security reste, et reste prouvé par `tenant-isolation.e2e-spec.ts` ; le coût est une colonne indexée et un prédicat que Postgres résout en constante. L’arracher voudrait dire maintenir deux versions de tout l’accès aux données — et la version sans RLS est précisément celle qu’on ne peut pas prouver sûre.',
      },
      {
        q: 'Puis-je mettre à jour plus tard ?',
        a: 'Le projet généré est le vôtre, pas une dépendance : aucun `pnpm update` n’y fera entrer des nouveautés de DontPanic, et c’est volontaire — vous allez éditer ce code dès le premier jour. Ce que vous avez, c’est la reproductibilité : la même recette sur la même version du template génère le même projet aujourd’hui et dans deux ans, donc vous pouvez régénérer et comparer les diffs quand vous voulez adopter quelque chose de l’upstream.',
      },
      {
        q: 'Et la licence ?',
        a: 'MIT, sur le générateur et sur le template. Ce qui sort du `npx` est à vous : pas d’attribution obligatoire, pas de royalties, pas de clause qui change de valeur si votre produit grandit. Vous pouvez fermer le code de ce que vous générez.',
      },
      {
        q: 'Ai-je besoin de Docker ?',
        a: 'Pour lancer la suite de tests, non : les adapters `memory`, `console` et `local` existent justement pour tourner sans rien d’autre. Pour développer sérieusement il vous faut un Postgres — et le `docker compose` du projet monte Postgres, Redis, MinIO et Mailpit sur des ports qui n’entreront pas en collision avec les vôtres. Si vous avez déjà ces services, pointez le `.env` dessus et générez avec `--no-docker`.',
      },
      {
        q: 'Est-ce que ça marche avec Claude Code, Cursor et compagnie ?',
        a: 'Le projet généré embarque un `CLAUDE.md` taillé aux features que vous avez choisies — seulement les sections qui existent dans votre code. C’est là que vivent les décisions de sécurité, chacune avec sa raison, dans la forme qu’un agent lit avant d’écrire. L’effet de bord est probablement ce qui vous a amené ici : le contexte part dans votre produit au lieu de redécouvrir comment on fait la rotation des refresh tokens.',
      },
    ],
  },

  footer: {
    tagline: 'Un boilerplate SaaS qui a déjà pris les décisions ennuyeuses.',
    brandNote:
      'Générateur de projets à partir du boilerplate DontPanic. Vous choisissez les parties ; la commande génère le dépôt.',
    sourceNote: 'Les chiffres de cette page sortent de `wc -l` et `grep` sur le dépôt. Vérifiez.',
    license: 'MIT',
    productTitle: 'Produit',
    docsTitle: 'Documentation',
    contactTitle: 'Contact',
    joke: 'Ce pied de page a été assemblé par une intelligence de la taille d’une planète. Il contient quatre listes de liens. Pas de panique : le reste du code est plus intéressant.',
  },
};
