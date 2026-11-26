"""Render georeferenced relief textures for the atlas’s Terrain and Winter layers."""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from pyproj import CRS, Transformer
from shapely import contains_xy, prepare, transform, union_all
from shapely.geometry import shape

from download import CACHE, RELIEF_TILES

ROOT = Path(__file__).resolve().parents[2]
AREA = (-210, -215, 1540, 1060)
EDGE_FADE = 40
PIXELS_PER_UNIT = 1.8
PROJECTION = CRS.from_proj4('+proj=lcc +lat_1=43 +lat_2=53 +lat_0=48 +lon_0=67 +datum=WGS84 +units=m')
# The first palette is the WMS legend. The second is the atlas's terrestrial palette.
WORLD_COVER = np.array([
    (0, 100, 0), (255, 187, 34), (255, 255, 76), (240, 150, 255), (250, 0, 0),
    (180, 180, 180), (240, 240, 240), (0, 100, 200), (0, 150, 160), (0, 207, 117), (250, 230, 160),
], dtype=np.int32)
LAND_COLORS = np.array([
    (46, 91, 67), (150, 128, 78), (111, 131, 72), (151, 149, 82), (158, 133, 107),
    (182, 151, 105), (225, 223, 199), (39, 96, 113), (65, 116, 99), (55, 112, 87), (152, 143, 107),
], dtype=np.float32)
WATER = 7


def height_mosaic():
    files = [CACHE / f'dem-7/{x}-{y}.png' for x,y in RELIEF_TILES]
    if any(not file.is_file() for file in files):
        raise SystemExit('Download all elevation tiles first with scripts/data/download.py --relief')
    min_x, min_y = np.min(RELIEF_TILES, axis=0)
    max_x, max_y = np.max(RELIEF_TILES, axis=0)
    mosaic = np.zeros(((max_y - min_y + 1) * 256, (max_x - min_x + 1) * 256), dtype=np.float32)
    for file, (x, y) in zip(files, RELIEF_TILES, strict=True):
        rgb = np.asarray(Image.open(file).convert('RGB'), dtype=np.float32)
        row, column = (y - min_y) * 256, (x - min_x) * 256
        mosaic[row:row+256, column:column+256] = rgb[..., 0]*256 + rgb[..., 1] + rgb[..., 2]/256 - 32768
    return mosaic, min_x * 256, min_y * 256


def elevation(lon, lat, mosaic, min_x, min_y):
    dimension = 128 * 256
    x = (lon + 180) / 360 * dimension - min_x - .5
    y = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * dimension - min_y - .5
    valid = (x >= 0) & (y >= 0) & (x < mosaic.shape[1] - 1) & (y < mosaic.shape[0] - 1)
    x, y = np.clip(x, 0, mosaic.shape[1]-1.01), np.clip(y, 0, mosaic.shape[0]-1.01)
    ix, iy = x.astype(np.int32), y.astype(np.int32)
    fx, fy = x-ix, y-iy
    z = (mosaic[iy, ix]*(1-fx)+mosaic[iy, ix+1]*fx)*(1-fy)
    z += (mosaic[iy+1, ix]*(1-fx)+mosaic[iy+1, ix+1]*fx)*fy
    return np.where(valid, z, 0).astype(np.float32)


def surface_colors():
    pixels = np.asarray(Image.open(CACHE / 'cover.png').convert('RGB'), dtype=np.int32)
    best = np.full(pixels.shape[:2], 10000, dtype=np.int32)
    classes = np.full(pixels.shape[:2], 2, dtype=np.uint8)
    for i, color in enumerate(WORLD_COVER):
        difference = np.sum((pixels - color)**2, axis=2, dtype=np.int32)
        np.copyto(classes, i, where=difference < best)
        np.minimum(difference, best, out=best)
    # Fill the WMS's neutral ocean background from Natural Earth's coastline.
    rows, columns = np.nonzero(np.all(pixels == 250, axis=2))
    if rows.size:
        features = json.loads((CACHE / 'ocean.geojson').read_text())['features']
        ocean = union_all([shape(feature['geometry']) for feature in features])
        water_pixels = contains_xy(ocean, 38+(columns+.5)/30, 61-(rows+.5)/30)
        classes[rows[water_pixels],columns[water_pixels]] = WATER
    coast_land = LAND_COLORS.copy()
    coast_land[WATER] = LAND_COLORS[2]
    land = Image.fromarray(coast_land[classes].astype(np.uint8)).filter(ImageFilter.GaussianBlur(.95))
    water = Image.fromarray(np.uint8(classes == WATER)*255).filter(ImageFilter.GaussianBlur(.34))
    return np.dstack((np.asarray(land),np.asarray(water)))


def winter_surface(surface, z, shade, slope, region, mottling, brush, wind, grain, wet, shallows):
    # Seasonal illustration on the same elevation and cover samples as the terrain.
    woodland = np.clip((surface[..., 1] - surface[..., 0] - 6) / 30, 0, 1)
    rock = np.clip((z-1050)/2100 + slope*.18, 0, 1)
    ground = np.array([162, 168, 169]) + woodland[..., None]*np.array([-43, -22, -16])
    ground += rock[..., None]*np.array([-28, -23, -19])
    drift = np.clip(.76 + region*.61 + mottling*.46 + wind*.46 + brush*.12
                    - woodland*.25 + np.clip(z/4300, 0, .40) - slope*.14, .22, .99)
    land = ground*(1-drift[..., None]) + np.array([231, 238, 237])*drift[..., None]
    land += shade[..., None]*np.array([231, 217, 194])
    land += (mottling*11 + brush*12 + wind*17 + grain*6)[..., None]
    water = np.array([43, 74, 99]) + shallows[..., None]*np.array([46, 62, 68])
    water += (region*14 + mottling*12 + brush*8)[..., None]
    return land*(1-wet[..., None]) + water*wet[..., None]


