# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Cursed Court** — a Vite + TypeScript + three.js tennis game, deployed
automatically from the `main` branch. Because the deployed version is what gets
tested, changes are only useful once they reach `main`.

Deployment: `.github/workflows/deploy.yml` runs on every push to `main`, builds
with `npm run build`, and publishes `dist/` to GitHub Pages.

- Live site: https://hoai2k.github.io/tennis/
- Static assets (models, music, images, portraits) live in `public/` and are
  copied to the root of `dist/` by the build — reference them with paths
  relative to the site root, e.g. `models/yuji.glb`, not `/public/models/...`.
- `vite.config.ts` sets `base: './'` so the game works from the `/tennis/`
  subpath. Keep it relative.
- Never commit `dist/` — CI builds it.

## Merge policy: always merge to `main` when done

Every change must end up on `main` so it is live in the deployed version and can be tested online. Do not leave finished work sitting on a feature branch.

When a task is complete:

1. Commit the work on the working branch with a clear message.
2. Push the branch: `git push -u origin <branch-name>`.
3. Merge it into `main` and push `main`:
   ```
   git fetch origin main
   git checkout main && git pull origin main
   git merge <branch-name>
   git push -u origin main
   ```
   If a pull request is used instead, merge it as soon as checks pass rather than leaving it open.
4. Confirm to the user that the change is on `main` and therefore live.

Notes:

- "Done" means merged to `main` — a pushed feature branch is not a finished task.
- Resolve merge conflicts against `main` before merging; never force-push `main`.
- If merging to `main` is blocked (failing checks, branch protection, unresolved conflicts, or work the user explicitly asked to keep unmerged), say so explicitly instead of silently stopping at the feature branch.
- Only skip the merge when the user explicitly asks for the work to stay on a branch.
