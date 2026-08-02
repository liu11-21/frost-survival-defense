# GitHub sync workflow

This repository is intended to remain private. After a major change:

npm run ai:sync
git status
git add <related files>
git commit -m "<clear conventional message>"
git push

Before pushing, verify that .env, node_modules/, dist/, local captures and caches are ignored. Never force-push main by default. Do not paste GitHub tokens into chat or source files.

Commit prefixes: feat:, fix:, refactor:, art:, perf:, docs:, test:, chore:
