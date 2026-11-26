"""Build the embedded atlas snapshot from downloaded public source files."""
import json
import math
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path
from zipfile import ZipFile

from bs4 import BeautifulSoup
from openpyxl import load_workbook
from PIL import Image
from pyproj import CRS, Transformer
from shapely import make_valid
from shapely.geometry import Point, box, shape
from shapely.ops import transform
from shapely.prepared import prep

from atlas_extra_data import ACTIVITIES, accounts, labor, locations
from atlas_worldpop import build_worldpop

ROOT = Path(__file__).resolve().parents[2] / ".cache" / "atlas"
CRS_KZ = CRS.from_proj4('+proj=lcc +lat_1=43 +lat_2=53 +lat_0=48 +lon_0=67 +datum=WGS84 +units=m')
projection = Transformer.from_crs(4326, CRS_KZ, always_xy=True)
inverse = Transformer.from_crs(CRS_KZ, 4326, always_xy=True)

def read_geo(name):
    return json.loads((ROOT / f'{name}.geojson').read_text())['features']

def projected(feature):
    return make_valid(transform(projection.transform, shape(feature['geometry'])))

country = projected(read_geo('country')[0])
left, bottom, right, top = country.bounds
scale = 1120 / (right - left)
height = round((top - bottom) * scale, 1)

def atlas(x, y):
    return [round((x - left) * scale, 1), round((top - y) * scale, 1)]

