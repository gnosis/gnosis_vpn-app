#!/usr/bin/env python3
# Generates src/assets/map/: country outlines pre-projected to Mercator, plus a per-country
# bounding box and marker point. Source is Natural Earth (public domain). Commit what it writes.
#
# Pre-projecting at build time is what lets the app carry no map library: the runtime only
# needs the same 5-line Mercator formula (src/utils/mercator.ts) to place a point, and an SVG
# viewBox to zoom.
import argparse
import json
import math
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "src/assets/map"

SOURCE = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
    "ne_110m_admin_0_countries.geojson"
)
# The 110m tier is indistinguishable from 50m at the size the app draws (~328x132 CSS px)
# while being an order of magnitude smaller: ~143 KB of path data against ~1.3 MB.
RESOLUTION = "110m"

# The projected world is MAP_SIZE x MAP_SIZE; keep in step with src/utils/mercator.ts.
MAP_SIZE = 1000.0
# Web Mercator's usual cutoff - the poles are at infinity.
MAX_LAT = 85.05
# Two decimals is ~0.1 px at the zoom a single country gets, and trims ~15% off the payload.
PRECISION = 2

UA = "gnosis-vpn-app map generator (https://github.com/gnosis/gnosis_vpn-app)"


def project(lon: float, lat: float) -> tuple[float, float]:
    """Web Mercator. Mirrors project() in src/utils/mercator.ts - keep the two in step."""
    lat = max(-MAX_LAT, min(MAX_LAT, lat))
    x = (lon + 180.0) / 360.0 * MAP_SIZE
    y = (1.0 - math.log(math.tan(math.pi / 4.0 + math.radians(lat) / 2.0)) / math.pi) / 2.0
    return x, y * MAP_SIZE


def ring_path(ring: list) -> str:
    points, last = [], None
    for lon, lat in ring:
        point = tuple(round(v, PRECISION) for v in project(lon, lat))
        # Rounding collapses neighbours; dropping them costs nothing and shrinks the payload.
        if point != last:
            points.append(point)
            last = point
    if len(points) < 3:
        return ""
    return "M" + "L".join(f"{x},{y}" for x, y in points) + "Z"


def polygons(geometry: dict) -> list:
    if not geometry:
        return []
    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"]
    return [geometry["coordinates"]]


def largest(polys: list) -> list:
    """The mainland ring.

    Natural Earth splits geometry at the antimeridian, so a union bounding box spans the whole
    globe for Fiji, Russia and Antarctica. Taking the biggest piece keeps Fiji's zoom at 1.4
    degrees instead of 360, and stops Alaska and Hawaii dragging the US view out to the Pacific.
    """
    return max(polys, key=lambda poly: len(poly[0]))[0]


