"""Sample CHELSA v2.1 historical monthly air temperature normals (CC0 1.0)."""
import json
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from pyproj import CRS, Transformer
import rasterio
from rasterio.windows import Window
from shapely import make_valid, transform
from shapely.geometry import shape

from atlas_worldpop import hex_indices
from download import CACHE, FILES, fetch

ROOT = Path(__file__).resolve().parents[2]
PROJECTION = CRS.from_proj4('+proj=lcc +lat_1=43 +lat_2=53 +lat_0=48 +lon_0=67 +datum=WGS84 +units=m')
SOURCE = {
    'name': 'CHELSA v2.1',
    'url': 'https://www.chelsa-climate.org/datasets/chelsa_climatologies',
    'period': '1981–2010',
    'resolution': '~1 km (30 arcseconds)',
}
TAS = (
    'https://os.unil.cloud.switch.ch/chelsa02/chelsa/global/climatologies/tas/'
    '1981-2010/CHELSA_tas_{month:02d}_1981-2010_V.2.1.tif'
)
WINTER_MONTHS = (12, 1, 2)


def land_centers(atlas, indices):
    """Undo the atlas projection at each original, unrounded hex center."""
    fetch(('country.geojson', FILES['country.geojson']))
    boundary = json.loads((CACHE / 'country.geojson').read_text())['features'][0]['geometry']
    forward = Transformer.from_crs(4326, PROJECTION, always_xy=True)
    inverse = Transformer.from_crs(PROJECTION, 4326, always_xy=True)
    left, _, right, top = make_valid(transform(shape(boundary), forward.transform, interleaved=False)).bounds
    meters_per_unit = (right - left) / atlas['width']

    x, y = np.asarray([atlas['tiles'][index][:2] for index in indices]).T
    radius = atlas['radius']
    row, column = hex_indices(x, y, radius)
    x = (column + (row % 2) / 2) * math.sqrt(3) * radius
    y = row * 1.5 * radius
    return inverse.transform(left + x * meters_per_unit, top - y * meters_per_unit)


def sample_month(month, longitude, latitude):
    """Read only the part of the cloud-optimized GeoTIFF covering the atlas."""
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_TIMEOUT=60, GDAL_HTTP_MAX_RETRY=2):
        with rasterio.open(TAS.format(month=month)) as raster:
            tags = raster.tags()
            if raster.crs.to_epsg() != 4326 or (tags.get('variable'), tags.get('variable_unit'), tags.get('datetime')) != (
                'tas', 'K', '1981-2010'
            ):
                raise ValueError(f'Month {month} has unexpected CHELSA raster metadata')

            rows, columns = rasterio.transform.rowcol(raster.transform, longitude, latitude)
            left, top = columns.min(), rows.min()
            width, height = columns.max() - left + 1, rows.max() - top + 1
            window = raster.read(1, window=Window(left, top, width, height), masked=True)
            samples = window[rows - top, columns - left]
            if np.ma.getmaskarray(samples).any():
                raise ValueError(f'Month {month} has missing temperature data at an atlas center')

            return samples.data.astype(float) * raster.scales[0] + raster.offsets[0] - 273.15


def build():
    atlas = json.loads((ROOT / 'data' / 'atlas-data.json').read_text())
    cities = sorted(atlas['cities'], key=lambda city: city['id'])
    land_indices = [i for i, tile in enumerate(atlas['tiles']) if tile[4] and tile[2] != 0]
    hex_lon, hex_lat = land_centers(atlas, land_indices)
    longitude = np.concatenate(([city['lon'] for city in cities], hex_lon))
    latitude = np.concatenate(([city['lat'] for city in cities], hex_lat))

    with ThreadPoolExecutor(max_workers=len(WINTER_MONTHS)) as pool:
        samples = [pool.submit(sample_month, month, longitude, latitude) for month in WINTER_MONTHS]
        temperatures = np.column_stack([sample.result() for sample in samples])

    city_normals = np.round(temperatures[:len(cities)], 2).tolist()
    # Report the arithmetic mean of the December, January and February normals.
    land_normals = np.round(temperatures[len(cities):].mean(axis=1), 1).tolist()
    hexes = [None] * len(atlas['tiles'])
    for index, temperature in zip(land_indices, land_normals, strict=True):
        hexes[index] = temperature

    winter = dict(
        source=SOURCE,
        cities={str(city['id']): normal for city, normal in zip(cities, city_normals, strict=True)},
        hexes=hexes,
    )
    (ROOT / 'data' / 'winter.json').write_text(
        json.dumps(winter, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n',
        encoding='utf-8',
    )
    print(f'CHELSA winter normals: {len(city_normals)} places, {len(land_normals):,} land hexes')


if __name__ == '__main__':
    build()
