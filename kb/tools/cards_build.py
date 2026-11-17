"""Carga las fichas humanas (kb/cards/*.json) en la base y ubica los círculos rojos.

Para cada `mark` (texto de un botón de la app) busca ese texto en el OCR con posiciones de la
página (kb/ocr/boxes/<doc>-<pag>.json). Prefiere coincidencias DENTRO de las capturas de pantalla
(imágenes embebidas del PDF) y que NO sean texto impreso del folleto. Guarda coordenadas
normalizadas (0..1) del círculo y un recorte (la captura que lo contiene) para mostrarlo grande.
"""
import difflib, glob, json, os, re, sqlite3, unicodedata
import fitz

KB = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def fold(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def wsim(a, b):
    return 1.0 if a == b else difflib.SequenceMatcher(None, a, b).ratio()


def find_label(label, ocr):
    """Devuelve candidatos [(score, bbox_px, line_len)] para el texto `label`."""
    want = fold(label).split()
    if not want:
        return []
    out = []
    for line in ocr['lines']:
        ws = [(fold(w['text']), w) for w in line['words']]
        ws = [(t, w) for t, w in ws if t]
        for i in range(len(ws) - len(want) + 1):
            seg = ws[i:i + len(want)]
            sc = sum(wsim(a, t) for a, (t, _) in zip(want, seg)) / len(want)
            if sc < 0.8:
                continue
            xs = [w['x'] for _, w in seg]; ys = [w['y'] for _, w in seg]
            x2 = max(w['x'] + w['w'] for _, w in seg); y2 = max(w['y'] + w['h'] for _, w in seg)
            out.append((sc, (min(xs), min(ys), x2, y2), len(ws)))
    return out


def resolve(page, ocr, label):
    s = ocr['w'] / page.rect.width  # px por punto PDF
    imgs = [tuple(v * s for v in i['bbox']) for i in page.get_image_info() if (i['bbox'][2] - i['bbox'][0]) > 40]
    vec = [tuple(v * s for v in w[:4]) for w in page.get_text('words')]
    best = None
    for sc, (x1, y1, x2, y2), n in find_label(label, ocr):
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        inside = [b for b in imgs if b[0] <= cx <= b[2] and b[1] <= cy <= b[3]]
        printed = any(v[0] <= cx <= v[2] and v[1] <= cy <= v[3] for v in vec)
        exact = n <= len(fold(label).split()) + 2  # renglón corto = rótulo de un botón
        score = sc + (1.0 if inside else 0) + (0.6 if exact else 0) - (1.2 if printed else 0) + min(y2 - y1, 40) / 400
        if not best or score > best[0]:
            crop = min(inside, key=lambda b: (b[2] - b[0]) * (b[3] - b[1])) if inside else None
            best = (score, (x1, y1, x2, y2), crop, printed)
    if not best or best[0] < 1.0:
        return None
    return best


def build(con):
    files = sorted(glob.glob(os.path.join(KB, 'cards', '*.json')))
    chunks = {cid: (doc, page, img) for cid, doc, page, img in con.execute('select id, doc_id, page, image from chunks')}
    docs = {}
    man = json.load(open(os.path.join(KB, 'src', 'manifest.json'), encoding='utf-8'))
    byid = {m['id']: m['path'] for m in man if m.get('path')}
    for did, ids in con.execute('select id, drive_ids from documents'):
        docs[did] = os.path.join(KB, byid[json.loads(ids)[0]])
    opened, report, n = {}, [], 0
    for old in glob.glob(os.path.join(KB, 'shots', '*.webp')):
        os.remove(old)
    for f in files:
        for c in json.load(open(f, encoding='utf-8')):
            for kind in ('steps', 'tips'):
                for s in c.get(kind) or []:
                    doc, page, img = chunks[s['chunk']]
                    s['image'] = img
                    marks, crops = [], []
                    for label in s.get('mark') or []:
                        box = os.path.join(KB, 'ocr', 'boxes', f'{doc}-{page}.json')
                        if not page or not os.path.exists(box):
                            report.append(f'sin OCR · {c["id"]} · {label}')
                            continue
                        ocr = json.load(open(box, encoding='utf-8-sig'))
                        if doc not in opened:
                            opened[doc] = fitz.open(docs[doc])
                        r = resolve(opened[doc][page - 1], ocr, label)
                        if not r:
                            report.append(f'no ubicado · {c["id"]} · «{label}»')
                            continue
                        W, H = ocr['w'], ocr['h']
                        x1, y1, x2, y2 = r[1]
                        marks.append({'label': label, 'x': x1 / W, 'y': y1 / H, 'w': (x2 - x1) / W, 'h': (y2 - y1) / H})
                        if r[2]:
                            crops.append(r[2])
                        else:  # sin captura: recorte alrededor del rótulo
                            crops.append((x1 - W * 0.16, y1 - H * 0.08, x2 + W * 0.16, y2 + H * 0.08))
                    if marks:
                        W, H = ocr['w'], ocr['h']
                        cx1 = max(0, min(b[0] for b in crops) - W * 0.01); cy1 = max(0, min(b[1] for b in crops) - H * 0.006)
                        cx2 = min(W, max(b[2] for b in crops) + W * 0.01); cy2 = min(H, max(b[3] for b in crops) + H * 0.006)
                        cw, chh = cx2 - cx1, cy2 - cy1
                        # recorte en alta resolución de la captura, con los círculos relativos al recorte
                        from PIL import Image
                        os.makedirs(os.path.join(KB, 'shots'), exist_ok=True)
                        name = f'{c["id"]}-{kind[0]}{(c.get(kind) or []).index(s) + 1}.webp'
                        im = Image.open(os.path.join(KB, 'ocr', 'png', f'{doc}-{page}.png')).convert('RGB').crop((int(cx1), int(cy1), int(cx2), int(cy2)))
                        if im.width > 760:
                            im = im.resize((760, int(im.height * 760 / im.width)), Image.LANCZOS)
                        im.save(os.path.join(KB, 'shots', name), 'WEBP', quality=82, method=6)
                        s['shot'] = f'kb/shots/{name}'
                        s['ratio'] = cw / chh
                        s['marks'] = [{'label': m['label'], 'x': (m['x'] * W - cx1) / cw, 'y': (m['y'] * H - cy1) / chh,
                                       'w': m['w'] * W / cw, 'h': m['h'] * H / chh} for m in marks]
            con.execute('INSERT INTO cards (id, module, title, ask, intro, body) VALUES (?,?,?,?,?,?)', (
                c['id'], c['module'], c['title'], json.dumps(c['ask'], ensure_ascii=False), c['intro'],
                json.dumps({'steps': c['steps'], 'tips': c.get('tips') or []}, ensure_ascii=False)))
            n += 1
    return n, report
