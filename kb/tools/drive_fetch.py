"""Baja recursivamente carpetas de Drive compartidas por link (sin login) a kb/src/.

Uso: python kb/tools/drive_fetch.py <folderId> [<folderId> ...]
Genera kb/src/manifest.json con id, título, ruta de carpeta, tipo y fecha de Drive.
"""
import html, json, os, re, sys, time, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'src')
UA = {'User-Agent': 'Mozilla/5.0'}


def get(url):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read(), r.headers.get('Content-Type', '')
        except Exception as e:  # reintento simple
            err = e
            time.sleep(2 + i * 2)
    raise err


ENTRY = re.compile(r'<div class="flip-entry" id="entry-([^"]+)".*?<a href="([^"]+)".*?flip-entry-title">([^<]*)<.*?flip-entry-last-modified"><div>([^<]*)<', re.S)


def listing(fid):
    body, _ = get(f'https://drive.google.com/embeddedfolderview?id={fid}')
    return [(i, html.unescape(h), html.unescape(t).strip(), m) for i, h, t, m in ENTRY.findall(body.decode('utf-8', 'replace'))]


def safe(s):
    return re.sub(r'[<>:"/\\|?*]+', '_', s).strip(' .') or 'sin_nombre'


def export_url(fid, href):
    if '/drive/folders/' in href:
        return 'folder', None
    if 'docs.google.com/document' in href:
        return 'gdoc', f'https://docs.google.com/document/d/{fid}/export?format=pdf'
    if 'docs.google.com/presentation' in href:
        return 'gslides', f'https://docs.google.com/presentation/d/{fid}/export/pdf'
    if 'docs.google.com/spreadsheets' in href:
        return 'gsheet', f'https://docs.google.com/spreadsheets/d/{fid}/export?format=xlsx'
    return 'file', f'https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t'


manifest = []


def walk(fid, rel):
    for eid, href, title, mod in listing(fid):
        kind, url = export_url(eid, href)
        if kind == 'folder':
            walk(eid, os.path.join(rel, safe(title)))
            continue
        name = safe(title)
        if kind in ('gdoc', 'gslides') and not name.lower().endswith('.pdf'):
            name += '.pdf'
        if kind == 'gsheet' and not name.lower().endswith('.xlsx'):
            name += '.xlsx'
        dst_dir = os.path.join(OUT, rel)
        os.makedirs(dst_dir, exist_ok=True)
        dst = os.path.join(dst_dir, name)
        if not os.path.exists(dst):
            data, ctype = get(url)
            if b'<html' in data[:500].lower():
                print('  !! no descargable (html):', rel, title)
                manifest.append({'id': eid, 'title': title, 'folder': rel, 'kind': kind, 'modified': mod, 'path': None, 'error': 'html'})
                continue
            with open(dst, 'wb') as f:
                f.write(data)
        manifest.append({'id': eid, 'title': title, 'folder': rel.replace('\\', '/'), 'kind': kind, 'modified': mod,
                         'path': os.path.relpath(dst, ROOT).replace('\\', '/'), 'bytes': os.path.getsize(dst),
                         'view': f'https://drive.google.com/file/d/{eid}/view'})
        print(f'  {os.path.getsize(dst)//1024:>7} KB  {rel}/{name}')


for i, root in enumerate(sys.argv[1:]):
    walk(root, f'carpeta{i + 1}')
with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=1)
print('archivos:', len([m for m in manifest if m.get('path')]), 'errores:', len([m for m in manifest if not m.get('path')]))
