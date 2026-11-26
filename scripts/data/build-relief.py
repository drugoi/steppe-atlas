"""Render a shaded, georeferenced base texture for the atlas's Terrain layer."""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from pyproj import CRS, Transformer
from shapely import transform
from shapely.geometry import shape

from download import CACHE, RELIEF_TILES

ROOT = Path(__file__).resolve().parents[2]
AREA = (-210, -215, 1540, 1060)
PIXELS_PER_UNIT = 1.8
PROJECTION = CRS.from_proj4('+proj=lcc +lat_1=43 +lat_2=53 +lat_0=48 +lon_0=67 +datum=WGS84 +units=m')
# The first palette is the WMS legend. The second is the atlas's terrestrial palette.
WORLD_COVER = np.array([
    (0, 100, 0), (255, 187, 34), (255, 255, 76), (240, 150, 255), (250, 0, 0),
    (180, 180, 180), (240, 240, 240), (0, 100, 200), (0, 150, 160), (0, 207, 117), (250, 230, 160),
], dtype=np.int32)
LAND_COLORS = np.array([
    (64, 102, 70), (143, 130, 82), (111, 129, 77), (145, 147, 82), (151, 131, 105),
    (170, 143, 102), (219, 216, 197), (44, 100, 115), (83, 125, 104), (70, 116, 88), (149, 142, 109),
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
    coast_land = LAND_COLORS.copy()
    coast_land[WATER] = LAND_COLORS[2]
    land = Image.fromarray(coast_land[classes].astype(np.uint8)).filter(ImageFilter.GaussianBlur(.95))
    water = Image.fromarray(np.uint8(classes == WATER)*255).filter(ImageFilter.GaussianBlur(.47))
    return np.dstack((np.asarray(land),np.asarray(water)))


def render():
    forward = Transformer.from_crs(4326, PROJECTION, always_xy=True)
    inverse = Transformer.from_crs(PROJECTION, 4326, always_xy=True)
    boundary = shape(json.loads((CACHE / 'country.geojson').read_text())['features'][0]['geometry'])
    west, _, east, north = transform(boundary, forward.transform, interleaved=False).bounds
    atlas_width = json.loads((ROOT / 'data' / 'atlas-data.json').read_text())['width']
    scale = atlas_width / (east - west)
    left, top, w, h = AREA
    width, height = round(w * PIXELS_PER_UNIT), round(h * PIXELS_PER_UNIT)
    x = west + (left + (np.arange(width)+.5)*w/width)/scale
    y = north - (top + (np.arange(height)+.5)*h/height)/scale
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
    def cloud(step):
        small = rng.integers(0, 255, (height//step+2,width//step+2), dtype=np.uint8)
        return np.asarray(Image.fromarray(small).resize((width,height),Image.Resampling.BICUBIC), dtype=np.float32)/255-.5

    region, texture = cloud(115), cloud(14)
    grain = rng.uniform(-.5,.5,(height,width)).astype(np.float32)
    dy, dx = np.gradient(z / ((w / width) / scale))
    # Northwest light on the exaggerated elevation surface, with a low-contrast ambient component.
    dx *= 5.0
    dy *= 5.0
    slope = np.hypot(dx,dy)
    normal_light = (.78 + .5*dx + .36*dy)/np.sqrt(1+slope*slope)
    relief = np.clip((normal_light-.78)*.57,-.40,.30)
    rugged = np.clip((z-1100+region*440)/2200+slope*.13,0,.93)
    snow = np.clip((z-3050+region*680)/1550-slope*.14,0,.90)
    # A warm altitude tint and cool shaded relief leave different rock faces legible.
    rgb = surface[...,:3]
    rgb = rgb*(1-rugged[...,None]) + np.array([163,151,124],dtype=np.float32)*rugged[...,None]
    rgb = rgb*(1-snow[...,None]) + np.array([237,231,209],dtype=np.float32)*snow[...,None]
    variation = region*21 + texture*12 + grain*4
    rgb *= (1 + relief)[...,None]
    rgb += variation[...,None]
    water = surface[...,3] / 255
    wet = np.clip((water-.40)/.28,0,1)
    shallows = np.clip((.98-water)*29,0,12)
    water_color = LAND_COLORS[WATER] + (shallows+region*13+texture*6+grain*3)[...,None]
    rgb = rgb*(1-wet[...,None]) + water_color*wet[...,None]
    image = Image.fromarray(np.clip(rgb,0,255).astype(np.uint8))
    image.save(ROOT/'src'/'assets'/'terrain-relief.webp',quality=83,method=6)
    (ROOT/'data'/'terrain-relief.json').write_text(json.dumps(dict(bounds=AREA))+'\n')
    print(f'Rendered {width}×{height} terrain relief')


if __name__ == '__main__':
    render()
