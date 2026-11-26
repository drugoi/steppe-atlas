# Steppe Atlas

An interactive hex atlas of Kazakhstan with terrain, economic districts, heritage and infrastructure, and WorldPop population estimates. [Open the live atlas](https://kazakhstan.drugoi.dev/).

## Build locally

With Node.js 22 or newer:

```sh
npm ci
npm run build
```

Open `dist/index.html` directly in a browser. The output embeds the styles, scripts and data, so the map works offline. Edit the HTML, CSS and JavaScript in `src/`. The build reads the committed snapshot from `data/atlas-data.json`.

## Refresh the data

Use Python 3.13 or newer. From the repository root:

```sh
python3 -m venv .venv
.venv/bin/pip install -r scripts/data/requirements.txt
.venv/bin/python scripts/data/download.py
.venv/bin/python scripts/data/build-data.py
npm run build
```

Input files are cached under `.cache/atlas/`. Some providers update their files in place, so a refresh can change the snapshot. Review the diff before committing. The site's **Sources** panel documents the providers, dates, licenses, and WorldPop hex aggregation.

To regenerate the shaded terrain texture after refreshing the terrain sources, run:

```sh
.venv/bin/python scripts/data/download.py --relief
.venv/bin/python scripts/data/build-relief.py
npm run build
```

## Deployment

GitHub Actions builds changes on pull requests. On pushes to `main` and manual runs on `main`, Wrangler deploys `dist/` to the existing Cloudflare Pages project `steppe-atlas`. The workflow verifies that the custom domain serves the same HTML it built.

The repository uses the Actions variable `CLOUDFLARE_ACCOUNT_ID` and encrypted secret `CLOUDFLARE_API_TOKEN`. The token needs account-level Pages Write. For a manual deployment from an authenticated development machine, run `npm run build` followed by `npm run deploy`.
