# ANGST — deploy to GitHub Pages + angstdata.ai

The repo has **no git remote** yet. Run these from the project folder (PowerShell or Git Bash).

## 1. Build check
```
npm install
npm run build
npm run preview        # http://localhost:4323
```

## 1b. Install the Pages workflow (one-time)
The remote tools could not write into `.github/`. Run:
```
mkdir -p .github/workflows
cp deploy/github-pages-workflow.yml .github/workflows/deploy.yml
```
(PowerShell: `New-Item -ItemType Directory -Force .github\workflows; Copy-Item deploy\github-pages-workflow.yml .github\workflows\deploy.yml`)

## 2. Create repo + push (needs your GitHub login)
With GitHub CLI:
```
gh auth login
git add -A
git commit -m "Production homepage for angstdata.ai"
gh repo create angst-website --public --source . --remote origin --push
```
Without gh: create an empty repo at https://github.com/new, then
```
git remote add origin https://github.com/<YOUR_ACCOUNT>/<REPO>.git
git push -u origin master
```
(GitHub Pages on a free plan needs a public repo; private works on Pro/Team.)

## 3. Turn on Pages
Repo → Settings → Pages → Build and deployment → Source: **GitHub Actions**.
The workflow `.github/workflows/deploy.yml` builds and deploys on every push to `master`/`main`.
Then Settings → Pages → Custom domain: `angstdata.ai` → Save. Tick **Enforce HTTPS** once the certificate is issued.
`public/CNAME` already contains `angstdata.ai`.

## 4. Squarespace DNS (Domains → angstdata.ai → DNS → Custom records)
Remove any Squarespace default A/CNAME records for `@` and `www` first, then add:

| Host | Type  | Data                     |
|------|-------|--------------------------|
| @    | A     | 185.199.108.153          |
| @    | A     | 185.199.109.153          |
| @    | A     | 185.199.110.153          |
| @    | A     | 185.199.111.153          |
| @    | AAAA  | 2606:50c0:8000::153      |
| @    | AAAA  | 2606:50c0:8001::153      |
| @    | AAAA  | 2606:50c0:8002::153      |
| @    | AAAA  | 2606:50c0:8003::153      |
| www  | CNAME | <YOUR_ACCOUNT>.github.io |

Recommended: verify the domain under GitHub → Settings (account/org) → Pages → Verified domains (adds one TXT record).
Propagation: minutes to a few hours. Check with `nslookup angstdata.ai`.

## Notes
- All contact / collaboration actions use `mailto:info@angstdata.in` (set once in `src/pages/index.astro`, `contactEmail`; also in `src/components/SiteHeader.astro` mobile menu).
- Previous cinematic homepage is archived at `src/legacy/index.experience-e04.astro` (not routed). All experience components are untouched.
