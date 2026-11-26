"""Fetch the public inputs used to refresh the atlas snapshot."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import shutil
from urllib.request import Request, urlopen

CACHE = Path(__file__).resolve().parents[2] / '.cache' / 'atlas'
BNS = 'https://stat.gov.kz'
NATURAL_EARTH = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson'
TOPONYM = 'https://raw.githubusercontent.com/ashimov/toponym-kz/3e39a6f16e52b1db02232805f939d09d8d77eea1/public/data'
WORLDPOP = 'https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/2025/KAZ/v1/1km_ua/constrained/kaz_pop_2025_CN_1km_R2025A_UA_v1.tif'

FILES = {
    'country.geojson': f'{TOPONYM}/kz-country.geojson',
    'regions.geojson': f'{TOPONYM}/kz-regions.geojson',
    'places.zip': 'https://download.geonames.org/export/dump/KZ.zip',
    'econ.html': f'{BNS}/en/industries/economy/national-accounts/publications/513538/',
    'our-airports.csv': 'https://davidmegginson.github.io/ourairports-data/airports.csv',
    'power.csv': 'https://raw.githubusercontent.com/wri/global-power-plant-database/7a91cfbb2a4e272597acbc00506d61fc1ec73b3d/output_database/global_power_plant_database.csv',
    'worldpop-kaz-2025-1km.tif': WORLDPOP,
    'cover.png': (
        'https://mapproxy.terrascope.be/mapproxy/service?service=WMS&request=GetMap&version=1.1.1'
        '&layers=esa-worldcover-map-10m-2021-v2_map&styles=&format=image/png&srs=EPSG:4326'
        '&bbox=38,35,97,61&width=1770&height=780'
    ),
}

for name, element, lang in [
    ('pop', 348013, 'ru'), ('pop-2025', 280746, 'ru'), ('sectors', 39176, 'en'),
    ('gva', 39180, 'en'), ('workforce', 103072, 'en'), ('employed', 103070, 'en'),
]:
    FILES[f'{name}.xlsx'] = f'{BNS}/api/iblock/element/{element}/file/{lang}/'

for name, layer in [
    ('lakes', 'ne_50m_lakes'), ('ocean', 'ne_50m_ocean'), ('rivers', 'ne_50m_rivers_lake_centerlines'),
    ('railroads', 'ne_10m_railroads'), ('ports', 'ne_10m_ports'),
]:
    FILES[f'{name}.geojson'] = f'{NATURAL_EARTH}/{layer}.geojson'

for x in range(19, 25):
    for y in range(8, 14):
        FILES[f'dem/{x}-{y}.png'] = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/5/{x}/{y}.png'


def fetch(item):
    name, url = item
    destination = CACHE / name
    if destination.is_file():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + '.part')
    request = Request(url, headers={'User-Agent': 'Steppe Atlas data preparation'})
    try:
        with urlopen(request, timeout=120) as response, partial.open('wb') as output:
            shutil.copyfileobj(response, output)
        partial.replace(destination)
    except Exception as error:
        partial.unlink(missing_ok=True)
        raise RuntimeError(f'Could not download {name} from {url}') from error
    print(f'Downloaded {name}')


if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(fetch, FILES.items()))
