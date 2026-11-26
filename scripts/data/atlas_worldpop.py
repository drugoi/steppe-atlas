"""Aggregate WorldPop counts onto the atlas's existing pointy-topped hex grid."""
import math

import numpy as np
from pyproj import Geod
import rasterio
from rasterio.windows import Window


def hex_indices(x, y, radius):
    """Return the offset row and column for each point via axial rounding."""
    r = y / (1.5 * radius)
    q = x / (math.sqrt(3) * radius) - r / 2
    t = -q - r
    qi, ri, ti = (np.rint(value).astype(np.int32) for value in (q, r, t))
    dq, dr, dt = abs(qi - q), abs(ri - r), abs(ti - t)
    fix_q = (dq > dr) & (dq > dt)
    fix_r = ~fix_q & (dr > dt)
    qi[fix_q] = -ri[fix_q] - ti[fix_q]
    ri[fix_r] = -qi[fix_r] - ti[fix_r]
    return ri, qi + ri // 2


def build_worldpop(raster_path, tiles, radius, scale, left, top, projection, inverse):
    centers = np.asarray([tile[:2] for tile in tiles])
    rows, columns = hex_indices(*centers.T, radius)
    rmin, cmin = rows.min(), columns.min()
    grid = np.full((rows.max() - rmin + 1, columns.max() - cmin + 1), -1, dtype=np.int32)
    grid[rows - rmin, columns - cmin] = np.arange(len(tiles))
    assert np.count_nonzero(grid >= 0) == len(tiles)

    totals = np.zeros(len(tiles))
    cells = np.zeros(len(tiles), dtype=np.int64)
    source_total = 0.0
    with rasterio.open(raster_path) as raster:
        affine = raster.transform
        assert raster.crs.to_epsg() == 4326 and affine.b == affine.d == 0
        assert abs(affine.a - 1 / 120) < 1e-8 and abs(affine.e + 1 / 120) < 1e-8
        for start in range(0, raster.height, 256):
            height = min(256, raster.height - start)
            block = raster.read(1, window=Window(0, start, raster.width, height), masked=True)
            valid = ~np.ma.getmaskarray(block) & np.isfinite(block.data) & (block.data >= 0)
            ypx, xpx = np.nonzero(valid)
            population = block.data[valid]
            source_total += population.sum(dtype=np.float64)
            lon = affine.c + (xpx + 0.5) * affine.a
            lat = affine.f + (ypx + start + 0.5) * affine.e
            mx, my = projection.transform(lon, lat)
            r, c = hex_indices((mx - left) * scale, (top - my) * scale, radius)
            r, c = r - rmin, c - cmin
            assert ((r >= 0) & (r < grid.shape[0]) & (c >= 0) & (c < grid.shape[1])).all()
            ids = grid[r, c]
            assert (ids >= 0).all(), 'A WorldPop pixel fell outside the atlas grid'
            totals += np.bincount(ids, weights=population, minlength=len(tiles))
            cells += np.bincount(ids, minlength=len(tiles))

    assert math.isclose(totals.sum(), source_total, abs_tol=0.001)
    geod = Geod(ellps='WGS84')
    angles = np.pi / 6 + np.arange(6) * np.pi / 3
    offsets = radius * np.stack((np.cos(angles), np.sin(angles)), axis=-1)
    exact_centers = radius * np.stack((math.sqrt(3) * (columns + (rows % 2) / 2), 1.5 * rows), axis=-1)
    polygons = exact_centers[cells > 0, None, :] + offsets
    lon, lat = inverse.transform((polygons[..., 0] / scale + left).ravel(),
                                 (top - polygons[..., 1] / scale).ravel())
    areas = [abs(geod.polygon_area_perimeter(xs, ys)[0]) / 1e6
             for xs, ys in zip(lon.reshape(-1, 6), lat.reshape(-1, 6), strict=True)]
    hexes = [None] * len(tiles)
    for index, area in zip(np.flatnonzero(cells), areas, strict=True):
        hexes[index] = [round(float(totals[index]), 6), round(area, 3)]

    print(f'WorldPop 2025: {cells.sum():,} valid pixels, {len(areas):,} hexes, {source_total:,.3f} people')
    return dict(year=2025, release='R2025A v1', hexes=hexes)