def save_relief(rgb, outside, alpha, tint, strength, filename, quality):
    rgb[outside] = rgb[outside]*(1-strength) + np.array(tint)*strength
    image = Image.fromarray(np.dstack((np.clip(rgb,0,255).astype(np.uint8), alpha)))
    image.save(ROOT/'src'/'assets'/filename,quality=quality,method=6)


def render():
    forward = Transformer.from_crs(4326, PROJECTION, always_xy=True)
    inverse = Transformer.from_crs(PROJECTION, 4326, always_xy=True)
    boundary = shape(json.loads((CACHE / 'country.geojson').read_text())['features'][0]['geometry'])
    projected_country = transform(boundary, forward.transform, interleaved=False)
    west, _, east, north = projected_country.bounds
    atlas_width = json.loads((ROOT / 'data' / 'atlas-data.json').read_text())['width']
    scale = atlas_width / (east - west)
    left, top, w, h = AREA
    width, height = round(w * PIXELS_PER_UNIT), round(h * PIXELS_PER_UNIT)
    px = (np.arange(width)+.5)*w/width
    py = (np.arange(height)+.5)*h/height
    x = west + (left + px)/scale
    y = north - (top + py)/scale
    prepare(projected_country)
    outside = ~contains_xy(projected_country, x[None,:], y[:,None])
    edge = np.minimum(np.minimum(px,w-px)[None,:],np.minimum(py,h-py)[:,None])
    fade = np.clip(edge/EDGE_FADE,0,1)
    alpha = np.round(255*fade*fade*(3-2*fade)).astype(np.uint8)
    mosaic = height_mosaic()
    cover = surface_colors()
    z = np.empty((height,width), dtype=np.float32)
    surface = np.empty((height,width,4), dtype=np.float32)
    for row in range(0, height, 100):
        batch_y = y[row:row+100]
        lon, lat = inverse.transform(*np.meshgrid(x,batch_y))
        z[row:row+len(batch_y)] = elevation(lon,lat,*mosaic)
        px, py = (lon-38)*30-.5, (61-lat)*30-.5
        inside = (px>=0) & (px<cover.shape[1]-1) & (py>=0) & (py<cover.shape[0]-1)
        px, py = np.clip(px,0,cover.shape[1]-1.01),np.clip(py,0,cover.shape[0]-1.01)
        ix, iy = px.astype(np.int32), py.astype(np.int32)
        fx, fy = (px-ix)[...,None], (py-iy)[...,None]
        top_colors = cover[iy,ix]*(1-fx) + cover[iy,ix+1]*fx
        bottom_colors = cover[iy+1,ix]*(1-fx) + cover[iy+1,ix+1]*fx
        surface[row:row+len(batch_y)] = np.where(inside[...,None],
                                                top_colors*(1-fy)+bottom_colors*fy,
                                                np.append(LAND_COLORS[2],0))

    rng = np.random.default_rng(6718)
    def cloud(step, vertical=None):
        small = rng.integers(0, 255, (height//(vertical or step)+2,width//step+2), dtype=np.uint8)
        return np.asarray(Image.fromarray(small).resize((width,height),Image.Resampling.BICUBIC), dtype=np.float32)/255-.5

    region, mottling = cloud(95), cloud(24)
    brush = cloud(6)
    grain = rng.uniform(-.5, .5, (height, width)).astype(np.float32)
    dy, dx = np.gradient(z / ((w / width) / scale))
    # Northwest light on the exaggerated elevation surface, with a low-contrast ambient component.
    dx *= 5.7
    dy *= 5.7
    slope = np.hypot(dx, dy)
    light = (.74 + .57*dx + .42*dy) / np.sqrt(1 + slope*slope)
    shade = np.clip((light-.74)*.77, -.43, .35)
    rugged = np.clip((z-1050+region*480)/2080+slope*.135, 0, .92)
    snow = np.clip((z-2900+mottling*400+region*440)/1110-slope*.16, 0, .96)
    # Warm exposed stone and cool shadows keep ridges legible in the sculpted palette.
    rgb = surface[..., :3]*(1-rugged[..., None]) + np.array([165, 145, 114])*rugged[..., None]
    rgb = rgb*(1-snow[..., None]) + np.array([234, 232, 212])*snow[..., None]
    rgb *= (1 + shade)[..., None]
    rgb += np.maximum(-shade, 0)[..., None]*np.array([-13, 4, 17])
    land_texture = region*26 + mottling*19 + brush*15 + grain*8
    rgb += land_texture[..., None]
    water = surface[...,3] / 255
    wet = np.clip((water-.38)/.27, 0, 1)
    shallows = np.clip((1-water)*3.3, 0, 1)
    water_color = LAND_COLORS[WATER] + shallows[..., None]*np.array([25, 41, 28])
    waves = np.sin(np.arange(height)[:, None]*1.6 + mottling*6.5)*1.25
    water_color += (region*13 + mottling*9 + brush*5 + waves)[..., None]
    rgb = rgb*(1-wet[..., None]) + water_color*wet[..., None]
    save_relief(rgb, outside, alpha, (17,44,51), .25, 'terrain-relief.webp', 83)
    winter_rgb = winter_surface(surface, z, shade, slope, region, mottling, brush, cloud(27,10), grain, wet, shallows)
    save_relief(winter_rgb, outside, alpha, (28,49,73), .58, 'winter-relief.webp', 81)
    (ROOT/'data'/'terrain-relief.json').write_text(json.dumps(dict(bounds=AREA, edgeFade=EDGE_FADE))+'\n')
    print(f'Rendered {width}×{height} terrain and winter relief')


if __name__ == '__main__':
    render()
