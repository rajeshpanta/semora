"""Check built HTML, or a deployed origin: python3 scripts/check-seo.py [URL]."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse, urljoin
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor
import json, sys, xml.etree.ElementTree as ET
origin = sys.argv[1].rstrip('/') if len(sys.argv)>1 else None

def fetch(path):
    if origin:
        with urlopen(Request(origin+path, headers={'User-Agent':'SemoraSEOCheck/1.0'}),timeout=30) as r:
            assert r.status==200 and urlparse(r.url).path.rstrip('/')==path.rstrip('/'), (path,'status/redirect')
            assert 'noindex' not in r.headers.get('X-Robots-Tag',''), (path,'header noindex')
            return r.read().decode()
    name='sitemap.xml.body' if path=='/sitemap.xml' else (path.strip('/') or 'index')+'.html'
    return (Path('.next/server/app')/name).read_text()

class Page(HTMLParser):
    def __init__(self,html):
        super().__init__(); self.title=''; self.description=''; self.canonical=[]; self.alternates={}
        self.h1=0; self.noindex=False; self.links=[]; self.images=[]; self.intitle=False; self.js=None
        self.feed(html)
    def handle_starttag(self,t,attrs):
        a=dict(attrs)
        if t=='title': self.intitle=True
        if t=='h1': self.h1+=1
        if t=='meta' and a.get('name')=='description': self.description=a.get('content','')
        if t=='meta' and a.get('name')=='robots': self.noindex='noindex' in a.get('content','')
        if t=='link' and a.get('rel')=='canonical': self.canonical.append(a.get('href'))
        if t=='link' and a.get('rel')=='alternate' and a.get('hreflang'): self.alternates[a['hreflang']]=a['href']
        if t=='a' and a.get('href'): self.links.append(a['href'])
        if t=='img': self.images.append(a)
        if t=='script' and a.get('type')=='application/ld+json': self.js=''
    def handle_data(self,s):
        if self.intitle: self.title+=s
        if self.js is not None: self.js+=s
    def handle_endtag(self,t):
        if t=='title': self.intitle=False
        if t=='script' and self.js is not None: json.loads(self.js); self.js=None

entries=ET.fromstring(fetch('/sitemap.xml')).findall('{*}url')
urls=[e.find('{*}loc').text for e in entries]
assert len(urls)==len(set(urls)), 'Duplicate sitemap URLs'
paths=[urlparse(u).path or '/' for u in urls]
with ThreadPoolExecutor(max_workers=5) as pool: pages=dict(zip(paths,pool.map(lambda p:Page(fetch(p)),paths)))
titles=set(); descriptions=set(); incoming={p:set() for p in paths}
for entry,url,path in zip(entries,urls,paths):
    p=pages[path]
    assert p.title and p.description, (path,'missing metadata')
    assert p.title not in titles and p.description not in descriptions, (path,'duplicate metadata')
    titles.add(p.title); descriptions.add(p.description)
    assert p.h1==1 and not p.noindex, (path,'heading/indexability')
    assert len(p.canonical)==1 and p.canonical[0].rstrip('/')==url.rstrip('/'), (path,'canonical')
    expected={l.attrib['hreflang']:l.attrib['href'] for l in entry.findall('{*}link')}
    assert p.alternates==expected, (path,'HTML/sitemap alternates differ',p.alternates,expected)
    for target in p.alternates.values():
        targetpath=urlparse(target).path or '/'
        assert targetpath in pages, (path,'alternate outside sitemap',target)
        assert url.rstrip('/') in [u.rstrip('/') for u in pages[targetpath].alternates.values()], (path,'nonreciprocal alternate')
    for href in p.links:
        target=urlparse(urljoin(url,href)); dest=target.path or '/'
        if target.netloc==urlparse(url).netloc and dest in incoming: incoming[dest].add(path)
    assert all('alt' in i for i in p.images), (path,'missing image alt')
assert all(sources-{path} for path,sources in incoming.items()), 'Orphaned sitemap page'
assert not any('/es/blog/calcular-gpa-ponderado' in h for h in pages['/es/blog'].links), 'Retired Spanish blog link'
for path in ['/ai-syllabus-scanner','/canvas-deadline-tracker','/es/escaner-de-programa-de-estudios','/es/seguimiento-de-fechas-de-canvas']:
    assert pages[path].images, (path,'missing product preview')
print(f'PASS: {len(pages)} pages; unique metadata, headings, canonicals, indexability, reciprocal HTML/sitemap alternates, internal discovery, image alt attributes, JSON-LD parsing and landing previews.')
