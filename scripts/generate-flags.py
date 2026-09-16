#!/usr/bin/env python3
# Generates src/assets/flags/: countries from flag-icons, ISO 3166-2
# subdivisions from Wikimedia Commons via Wikidata. Commit what it writes.
# Requires cwebp, rsvg-convert and magick (on the devShell PATH on Linux).
import argparse
import concurrent.futures
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "src/assets/flags"
COUNTRY_SRC = REPO / "node_modules/flag-icons/flags/4x3"
COUNTRY_META = REPO / "node_modules/flag-icons/country.json"

# The UI paints flags in a 28x20 CSS px span (Flag.tsx), so 2x is 56x40.
RASTER_W, RASTER_H = 56, 40
# Vite inlines assets under this into the CSS; SVGs that fit stay vector.
INLINE_LIMIT = 4096

SNIFF = {b"\x89PNG": "png", b"GIF8": "gif", b"\xff\xd8\xff": "jpeg"}

UA = "gnosis-vpn-app flag generator (https://github.com/gnosis/gnosis_vpn-app)"

# Wikimedia license tags we can redistribute in a bundled app.
ALLOWED_LICENSE = re.compile(
    r"^(public domain|cc0|cc by(-sa)? \d|attribution|fal|gfdl|copyrighted free use)",
    re.I,
)
# Wikidata links speculative art for subdivisions that have no real flag.
UNOFFICIAL = re.compile(r"hypothetical|proposed|unofficial", re.I)


def fetch(url: str, timeout: int = 30) -> bytes:
    """Retry with bounded backoff; Wikimedia throttles hard and sockets hang."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    backoff = 2.0
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503) or attempt == 5:
                raise
            time.sleep(min(float(e.headers.get("Retry-After") or backoff), 20))
            backoff = min(backoff * 2, 20)
        except Exception:
            if attempt == 5:
                raise
            time.sleep(backoff)
            backoff = min(backoff * 2, 20)
    raise RuntimeError("unreachable")


def fetch_subdivision_files() -> dict[str, str]:
    """ISO 3166-2 code (P300) -> Commons flag filename (P41)."""
    query = "SELECT ?code ?flag WHERE { ?item wdt:P300 ?code; wdt:P41 ?flag. }"
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode(
        {"query": query, "format": "json"}
    )
    out: dict[str, str] = {}
    for b in json.loads(fetch(url))["results"]["bindings"]:
        code = b["code"]["value"].lower()
        name = urllib.parse.unquote(b["flag"]["value"].rsplit("/", 1)[-1])
        # A subdivision can carry several flags; keep the first deterministically.
        if code not in out or name < out[code]:
            out[code] = name
    return out


def fetch_file_info(files: list[str]) -> dict[str, dict]:
    """Commons filename -> licence, author, size, URLs, and a 2x thumbnail."""
    out: dict[str, dict] = {}
    for i in range(0, len(files), 50):
        batch = files[i : i + 50]
        url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(
            {
                "action": "query",
                "format": "json",
                "prop": "imageinfo",
                "iiprop": "extmetadata|url|size|mime",
                "iiurlwidth": RASTER_W,
                "titles": "|".join("File:" + n for n in batch),
            }
        )
        try:
            pages = json.loads(fetch(url, timeout=60))["query"]["pages"]
        except Exception as e:
            print(f"  ! info lookup failed for batch {i}: {e}", file=sys.stderr)
            continue
        for page in pages.values():
            info = page.get("imageinfo")
            if not info:
                continue
            meta = info[0].get("extmetadata", {})
            artist = re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", ""))
            out[page["title"].removeprefix("File:")] = {
                "license": meta.get("LicenseShortName", {}).get("value", ""),
                "artist": " ".join(artist.split())[:80],
                "size": info[0].get("size", 0),
                "mime": info[0].get("mime", ""),
                "url": info[0].get("url", ""),
                "thumb": info[0].get("thumburl", ""),
            }
        print(f"  {min(i + 50, len(files))}/{len(files)}", end="\r", flush=True)
    print()
    return out


def cached(url: str, cache: Path) -> bytes | None:
    dest = cache / re.sub(r"[^\w.-]", "_", url.rsplit("/", 2)[-1])[:120]
    if dest.exists():
        return dest.read_bytes()
    try:
        data = fetch(url)
    except Exception as e:
        print(f"  ! download {url}: {e}", file=sys.stderr)
        return None
    dest.write_bytes(data)
    return data


def optimize_svg(data: bytes) -> bytes:
    """Strip the parts of a Commons SVG that never affect rendering."""
    text = data.decode("utf-8", "replace")
    text = re.sub(r"<\?xml.*?\?>", "", text, flags=re.S)
    text = re.sub(r"<!DOCTYPE.*?>", "", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<metadata\b.*?</metadata>", "", text, flags=re.S | re.I)
    text = re.sub(r"<sodipodi:namedview\b[^>]*/>", "", text, flags=re.I)
    text = re.sub(r">\s+<", "><", text)
    return text.strip().encode("utf-8")


def to_webp(image: bytes, tmp: Path) -> bytes | None:
    src, dst = tmp / "in.png", tmp / "out.webp"
    dst.unlink(missing_ok=True)
    # ~90 subdivisions are GIF or JPEG on Commons and cwebp only reads PNG.
    fmt = SNIFF.get(image[:4]) or SNIFF.get(image[:3])
    if fmt == "png":
        src.write_bytes(image)
    elif fmt:
        raw = tmp / "in.img"
        raw.write_bytes(image)
        # Format prefix: magick guesses wrong from the extension. [0] = first frame.
        if subprocess.run(["magick", f"{fmt}:{raw}[0]", str(src)],
                          capture_output=True).returncode != 0:
            return None
    else:
        return None
    r = subprocess.run(
        ["cwebp", "-quiet", "-q", "85", str(src), "-o", str(dst)], capture_output=True
    )
    return dst.read_bytes() if r.returncode == 0 and dst.exists() else None


def render_local_svg(code: str, svg: Path, tmp: Path) -> str | None:
    """Country art, already on disk via the flag-icons package."""
    slim = optimize_svg(svg.read_bytes())
    if len(slim) < INLINE_LIMIT:
        (OUT / f"{code}.svg").write_bytes(slim)
        return f"{code}.svg"
    png = tmp / "rast.png"
    png.unlink(missing_ok=True)
    cmd = ["rsvg-convert", "-w", str(RASTER_W), "-h", str(RASTER_H), "-a",
           "--background-color=none", str(svg), "-o", str(png)]
    if subprocess.run(cmd, capture_output=True).returncode != 0 or not png.exists():
        return None
    webp = to_webp(png.read_bytes(), tmp)
    if webp is None:
        return None
    (OUT / f"{code}.webp").write_bytes(webp)
    return f"{code}.webp"


def wants_original(info: dict) -> bool:
    """Under the budget already, so it ships as vector -- trimming only shrinks."""
    return (
        info["mime"] == "image/svg+xml"
        and 0 < info["size"] <= INLINE_LIMIT
        and bool(info["url"])
    )


def render_commons(code: str, info: dict, cache: Path, tmp: Path) -> str | None:
    """Vector when the original is already small, otherwise Commons' thumbnail."""
    if wants_original(info):
        data = cached(info["url"], cache)
        if data:
            (OUT / f"{code}.svg").write_bytes(optimize_svg(data))
            return f"{code}.svg"
    if not info["thumb"]:
        return None
    png = cached(info["thumb"], cache)
    if png is None:
        return None
    webp = to_webp(png, tmp)
    if webp is None:
        return None
    (OUT / f"{code}.webp").write_bytes(webp)
    return f"{code}.webp"


