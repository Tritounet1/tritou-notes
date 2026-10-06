# Tests backend

## Commandes

Depuis la racine du dépôt, après `npm --prefix api ci --legacy-peer-deps` :

```sh
npm --prefix api test
npm --prefix api run test:watch
npm --prefix api run test:coverage
npm --prefix api run test:integration
npm --prefix api run lint
cd api && npx prisma generate && npx tsc --noEmit
```

Les tests rapides utilisent Vitest et ne nécessitent ni base de données, ni Redis, ni accès Internet. Les tests sont placés dans `api/src/__tests__/`; les helpers HTTP et Prisma se trouvent dans `helpers/`. Les anciens fichiers compilés de `api/dist/` sont exclus de la découverte des tests.

## Périmètre vérifié

- Authentification : bcrypt, JWT expirés ou altérés, cookies, changement de mot de passe et identité provenant de la session.
- Autorisation : matrice des routes protégées, rôles administrateurs, permissions stockées, invitations et initialisation du premier administrateur.
- Contrôleurs : utilisateurs, documents et historiques, conversations, scrapers, instances, planifications, configuration, images et IA; propagation des erreurs des dépendances.
- Worker : extraction HTML, archivage, transitions de statut, erreurs, poursuite des autres instances et fermeture du navigateur.
- Images de documents : vrais pixels JPEG/PNG/WebP/GIF, limites d’upload, stockage isolé, accès privé/public et suppression en cascade.
- Utilitaires : chiffrement authentifié, génération de tokens, stockage S3 et protection SSRF des aperçus, redirections, limites de taille et formats YouTube.

## Tests d’intégration isolés

`test:integration` lance PostgreSQL 18 et Redis 7 avec `docker-compose.test.yml`, génère le client Prisma, applique le schéma, puis teste l’API via HTTP. Il vérifie notamment les mots de passe réels, les relations et historiques PostgreSQL, les permissions, les inscriptions, les uploads multipart et les jobs récurrents/consommés dans Redis.

Docker doit fonctionner; les ports locaux `55432` et `56379` doivent être libres. Le script impose ses propres identifiants et adresses de test, indépendamment de `api/.env`. La base utilise un stockage temporaire; les conteneurs du projet `tritou-notes-backend-tests` sont supprimés à la fin, y compris après un échec normal. Ne pas lancer deux suites d’intégration simultanément.

## Couverture et CI

`api/coverage/index.html` présente le rapport détaillé. Toute la source TypeScript est mesurée, sauf le client Prisma généré, les déclarations de types et les tests. Les seuils globaux sont **95 %** pour lignes, instructions et fonctions, et **90 %** pour branches. La CI vérifie ces seuils, conserve le rapport et exécute séparément les intégrations avant le build backend.

## Limites

Une couverture élevée ne prouve pas l’absence de bugs. SMTP, OpenRouter (`fetch` simulé) et S3 sont testés avec des doubles, sans contacter ces services. Le worker utilise un navigateur simulé dans les tests rapides; l’intégration BullMQ vérifie un consommateur réel, sans lancer Chromium. Les migrations d’une ancienne base, la charge et les inscriptions concurrentes nécessitent des vérifications distinctes. Ces suites ne couvrent pas le frontend ni le serveur MCP.
