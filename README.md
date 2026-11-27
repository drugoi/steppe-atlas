# Steppe Atlas

An interactive hex atlas of Kazakhstan with terrain, economic districts, heritage and infrastructure, and WorldPop population estimates. [Open the live atlas](https://kazakhstan.drugoi.dev/).

## Build locally

With Node.js 22 or newer:

```sh
npm ci
npm run build
```

Open `dist/standalone.html` directly in a browser to use the atlas offline. To preview the hosted editions, serve `dist/` over HTTP, for example with `python3 -m http.server --directory dist 8000`. Edit the HTML, CSS and JavaScript in `src/`. The build reads the committed snapshot from `data/atlas-data.json`.

## Language editions

English is served at `/`, Kazakh at `/kk/`, and Russian at `/ru/`. Each edition has its own title and link preview. The selector keeps the map position, layer, and selected place when switching languages. The standalone HTML also embeds all three languages and switches using a query parameter.

The Kazakh and Russian copy lives in `locales/`. Each entry is keyed by its English message or by a stable data identifier. Keep placeholders such as `{place}` and `{link1}` when editing a message. The build checks coverage and placeholders against the interface, map data, and city stories. City and region names use their existing Kazakh and Russian registry fields.

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

### Refresh the road layer

```sh
.venv/bin/python scripts/data/download.py --roads
.venv/bin/python scripts/data/build-roads.py
npm run build
```

The road extract and snapshot timestamp are recorded in `data/osm-roads.json`, published separately under ODbL 1.0. It uses the atlas projection and stores x/y pairs as integers scaled by `quantization`. `overview` holds generalized main routes. `blocks` uses column,row keys in `blockSize` atlas units and holds arrays of lines in the order given by `classes`. Through roads cover Kazakhstan and nearby border connections. Local roads are shown within 22 km of atlas settlements. Route symbols use the OpenStreetMap `ref` tag.

To regenerate the shaded terrain and winter textures after refreshing the terrain sources, run:

```sh
.venv/bin/python scripts/data/download.py --relief
.venv/bin/python scripts/data/build-relief.py
npm run build
```

The naming crosswalk in `data/city-names.json` ties each atlas ID to the November 2026 KATO registry. It supplies the Kazakh and Russian names, administrative type, English spelling and search aliases. It also holds a source for any corrected settlement coordinates. Keep atlas IDs stable when updating the crosswalk so existing map links keep working.

Each landmark in `data/city-landmarks.json` has a short account, a source and a coordinate record. At city scale, the Terrain and Winter layers draw city landmarks on the same platform as their settlement. The feature belongs to the city hex if it shares the hex or is within 7 km of the atlas city point. A shared hex shows the selected settlement or the most populous one. The hex inspector lists every settlement in it. The place profile can locate outlying landmarks on the map, and the landmark inspector links to the published coordinates. `data/city-stories.json` holds sourced profiles of places without a selected landmark. After changing landmark coordinates or rebuilding the atlas, run `.venv/bin/python scripts/data/project-landmarks.py` to update their map positions. If the hex grid or settlement coordinates change, run `.venv/bin/python scripts/data/build-winter.py` to align the winter data with the new locations. It samples CHELSA's December, January and February temperature normals from 1981–2010. The winter relief illustrates the season using the elevation and land cover datasets. The colors of the hexes encode temperature.

## Deployment

GitHub Actions builds changes on pull requests. On pushes to `main` and manual runs on `main`, Wrangler deploys `dist/` to the existing Cloudflare Pages project `steppe-atlas`. The workflow verifies that the custom domain serves each language edition it built.

The repository uses the Actions variable `CLOUDFLARE_ACCOUNT_ID` and encrypted secret `CLOUDFLARE_API_TOKEN`. The token needs account-level Pages Write. For a manual deployment from an authenticated development machine, run `npm run build` followed by `npm run deploy`.

The production build also reads the optional Actions variable `GA4_MEASUREMENT_ID`. Analytics runs by default on `kazakhstan.drugoi.dev` when the Measurement ID is configured. Visitors can turn it off in Sources → Analytics settings. A saved opt-out takes effect across all language editions on that browser. The atlas sends one page view per load and events for changing map layers, opening places, inspecting hexes, and copying links. It omits search text and map coordinates. Before loading Google Analytics, the atlas removes unrelated query parameters from the address and preserves the atlas language, map view, and recognized launch campaign. In the GA4 web stream settings, keep history-based page views disabled.