def coords(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'Polygon':
        return [[atlas(*point) for point in ring.coords] for ring in [geometry.exterior, *geometry.interiors]]
    if geometry.geom_type == 'LineString':
        return [[atlas(*point) for point in geometry.coords]]
    if hasattr(geometry, 'geoms'):
        return [ring for part in geometry.geoms for ring in coords(part)]
    return []

pop = load_workbook(ROOT / 'pop.xlsx', read_only=True, data_only=True)['1.']
rows = list(pop.values)
iso_order = [0,10,11,15,19,23,27,31,33,35,39,43,47,55,59,61,62,63,71,75,79]
totals = dict(zip(iso_order, rows[6:27], strict=True))
urban = dict(zip(iso_order, rows[28:49], strict=True))
assert all(totals[k][0] == urban[k][0] for k in iso_order)
table = BeautifulSoup((ROOT / 'econ.html').read_text(), 'html.parser').select_one('table.publication-table')
econ_rows = [[td.get_text(strip=True) for td in tr.select('td')] for tr in table.select('tr')]
econ = dict(zip(iso_order, [r for r in econ_rows if r], strict=True))

sectors = {}
industry = load_workbook(ROOT / 'sectors.xlsx', read_only=True, data_only=True)['2018-2026']
for row in industry.values:
    if isinstance(row[0], int) and row[1]:
        iso = row[0]
    if str(row[1]).strip() == '2025' and isinstance(row[2], (float, int)):
        sectors[iso] = {key: round(row[column], 1) for key, column in
                        [('industrial',2),('mining',3),('coal',4),('oil',5),('ores',6),('manufacturing',9),
                         ('food',10),('refining',20),('chemicals',21),('metallurgy',25)]
                        if isinstance(row[column], (float, int))}
assert set(sectors) == set(iso_order)

def num(string):
    return float(''.join(string.split()).replace(',', '.'))

gva = accounts()
labor_stats = labor(iso_order)
assert set(gva) == set(iso_order), gva.keys()

def stats(iso):
    row = totals[iso]
    e = econ[iso]
    assert abs(num(e[1]) - gva[iso]['total']) < 1, (iso,e,gva[iso])
    return dict(startPop=row[1], gva=gva[iso]['sectors'], labor=labor_stats[iso],pop=row[5], urban=urban[iso][5], change=row[2], growth=row[6], natural=row[3], migration=row[4],
                grp=num(e[1]), capita=num(e[4])*1000, realGrowth=round(num(e[3])-100,1), **sectors[iso])

region_shapes = {}
regions = {}
rename = {15:'Aktobe Region', 31:'Zhambyl Region', 33:'Jetisu Region'}
for feature in read_geo('regions'):
    p = feature['properties']
    iso = int(p['iso'].split('-')[1])
    geom = projected(feature)
    region_shapes[iso] = geom
    center = geom.representative_point()
    regions[iso] = dict(id=iso, name=rename.get(iso,p['name_en']), kk=p['name_kk'], ru=p['name_ru'],
                        kind=p['kind'], xy=atlas(center.x,center.y), shape=coords(geom.simplify(1150,preserve_topology=True)),
                        **stats(iso))

def normalized(value):
    return ''.join(character for character in value.casefold().replace('ё','е') if character.isalnum())

city_sheet = load_workbook(ROOT / 'pop-2025.xlsx', read_only=True, data_only=True)['3']
region_names = {totals[i][0].strip():i for i in iso_order if i}
city_counts = {}
settlement_counts = {}
division = None
for row in city_sheet.values:
    name, people = row[:2]
    if not isinstance(name,str) or not isinstance(people,int):
        continue
    division = region_names.get(name.strip(),division)
    match = re.match(r'^\s*(?:(?P<city>г\.|город\s+)|[пс]\.)\s*(?P<name>.+)$',name,re.I)
    if match and division:
        counts = city_counts if match['city'] else settlement_counts
        counts[division,normalized(match['name'])] = people
# A village or settlement can share a city's name within the same division.
city_counts = settlement_counts | city_counts

names = {1520316:'Oskemen',1516589:'Zhezkazgan',1519843:'Rudny',609655:'Karaganda',
         1521368:'Baikonur',1522202:'Kosshy',1526482:'Alatau',1516789:'Aiteke Bi'}
extra_aliases = {1521368:['Байконыр'],1522202:['Косшы'],1516789:['Айтеке би']}
name_records = json.loads((Path(__file__).resolve().parents[2] / 'data' / 'city-names.json').read_text())['places']
with ZipFile(ROOT / 'places.zip') as source:
    places = [line.decode('utf-8').rstrip('\r\n').split('\t') for line in source.open('KZ.txt')]
places.sort(key=lambda place: -int(place[14] or 0))
cities = []
used_names = set()
known_names = {name for (_,name),people in city_counts.items() if people>=30000}
for place in places:
    if place[6] != 'P' or place[7] not in {'PPLC','PPLA','PPLA2','PPLA3','PPL'}:
        continue
    ident, people = int(place[0]), int(place[14] or 0)
    aliases = [v for v in place[3].split(',') if any('А' <= c <= 'я' or c in 'ӘҚҒІҢӨҰҮҺәіғқңөұүһ' for c in v)]
    aliases = extra_aliases.get(ident,[]) + aliases
    names_for_join = [normalized(v) for v in aliases+[place[1]]]
    seat = place[7] in {'PPLC','PPLA'}
    if people < 30000 and not seat and not known_names.intersection(names_for_join):
        continue
    y, x = float(place[4]), float(place[5])
    px, py = projection.transform(x,y)
    point = Point(px,py)
    region = next((key for key, geom in region_shapes.items() if geom.covers(point)), None)
    if not region:
        # A coastal gazetteer coordinate may sit just outside the mapped boundary.
        region = min(region_shapes,key=lambda key: region_shapes[key].distance(point))
        if region_shapes[region].distance(point) > 8000:
            continue
    admin = region in (71,75,79) and seat
    candidates = {(region,name) for name in names_for_join if (region,name) in city_counts}
    source_date = None
    if admin:
        people = regions[region]['pop']
        source_date = '2026-10-01'
    elif len(candidates)==1:
        city_key = next(iter(candidates))
        if city_key in used_names:
            continue
        people = city_counts[city_key]
        source_date = '2025-01-01'
        used_names.add(city_key)
    if people < 30000 and not seat and not int(place[14] or 0)>=30000:
        continue
    cities.append(dict(id=ident,name=names.get(ident,place[1]),aliases=aliases[:18]+[place[1]],region=region,
                       pop=people or None,popDate=source_date,official=admin,capital=place[7]=='PPLC',seat=seat,
                       xy=atlas(px,py), lat=y, lon=x))
for city in cities:
    official = name_records.get(str(city['id']))
    if not official:
        continue
    aliases = [official['kk'], official['ru'], city['name'], *official.get('aliases', []), *city['aliases']]
    excluded = set(official.get('excludeAliases', []))
    city.update(name=official['name'], kk=official['kk'], ru=official['ru'], kato=official['kato'],
                placeType=official['type'], aliases=list(dict.fromkeys(alias for alias in aliases if alias not in excluded)))
    if location := official.get('location'):
        city.update(lat=location['lat'], lon=location['lon'],
                    xy=atlas(*projection.transform(location['lon'], location['lat'])))
cities.sort(key=lambda city: -(city['pop'] or 0))
assert {c['region'] for c in cities if c['official']} == {71,75,79}
assert len({c['id'] for c in cities}) == len(cities)
print('City population sources:',{date:sum(c['popDate']==date for c in cities) for date in ['2025-01-01','2026-10-01',None]})

extent = box(35,33,99,65)
def water_shapes(source):
    for feature in read_geo(source):
        geom = make_valid(shape(feature['geometry'])).intersection(extent)
        if not geom.is_empty:
            yield prep(transform(projection.transform,geom))

ocean = list(water_shapes('ocean'))
water = list(water_shapes('lakes')) + ocean
is_country = prep(country)
prepared_regions = [(id,prep(geom)) for id,geom in region_shapes.items()]
rivers = []
for feature in read_geo('rivers'):
    g = shape(feature['geometry']).intersection(extent)
    if not g.is_empty:
        rivers += coords(transform(projection.transform,g).simplify(1700))

rail_extent = country.buffer(110_000)
rail = []
for feature in read_geo('railroads'):
    geom = shape(feature['geometry'])
    if not geom.intersects(extent):
        continue
    clipped = transform(projection.transform,geom).intersection(rail_extent)
    if not clipped.is_empty:
        rail += coords(clipped.simplify(1600))

def project_position(lon,lat):
    return atlas(*projection.transform(lon,lat))

def region_at(lon,lat):
    point = Point(*projection.transform(lon,lat))
    return next((code for code,geom in prepared_regions if geom.covers(point)),None)

sites = locations(project_position,region_at)
port_points = [f for f in read_geo('ports') if region_at(*f['geometry']['coordinates'])]
for feature in port_points:
    lon,lat = feature['geometry']['coordinates']
    sites.append(dict(id=len(sites)+1,kind='port',name=feature['properties']['name'],lat=lat,lon=lon,
                      xy=project_position(lon,lat),region=region_at(lon,lat),tag='Caspian port',
                      source='https://www.naturalearthdata.com/downloads/10m-cultural-vectors/ports/'))
cover_image = Image.open(ROOT/'cover.png').convert('RGB')
land_codes = {
    10:(0,100,0),20:(255,187,34),30:(255,255,76),40:(240,150,255),
    50:(250,0,0),60:(180,180,180),70:(240,240,240),80:(0,100,200),
    90:(0,150,160),95:(0,207,117),100:(250,230,160),
}

@lru_cache(maxsize=10000)
def nearest_land_code(rgb):
    code = min(land_codes,key=lambda k: sum((a-b)**2 for a,b in zip(rgb,land_codes[k])))
    return code if sum((a-b)**2 for a,b in zip(rgb,land_codes[code]))<10000 else 0

def land_sample(lon,lat):
    px=int((lon-38)*30)
    py=int((61-lat)*30)
    if not (0<=px<cover_image.width and 0<=py<cover_image.height):
        return 0
    rgb = cover_image.getpixel((px,py))
    # The WMS's neutral background is close to its snow class in RGB space.
    if rgb == (250, 250, 250):
        sample = Point(*projection.transform(lon,lat))
        if any(region.covers(sample) for region in ocean):
            return 80
    return nearest_land_code(rgb)

def land_profile(lon,lat):
    samples = Counter(land_sample(lon+dx,lat+dy) for dx in (-.13,-.065,0,.065,.13)
                      for dy in (-.085,-.0425,0,.0425,.085))
    samples.pop(0,None)
    return (samples.most_common(1)[0][0] if samples else 0), samples[10], samples[40]

@lru_cache
def dem_tile(x,y):
    return Image.open(ROOT/f'dem/{x}-{y}.png').convert('RGB')

def elev(lon,lat):
    size = 32 * 256
    x = int((lon+180)/360 * size)
    y = int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*size)
    try:
        r,g,b = dem_tile(x//256,y//256).getpixel((x%256,y%256))
    except FileNotFoundError:
        if 46 <= lon <= 88 and 39 <= lat <= 56:
            raise
        return 0
    return round(r*256 + g + b/256 - 32768)

radius = 7.8
tiles = []
for row in range(-39, int(height/(radius*1.5))+40):
    for column in range(-29, 115):
        x = (column+(row%2)/2)*math.sqrt(3)*radius
        y = row*1.5*radius
        mx,my = x/scale+left,top-y/scale
        lon,lat = inverse.transform(mx,my)
        point = Point(mx,my)
        inside = is_country.covers(point)
        cover,trees,crops = land_profile(lon,lat)
        wet = cover == 80 or (not cover and any(g.covers(point) for g in water))
        z = 0 if wet else elev(lon,lat)
        region = next((key for key,g in prepared_regions if g.covers(point)),0) if inside and not wet else 0
        # The land palette is an artistic approximation of broad terrain bands.
        variation = math.sin(lon*.63+lat*1.31)*.38 + math.sin(lon*1.67-lat*.49)*.28
        terrain = 0 if wet else 4 if z>=2050 else 3 if z>=850 else 1 if lat+variation>=48.7 else 2
        shade = 0 if wet else max(-35,min(35,round((z-elev(lon-.12,lat+.09))/14)))
        tiles.append([round(x,1),round(y,1),terrain,region,int(inside),shade,z,cover,trees,crops])
print(f'{len(cities)} cities, {len(regions)} divisions, {len(tiles)} hexes, country {height}px high')
assert sum(region['pop'] for region in regions.values()) == stats(0)['pop']
labels = [[name,atlas(*projection.transform(lon,lat))] for name,lon,lat in [
    ('Caspian Sea',48.70,43.55),('Aral Sea',59.45,45.4),('Lake Balkhash',74.3,46.05),
    ('R U S S I A',63.9,56.1),('U Z B E K I S T A N',62.8,40.9),('C H I N A',86.1,43.2)]]
print("Sites by type:", dict(Counter(s["kind"] for s in sites)), "Rail polylines:", len(rail))
world_pop = build_worldpop(ROOT / 'worldpop-kaz-2025-1km.tif', tiles, radius, scale, left, top, projection, inverse)
data = dict(worldPop=world_pop, activities=list(ACTIVITIES.values()),rail=rail,sites=sites,labels=labels, regions=regions,cities=cities,country=coords(country.simplify(1100)),rivers=rivers, tiles=tiles,
            width=1120,height=height,radius=radius,metersPerUnit=round(1/scale),national=stats(0))
(Path(__file__).resolve().parents[2] / 'data' / 'atlas-data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
