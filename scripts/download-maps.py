"""Snapshot the image URLs used by Elektronixx's original viewer."""
import json, urllib.request, concurrent.futures
from pathlib import Path
from PIL import Image
source = json.loads(Path('data/map-sources.json').read_text())
out = Path('public/maps'); out.mkdir(parents=True, exist_ok=True)
def fetch(task):
    slug, mode, url = task
    path = out / f'{slug}-{mode}.jpg'
    if not path.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(request, timeout=90) as response: path.write_bytes(response.read())
    with Image.open(path) as image: width, height = image.size
    return slug, mode, dict(src='/'+str(path.relative_to('public')), width=width, height=height, source=url)
manifest = {}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for slug, mode, entry in pool.map(fetch, [(s,m,u) for s, modes in source.items() for m,u in modes.items()]):
        manifest.setdefault(slug, {})[mode] = entry
        print(slug, mode, flush=True)
# Keep the source overview, whose hotspots are preserved in data/world.json.
world_path = out / 'world-overview.png'
world_url = 'https://elektronixx.github.io/TLD-Interactive-Map/assets/img/homemap.png'
if not world_path.exists():
    with urllib.request.urlopen(world_url, timeout=90) as response:
        world_path.write_bytes(response.read())
with Image.open(world_path) as image:
    width, height = image.size
world_asset = dict(src='/maps/world-overview.png', width=width, height=height, source=world_url)
manifest['game-world'] = {mode: world_asset for mode in ['pilgrim', 'interloper']}
Path('data/maps.json').write_text(json.dumps(manifest, indent=2))
