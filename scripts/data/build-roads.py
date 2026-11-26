"""Build the ODbL road layer from the pinned Geofabrik Kazakhstan extract."""

import json
import math
import re
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

import osmium
from pyproj import CRS, Transformer
from shapely import STRtree, line_merge, make_valid, prepare, transform, union_all
from shapely.geometry import LineString, MultiLineString, Point, box, shape

from download import CACHE, OSM_ROADS, OSM_ROADS_URL

ROOT = Path(__file__).resolve().parents[2]
CLASS_NAMES = ('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'local')
QUANTIZATION = 16
BLOCK = 48
LOCAL_RADIUS = 22000
PROJECTION = CRS.from_proj4('+proj=lcc +lat_1=43 +lat_2=53 +lat_0=48 +lon_0=67 +datum=WGS84 +units=m')
REF = re.compile(r'^[A-ZА-Я]{1,5}[ -]?\d[A-ZА-Я0-9 ./-]{0,8}$', re.IGNORECASE)


def lines(geometry):
    if geometry.is_empty:
        return
    if geometry.geom_type=='LineString':
        yield geometry
    elif hasattr(geometry, 'geoms'):
        for part in geometry.geoms:
            yield from lines(part)


def road_class(highway):
    if not highway:
        return None
    major = highway.removesuffix('_link')
    if major in CLASS_NAMES[:-1]:
        return CLASS_NAMES.index(major)
    if highway in ('residential', 'unclassified', 'living_street'):
        return CLASS_NAMES.index('local')
    return None


def route_ref(value):
    refs = [ref.strip() for ref in (value or '').split(';') if REF.fullmatch(ref.strip())]
    return next((ref for ref in refs if not re.match(r'^(?:E|AH)[ -]?\d', ref)), refs[0] if refs else None)


class RoadReader(osmium.SimpleHandler):
    def __init__(self, forward, extent, local_area, towns):
        super().__init__()
        self.forward = forward
        self.extent = extent
        self.local_area = local_area
        self.town_index = STRtree(towns)
        self.groups = defaultdict(list)
        self.routes = defaultdict(list)
        self.counts = Counter()

    def way(self, way):
        highway = way.tags.get('highway')
        kind = road_class(highway)
        if kind is None or way.tags.get('area')=='yes' or len(way.nodes)<2:
            return
        if any(not node.location.valid() for node in way.nodes):
            return
        geo = [(node.lon, node.lat) for node in way.nodes]
        x, y = self.forward.transform(*zip(*geo))
        line = LineString(zip(x, y))
        if line.is_empty or line.length==0:
            return
        local = kind==len(CLASS_NAMES)-1
        if local and not len(self.town_index.query(line, predicate='intersects')):
            return
        area = self.local_area if local else self.extent
        if not area.covers(line):
            line = area.intersection(line)
        for segment in lines(line):
            if segment.length==0:
                continue
            self.groups[kind].append(segment)
            self.counts[highway] += 1
            if kind<=2 and not highway.endswith('_link'):
                ref = route_ref(way.tags.get('ref'))
                if ref:
                    self.routes[kind, ref].append(segment)


def quantize(line):
    result = []
    previous = None
    for x,y in line.coords:
        point = round(x*QUANTIZATION), round(y*QUANTIZATION)
        if point!=previous:
            result.extend(point)
            previous=point
    return result if len(result)>=4 else None


@lru_cache(maxsize=None)
def bounds(col,row):
    return box(col*BLOCK,row*BLOCK,(col+1)*BLOCK,(row+1)*BLOCK)


def build():
    source = CACHE / OSM_ROADS
    if not source.is_file():
        raise SystemExit('Fetch the pinned road extract with scripts/data/download.py --roads.')
    with osmium.io.Reader(source) as reader:
        timestamp = reader.header().get('osmosis_replication_timestamp')
    if not timestamp:
        raise SystemExit('The extract header has no OpenStreetMap snapshot timestamp.')
    forward = Transformer.from_crs(4326, PROJECTION, always_xy=True)
    country = json.loads((CACHE/'country.geojson').read_text())['features'][0]['geometry']
    projected = make_valid(transform(shape(country), forward.transform, interleaved=False))
    west, _, east, north = projected.bounds
    extent = projected.buffer(6500)
    prepare(extent)
    atlas = json.loads((ROOT/'data'/'atlas-data.json').read_text())
    towns = [Point(forward.transform(city['lon'],city['lat'])).buffer(LOCAL_RADIUS) for city in atlas['cities']]
    local_area = union_all(towns).intersection(extent)
    prepare(local_area)
    scale = atlas['width']/(east-west)

    def atlas_coordinates(xy):
        result = xy.copy()
        result[:,0] = (xy[:,0]-west)*scale
        result[:,1] = (north-xy[:,1])*scale
        return result

    reader = RoadReader(forward, extent, local_area, towns)
    reader.apply_file(source, locations=True, idx='flex_mem')
    print('OSM paths by tag', dict(sorted(reader.counts.items())), flush=True)
    blocks = defaultdict(lambda: [[] for _ in CLASS_NAMES])
    overview = [[] for _ in CLASS_NAMES]
    for kind,segments in sorted(reader.groups.items()):
        for line in lines(line_merge(MultiLineString(segments))):
            if kind<=2:
                coarse = quantize(transform(line.simplify(2600), atlas_coordinates))
                if coarse:
                    overview[kind].append(coarse)
            if kind==5 and line.length<340:
                continue
            fine = transform(line.simplify((150,150,175,210,240,165)[kind]), atlas_coordinates)
            left,top,right,bottom=fine.bounds
            for row in range(math.floor(top/BLOCK), math.floor(bottom/BLOCK)+1):
                for col in range(math.floor(left/BLOCK), math.floor(right/BLOCK)+1):
                    for clipped in lines(fine.intersection(bounds(col,row))):
                        encoded=quantize(clipped)
                        if encoded:
                            blocks[f'{col},{row}'][kind].append(encoded)
        del reader.groups[kind]

    labels = []
    for (kind,ref),segments in sorted(reader.routes.items()):
        for line in lines(line_merge(MultiLineString(segments))):
            if line.length<8000:
                continue
            count = max(1, math.ceil(line.length/85000))
            for i in range(count):
                point = transform(line.interpolate((i+.5)/count, normalized=True), atlas_coordinates)
                labels.append([kind,ref,round(point.x*QUANTIZATION),round(point.y*QUANTIZATION)])

    dataset = {
        'version': 1,
        'source': {
            'attribution': '© OpenStreetMap contributors',
            'license': 'ODbL-1.0',
            'licenseUrl': 'https://opendatacommons.org/licenses/odbl/1-0/',
            'extract': OSM_ROADS_URL,
            'timestamp': timestamp,
        },
        'classes': CLASS_NAMES,
        'quantization': QUANTIZATION,
        'blockSize': BLOCK,
        'localCoverageMeters': LOCAL_RADIUS,
        'overview': overview,
        'blocks': dict(sorted(blocks.items())),
        'labels': labels,
    }
    target = ROOT/'data'/'osm-roads.json'
    target.write_text(json.dumps(dataset, ensure_ascii=False, separators=(',',':'))+'\n')
    print(f'{len(blocks)} blocks · {len(labels)} route labels · {target.stat().st_size:,} bytes')


if __name__=='__main__':
    build()