def area_centroid(ring: list) -> tuple[float, float]:
    """Area-weighted centroid of a projected ring, via the shoelace formula."""
    twice_area = cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        cross = x0 * y1 - x1 * y0
        twice_area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(twice_area) < 1e-9:
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        return (min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0
    return cx / (3.0 * twice_area), cy / (3.0 * twice_area)


def inside(ring: list, x: float, y: float) -> bool:
    """Even-odd ray cast."""
    hit = False
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
            hit = not hit
    return hit


def marker(ring: list) -> tuple[float, float]:
    """A point to drop the marker on, guaranteed inside the landmass.

    The area centroid falls in the sea for a crescent like Croatia, so when it does, take the
    midpoint of the widest span the country covers on that latitude instead.
    """
    x, y = area_centroid(ring)
    if inside(ring, x, y):
        return x, y
    crossings = []
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        if (y0 > y) != (y1 > y):
            crossings.append((x1 - x0) * (y - y0) / (y1 - y0) + x0)
    crossings.sort()
    if len(crossings) < 2:
        return x, y
    # Interior runs are the even-indexed gaps between sorted crossings.
    widest = max(
        (crossings[i : i + 2] for i in range(0, len(crossings) - 1, 2)),
        key=lambda pair: pair[1] - pair[0],
    )
    return (widest[0] + widest[1]) / 2.0, y


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=SOURCE, help="GeoJSON URL or local path")
    args = parser.parse_args()

    if args.source.startswith("http"):
        request = urllib.request.Request(args.source, headers={"User-Agent": UA})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = json.loads(response.read())
    else:
        data = json.loads(Path(args.source).read_text())

    paths: dict[str, str] = {}
    regions: dict[str, dict] = {}
    skipped = []

    for feature in data["features"]:
        props = feature["properties"]
        # ISO_A2 is "-99" for disputed and some dependent territories; ISO_A2_EH resolves most.
        code = (props.get("ISO_A2_EH") or props.get("ISO_A2") or "").strip().lower()
        if not code or code == "-99" or len(code) != 2:
            skipped.append(props.get("ADMIN", "?"))
            continue

        polys = polygons(feature["geometry"])
        if not polys:
            skipped.append(props.get("ADMIN", "?"))
            continue

        drawn = "".join(ring_path(ring) for poly in polys for ring in poly)
        if not drawn:
            skipped.append(props.get("ADMIN", "?"))
            continue
        paths[code] = paths.get(code, "") + drawn

        mainland = [project(lon, lat) for lon, lat in largest(polys)]
        xs, ys = [p[0] for p in mainland], [p[1] for p in mainland]
        mx, my = marker(mainland)
        regions[code] = {
            # NAME is Natural Earth's short display form; ADMIN spells out the formal name,
            # which is too long for a one-line label ("United States of America").
            "name": props.get("NAME") or props.get("ADMIN") or code.upper(),
            "bbox": [round(v, PRECISION) for v in (min(xs), min(ys), max(xs), max(ys))],
            "point": [round(mx, PRECISION), round(my, PRECISION)],
        }

    OUT.mkdir(parents=True, exist_ok=True)
    header = (
        "// Generated by scripts/generate-map.py from Natural Earth "
        f"{RESOLUTION} admin-0 -- do not edit.\n"
        "// See NOTICE.md for attribution.\n"
    )

    entries = "\n".join(f'  {code}: "{d}",' for code, d in sorted(paths.items()))
    (OUT / "world.ts").write_text(
        f"{header}\n"
        "/// Country outlines, pre-projected to Web Mercator in a "
        f"{int(MAP_SIZE)}x{int(MAP_SIZE)} space.\n"
        "export const WORLD_PATHS: Readonly<Record<string, string>> = {\n"
        f"{entries}\n}};\n"
    )

    lines = []
    for code, region in sorted(regions.items()):
        bbox = ", ".join(str(v) for v in region["bbox"])
        point = ", ".join(str(v) for v in region["point"])
        name = region["name"].replace('\\', '\\\\').replace('"', '\\"')
        lines.append(f'  {code}: {{ name: "{name}", bbox: [{bbox}], point: [{point}] }},')
    joined = "\n".join(lines)
    (OUT / "regions.ts").write_text(
        f"{header}\n"
        "export interface Region {\n"
        "  /// Short English name, for a one-line label.\n"
        "  readonly name: string;\n"
        "  /// [minX, minY, maxX, maxY] in Mercator units, from the mainland only.\n"
        "  readonly bbox: readonly [number, number, number, number];\n"
        "  /// Where to drop a country-level marker; always on land.\n"
        "  readonly point: readonly [number, number];\n"
        "}\n\n"
        "/// Keyed by ISO 3166-1 alpha-2, lowercased - the same codes Flag.tsx uses.\n"
        "export const REGIONS: Readonly<Record<string, Region>> = {\n"
        f"{joined}\n}};\n"
    )

    (OUT / "NOTICE.md").write_text(
        "# Map data attribution\n\n"
        "Generated by `scripts/generate-map.py` -- do not edit.\n\n"
        f"Country outlines come from [Natural Earth]({SOURCE}) ({RESOLUTION} admin-0), "
        "released into the **public domain**. Natural Earth asks for no permission and no "
        "attribution, but credits its contributors at <https://www.naturalearthdata.com/about/>.\n\n"
        f"Coordinates are pre-projected to Web Mercator in a {int(MAP_SIZE)}x{int(MAP_SIZE)} "
        f"space, latitude clamped to +/-{MAX_LAT} degrees.\n"
    )

    size = (OUT / "world.ts").stat().st_size / 1024
    print(f"{len(paths)} countries, world.ts {size:.0f} KB")
    if skipped:
        print(f"skipped {len(skipped)} without a usable ISO code: {', '.join(sorted(skipped))}")


if __name__ == "__main__":
    main()
