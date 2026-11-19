"""Fetch one openly licensed photo per plant, crop and lawn problem.

For each entry this takes the lead image of the matching Wikipedia article, keeps it
only if its license is CC0, public domain, CC BY or CC BY-SA, saves a 480 px copy to
assets/photos, and records the author, license and source page in data/photos.json
for the credit line. It is resumable: entries already in data/photos.json are skipped.

Run from anywhere:  python3 tools/fetch-photos.py
Check every image by eye before publishing; a lead image is not always a good
identification photo.
"""
import json, os, re, sys, time, html, urllib.parse, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets/photos')
os.makedirs(OUT, exist_ok=True)
UA = {'User-Agent': 'AlmanacPhotoCredits/1.0 (static site build; one-off fetch)'}
API = 'https://en.wikipedia.org/w/api.php?'

def get(url, binary=False, tries=3):
    for i in range(tries):
        try:
            time.sleep(2.5)
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                data = r.read()
                return data if binary else json.loads(data)
        except urllib.error.HTTPError as e:
            err = e
            wait = int(e.headers.get('Retry-After') or 0) or 20 * (i + 1)
            time.sleep(min(wait, 90))
        except Exception as e:
            err = e
            time.sleep(10)
    raise err

CROPS = {'Tomato': 'Tomato', 'Bell & sweet peppers': 'Bell pepper', 'Jalapeños & hot peppers': 'Jalapeño', 'Eggplant': 'Eggplant',
 'Potato': 'Potato', 'Peas': 'Pea', 'Green beans (bush)': 'Green bean', 'Pole beans': 'Phaseolus vulgaris', 'Southern peas (cowpeas)': 'Cowpea',
 'Sweet corn': 'Sweet corn', 'Cucumber': 'Cucumber', 'Zucchini & summer squash': 'Zucchini', 'Winter squash': 'Butternut squash', 'Pumpkin': 'Pumpkin',
 'Watermelon': 'Watermelon', 'Cantaloupe (muskmelon)': 'Cantaloupe', 'Okra': 'Okra', 'Sweet potato': 'Sweet potato', 'Onion': 'Onion', 'Garlic': 'Garlic',
 'Lettuce': 'Lettuce', 'Spinach': 'Spinach', 'Swiss chard': 'Chard', 'Carrot': 'Carrot', 'Beet': 'Beetroot', 'Radish': 'Radish', 'Turnip': 'Turnip',
 'Kohlrabi': 'Kohlrabi', 'Broccoli': 'Broccoli', 'Cabbage': 'Cabbage', 'Cauliflower': 'Cauliflower', 'Brussels sprouts': 'Brussels sprout',
 'Kale & collards': 'Kale', 'Asparagus': 'Asparagus', 'Rhubarb': 'Rhubarb', 'Strawberries': 'Strawberry', 'Blackberries (thornless)': 'Blackberry',
 'Basil': 'Basil', 'Cilantro & dill': 'Coriander', 'Parsley': 'Parsley', 'Perennial herbs': 'Thyme'}
ISSUES = {'crabgrass': 'Digitaria sanguinalis', 'nutsedge': 'Cyperus esculentus', 'dandelion': 'Taraxacum officinale', 'clover': 'Trifolium repens',
 'henbit': 'Lamium amplexicaule', 'chickweed': 'Stellaria media', 'ground-ivy': 'Glechoma hederacea', 'wild-violet': 'Viola sororia',
 'nimblewill': 'Muhlenbergia schreberi', 'bermudagrass': 'Cynodon dactylon', 'zoysia': 'Zoysia japonica', 'wild-onion': 'Allium vineale',
 'spurge': 'Euphorbia maculata', 'plantain': 'Plantago major', 'oxalis': 'Oxalis stricta', 'poa-annua': 'Poa annua', 'brown-patch': 'Brown patch',
 'dollar-spot': 'Dollar spot', 'red-thread': 'Red thread disease', 'fairy-ring': 'Fairy ring', 'armyworm': 'Fall armyworm',
 'cicada-killer': 'Sphecius speciosus', 'moles': 'Eastern mole', 'voles': 'Meadow vole', 'rabbits': 'Eastern cottontail',
 'chinch-bugs': 'Blissus insularis', 'mole-crickets': 'Mole cricket'}
PLANT_FIX = {'Rosa hybrids': 'Garden roses', 'Hemerocallis hybrids': 'Daylily', 'Hosta hybrids': 'Hosta', "Hylotelephium 'Herbstfreude'": 'Hylotelephium telephium',
 'Salvia yangii (Perovskia)': 'Salvia yangii'}

jobs = []
for p in json.load(open(f'{ROOT}/data/plants.json')):
    jobs.append((f"plant-{p['id']}", PLANT_FIX.get(p['latin'], p['latin'])))
for c in json.load(open(f'{ROOT}/data/crops.json')):
    if c['name'] in CROPS: jobs.append((f"crop-{c['id']}", CROPS[c['name']]))
for k, v in ISSUES.items():
    jobs.append((f'issue-{k}', v))

OK = re.compile(r'^(CC0|CC BY(-SA)?( \d\.\d)?( [a-z]{2,4})?|Public domain|PD)\b', re.I)
strip = lambda s: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s or ''))).strip()
RAW = os.path.join(ROOT, 'data/photos.json')
res = json.load(open(RAW)) if os.path.exists(RAW) else {}
skipped = []
for key, title in jobs:
    if key in res: continue
    try:
        q = get(API + urllib.parse.urlencode({'action': 'query', 'titles': title, 'redirects': 1, 'prop': 'pageimages', 'piprop': 'name', 'pilicense': 'free', 'format': 'json'}))
        page = next(iter(q['query']['pages'].values()))
        name = page.get('pageimage')
        if not name: skipped.append((key, title, 'no free lead image')); continue
        if not re.search(r'\.(jpe?g|png)$', name, re.I): skipped.append((key, title, 'not a photo: ' + name)); continue
        info = get(API + urllib.parse.urlencode({'action': 'query', 'titles': 'File:' + name, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 480, 'format': 'json'}))
        ii = next(iter(info['query']['pages'].values()))['imageinfo'][0]
        md = ii.get('extmetadata', {})
        lic = strip(md.get('LicenseShortName', {}).get('value'))
        if not OK.match(lic): skipped.append((key, title, 'license: ' + lic)); continue
        artist = strip(md.get('Artist', {}).get('value'))[:80] or 'Unknown author'
        img = get(ii['thumburl'], binary=True)
        fn = key + '.jpg'
        open(os.path.join(OUT, fn), 'wb').write(img)
        res[key] = {'file': fn, 'article': page['title'], 'by': artist, 'license': lic, 'source': ii['descriptionurl'], 'licenseUrl': strip(md.get('LicenseUrl', {}).get('value'))}
        json.dump(res, open(RAW, 'w'), indent=1, ensure_ascii=False)
        print('ok', key, flush=True)
    except Exception as e:
        skipped.append((key, title, 'error: ' + str(e)[:80]))
        print('fail', key, str(e)[:60], flush=True)
json.dump(res, open(RAW, 'w'), indent=1, ensure_ascii=False)
print(len(res), 'fetched;', len(skipped), 'skipped')
for s in skipped: print('  skip', s)