BASE_CSS = """\
/* Generated by scripts/generate-flags.py -- do not edit. */
.fib,
.fi {
  background-size: contain;
  background-position: 50%;
  background-repeat: no-repeat;
}
.fi {
  position: relative;
  display: inline-block;
  width: 1.3333333333em;
  line-height: 1em;
}
.fi:before {
  content: "\\00a0";
}
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--cache",
        type=Path,
        default=Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
        / "gnosis-vpn-flags",
    )
    ap.add_argument("--refresh-metadata", action="store_true",
                    help="re-query Wikidata and Commons instead of reusing the cache")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    tmp = args.cache / "tmp"
    tmp.mkdir(exist_ok=True)

    if not COUNTRY_SRC.is_dir():
        print("flag-icons is not installed; run `deno install` first", file=sys.stderr)
        return 1

    # The API phases take ~10 min; cache them so a rerun only redoes rendering.
    meta_cache = args.cache / "metadata.json"
    if meta_cache.exists() and not args.refresh_metadata:
        print(f"reusing metadata cache ({meta_cache})")
        blob = json.loads(meta_cache.read_text())
        subdivisions, info = blob["subdivisions"], blob["info"]
    else:
        print("querying Wikidata for ISO 3166-2 flags...")
        subdivisions = fetch_subdivision_files()
        subdivisions = {c: f for c, f in subdivisions.items() if not UNOFFICIAL.search(f)}
        print(f"  {len(subdivisions)} subdivision codes with official art")

        print("fetching Commons metadata...")
        info = fetch_file_info(sorted(set(subdivisions.values())))
        meta_cache.write_text(json.dumps({"subdivisions": subdivisions, "info": info}))

    cleared, dropped = {}, []
    for code, name in sorted(subdivisions.items()):
        meta = info.get(name)
        if meta and ALLOWED_LICENSE.match(meta["license"]):
            cleared[code] = (name, meta)
        else:
            dropped.append((code, name, (meta or {}).get("license") or "unknown"))
    print(f"  {len(cleared)} cleared, {len(dropped)} dropped on licence")

    # These come off the CDN, not the rate-limited app server, so fan out.
    urls = []
    for _, m in cleared.values():
        if wants_original(m):
            urls.append(m["url"])
        if m["thumb"]:
            urls.append(m["thumb"])
    urls = list(dict.fromkeys(urls))
    print(f"prefetching {len(urls)} thumbnails...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for n, _ in enumerate(pool.map(lambda u: cached(u, args.cache), urls), 1):
            if n % 250 == 0:
                print(f"  {n}/{len(urls)}", flush=True)

    OUT.mkdir(parents=True, exist_ok=True)
    for stale in list(OUT.glob("*.svg")) + list(OUT.glob("*.webp")):
        stale.unlink()

    rules, codes, notice = [], [], []

    print("rendering countries...")
    names = {c["code"]: c["name"] for c in json.loads(COUNTRY_META.read_text())}
    for svg in sorted(COUNTRY_SRC.glob("*.svg")):
        code = svg.stem
        out_name = render_local_svg(code, svg, tmp)
        if out_name is None:
            print(f"  ! render failed: {code}", file=sys.stderr)
            continue
        rules.append(f'.fi-{code}{{background-image:url("./{out_name}")}}')
        codes.append(code)
        notice.append(
            (code, names.get(code, code), "flag-icons", "MIT", "flag-icons contributors")
        )

    print(f"rendering {len(cleared)} subdivisions...")
    # flag-icons already curates some of these (gb-sct, es-ct, ...); its art wins.
    from_countries = set(codes)
    for n, (code, (name, meta)) in enumerate(sorted(cleared.items()), 1):
        if code in from_countries:
            continue
        out_name = render_commons(code, meta, args.cache, tmp)
        if out_name is None:
            print(f"  ! render failed: {code} ({name})", file=sys.stderr)
            continue
        rules.append(f'.fi-{code}{{background-image:url("./{out_name}")}}')
        codes.append(code)
        notice.append((code, name, "Wikimedia Commons", meta["license"], meta["artist"]))
        if n % 200 == 0:
            print(f"  {n}/{len(cleared)}", flush=True)

    codes.sort()
    (OUT / "flags.css").write_text(BASE_CSS + "\n".join(sorted(rules)) + "\n")
    (OUT / "codes.ts").write_text(
        "// Generated by scripts/generate-flags.py -- do not edit.\n"
        "export const FLAG_CODES: readonly string[] = [\n"
        + "".join(f'  "{c}",\n' for c in codes)
        + "];\n"
    )

    lines = [
        "# Flag art attribution",
        "",
        "Generated by `scripts/generate-flags.py` -- do not edit.",
        "",
        "Country flags come from the [flag-icons](https://github.com/lipis/flag-icons)",
        "package (MIT). Subdivision flags come from Wikimedia Commons; those under a",
        "CC BY or CC BY-SA licence are used here under that licence, credited below.",
        "",
        "| Code | Source file | Origin | Licence | Author |",
        "| --- | --- | --- | --- | --- |",
    ]
    lines += [
        f"| `{c}` | {n} | {o} | {lic} | {a} |" for c, n, o, lic, a in sorted(notice)
    ]
    if dropped:
        lines += ["", "## Omitted (licence not cleared)", ""]
        lines += [f"- `{c}` ({n}) -- {lic}" for c, n, lic in dropped]
    (OUT / "NOTICE.md").write_text("\n".join(lines) + "\n")

    total = sum(f.stat().st_size for f in OUT.iterdir() if f.is_file())
    print(f"\nwrote {len(codes)} flags to {OUT.relative_to(REPO)} ({total / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
