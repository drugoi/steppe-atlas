"""Update the atlas coordinates of the curated landmarks from their source coordinates."""
import json
from pathlib import Path

from pyproj import CRS, Transformer
from shapely import make_valid, transform
from shapely.geometry import shape

root = Path(__file__).resolve().parents[2]
landmarks_file = root / 'data' / 'city-landmarks.json'
atlas = json.loads((root / 'data' / 'atlas-data.json').read_text())
country = json.loads((root / '.cache' / 'atlas' / 'country.geojson').read_text())
crs = CRS.from_proj4('+proj=lcc +lat_1=43 +lat_2=53 +lat_0=48 +lon_0=67 +datum=WGS84 +units=m')
projection = Transformer.from_crs(4326, crs, always_xy=True)
boundary = shape(country['features'][0]['geometry'])
left, _, right, top = make_valid(transform(boundary, projection.transform, interleaved=False)).bounds
scale = atlas['width'] / (right - left)
cities = {city['name']: city['id'] for city in atlas['cities']}

landmarks = json.loads(landmarks_file.read_text())
for landmark in landmarks:
    landmark['cityId'] = cities[landmark['city']]
    x, y = projection.transform(landmark['lon'], landmark['lat'])
    landmark['xy'] = [round((x-left)*scale, 2), round((top-y)*scale, 2)]
landmarks_file.write_text(json.dumps(landmarks, ensure_ascii=False, indent=2)+'\n')
