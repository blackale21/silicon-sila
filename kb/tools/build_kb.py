"""Construye kb/sila_kb.sqlite + kb/pages/*.webp desde kb/src (bajado con drive_fetch.py).

Uso: python kb/tools/build_kb.py
- Deduplica por sha256 (los mismos manuales aparecen en las dos carpetas).
- Un fragmento por página (PDF) o por sección (DOCX), con el TEXTO LITERAL del manual.
- Si una página no tiene texto y existe kb/ocr/<doc>-<pag>.txt, usa ese OCR.
"""
import datetime, glob, hashlib, json, os, re, sqlite3, unicodedata
import fitz  # PyMuPDF

KB = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC, PAGES, OCR = os.path.join(KB, 'src'), os.path.join(KB, 'pages'), os.path.join(KB, 'ocr')
DB = os.path.join(KB, 'sila_kb.sqlite')
nfc = lambda s: unicodedata.normalize('NFC', s or '')


def key(s):
    s = unicodedata.normalize('NFD', nfc(s).lower())
    return re.sub(r'\s+', ' ', ''.join(c for c in s if unicodedata.category(c) != 'Mn')).strip()


MODULES = {
    'amenities': 'Amenities', 'autogestion de docum': 'Autogestión de documentación',
    'autoriz p-empresas': 'Autorizaciones para empresas', 'barrio s-conex': 'Barrio sin conexión',
    'barrio sin conex': 'Barrio sin conexión', 'boton de emergencia': 'Botón de emergencia',
    'comunicacion': 'Comunicación', 'comunidad': 'Comunidad', 'consultas y reclamos': 'Consultas y reclamos',
    'documentos utiles': 'Documentos útiles', 'encuestas': 'Encuestas', 'expensas': 'Expensas',
    'form de personas': 'Formulario de personas', 'informar pagos': 'Informar pagos', 'infracciones': 'Infracciones',
    'mejoras': 'Mejoras', 'novedades app mov': 'App móvil', 'novedades web admin + visualiz': 'Web de administración',
    'obras': 'Obras', 'paqueteria': 'Paquetería', 'puertas de acceso': 'Puertas de acceso', 'seguro': 'Seguros',
    'selfie id - autoempadronamiento': 'Selfie ID · autoempadronamiento', 'timbre virtual': 'Timbre virtual',
    'estoy llegando': 'Estoy llegando', 'invitacion y registracion': 'Invitación y registración', 'instructivos': 'Instructivos',
}
GENERIC = {'Mejoras', 'Instructivos', 'App móvil', 'Web de administración'}
# carpetas genéricas: el módulo real sale del nombre del archivo
BY_NAME = [(r'timbre', 'Timbre virtual'), (r'inscripcion', 'Invitación y registración'), (r'paqueteria', 'Paquetería'),
           (r'descarga archivos', 'Descarga de archivos'), (r'enc luces', 'Amenities'), (r'reg actividad', 'App móvil'),
           (r'autoriz', 'App móvil'), (r'pantalla inicio', 'App móvil'), (r'act app', 'App móvil'), (r'web admi', 'Web de administración')]


def module_for(folder, name):
    m = MODULES.get(key(folder.split('/')[-1]), folder.split('/')[-1].title())
    if m in GENERIC:
        for pat, mod in BY_NAME:
            if re.search(pat, key(name)):
                return mod
    return m


def audience(name):
    n = nfc(name)
    if re.search(r'AyG|Admi y Guardia', n): return 'admin_guardia'
    if re.search(r'Residen', n): return 'residente'
    if re.search(r'_Admin\b', n): return 'administracion'
    if re.search(r'[-_ ]R(?=$|[\s_(.])', n): return 'residente'
    if re.search(r'[-_ ]A(?=$|[\s_(.])', n): return 'administracion'
    return 'general'


def clean_title(name):
    t = re.sub(r'\.(pdf|docx)$', '', nfc(name), flags=re.I)
    t = re.sub(r'^Copy of\s+', '', t)
    return re.sub(r'\s+', ' ', t.replace('_', ' ')).strip()


def version(name):
    m = re.search(r'\((\d{2}-\d{2}|[A-Za-z]+ \d{2})\)', nfc(name))
    return m.group(1) if m else None


BULLET = re.compile(r'^\s*[●•▪◦■\-–]\s*')


def tidy(raw):
    t = nfc(raw).replace('­', '')
    t = re.sub(r'(\w)-[ \t]*\n[ \t]*([a-záéíóúñ])', r'\1\2', t)  # palabras cortadas con guion
    out = []
    for ln in t.split('\n'):
        ln = re.sub(r'[ \t ]+', ' ', ln).strip()
        if not ln or re.fullmatch(r'\d{1,2}', ln):
            continue
        ln = BULLET.sub('• ', ln) if BULLET.match(ln) else ln
        prev = out[-1] if out else ''
        # une renglones cortados por el diseño (continúa en minúscula)
        if prev and not re.search(r'[.!?:]$', prev) and re.match(r'^[a-záéíóúñ(]', ln):
            out[-1] = prev + ' ' + ln
        else:
            out.append(ln)
    return '\n'.join(out)


def heading(page):
    best, size = '', 0
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                txt = s['text'].strip()
                if len(txt) < 3 or re.fullmatch(r'[\d\W]+', txt):
                    continue
                if s['size'] > size + 0.5:
                    best, size = txt, s['size']
                elif abs(s['size'] - size) <= 0.5 and len(best) < 60 and txt not in best:
                    best += ' ' + txt
    return nfc(best)[:90].strip()


def main():
    man = json.load(open(os.path.join(SRC, 'manifest.json'), encoding='utf-8'))
    docs = {}
    for m in man:
        if not m.get('path'):
            continue
        p = os.path.join(KB, m['path'])
        h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
        d = docs.setdefault(h, {'sha': h, 'path': p, 'name': nfc(m['title']), 'ids': [], 'folders': [], 'modified': m['modified'], 'mods': []})
        d['ids'].append(m['id'])
        folder = nfc(m['folder']).replace('\\', '/')
        d['folders'].append(folder)
        d['mods'].append(module_for(folder, m['title']))

    # las claves cifradas (tabla secrets) sobreviven al rearmado de la base
    keep = []
    if os.path.exists(DB):
        try:
            keep = sqlite3.connect(DB).execute('SELECT * FROM secrets').fetchall()
        except sqlite3.Error:
            keep = []
        os.remove(DB)
    os.makedirs(PAGES, exist_ok=True)
    for f in glob.glob(os.path.join(PAGES, '*.webp')):
        os.remove(f)
    con = sqlite3.connect(DB)
    con.executescript(open(os.path.join(KB, 'schema.sql'), encoding='utf-8').read())
    con.executemany('INSERT INTO secrets VALUES (?,?,?,?,?,?,?)', keep)
    ord_ = 0
    report = []
    for d in sorted(docs.values(), key=lambda x: x['name']):
        did = d['sha'][:12]
        mods = [m for m in d['mods'] if m not in GENERIC] or d['mods']
        mod = mods[0]
        name = d['name']
        raw = open(d['path'], 'rb').read(5)
        chunks, status = [], 'ok'
        if raw.startswith(b'%PDF'):
            mime = 'application/pdf'
            doc = fitz.open(d['path'])
            empty = 0
            for i, page in enumerate(doc):
                txt = tidy(page.get_text('text', sort=True))
                ocr = os.path.join(OCR, f'{did}-{i + 1}.txt')
                if len(txt) < 20 and os.path.exists(ocr):
                    txt, status = tidy(open(ocr, encoding='utf-8-sig').read()), 'ocr'
                if len(txt) < 20:
                    empty += 1
                img = f'kb/pages/{did}-{i + 1}.webp'
                pix = page.get_pixmap(matrix=fitz.Matrix(1100 / page.rect.width, 1100 / page.rect.width))
                pix.pil_save(os.path.join(KB, 'pages', f'{did}-{i + 1}.webp'), format='WEBP', quality=70, method=6) if hasattr(pix, 'pil_save') else None
                chunks.append((i + 1, heading(page), txt, img))
            pages = len(doc)
            if empty == pages:
                status = 'sin_texto'
        else:  # DOCX
            import docx
            mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            dx = docx.Document(d['path'])
            sec, buf = '', []
            def flush():
                if buf:
                    chunks.append((None, sec, tidy('\n'.join(buf)), None))
            for para in dx.paragraphs:
                t = para.text.strip()
                if not t:
                    continue
                is_head = para.style.name.lower().startswith('heading') or (para.runs and all(r.bold for r in para.runs if r.text.strip()) and len(t) < 80)
                if is_head:
                    flush(); buf = []; sec = nfc(t)
                else:
                    buf.append(t)
                    if sum(len(x) for x in buf) > 700:
                        flush(); buf = []
            flush()
            pages = 0
        con.execute('INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (
            did, clean_title(name), mod, audience(name), version(name), name, mime, pages, d['sha'], os.path.getsize(d['path']),
            json.dumps(d['ids']), json.dumps(sorted(set(d['folders'])), ensure_ascii=False), d['modified'], status))
        for page, sec, txt, img in chunks:
            if len(txt) < 20:
                continue
            ord_ += 1
            con.execute('INSERT INTO chunks (doc_id,page,section,ord,text,image) VALUES (?,?,?,?,?,?)', (did, page, sec, ord_, txt, img))
        report.append(f'{status:9} {audience(name):14} {mod:30} {clean_title(name)}')
    # páginas de Confluence "Casos de Soporte" (sólo las de cara al cliente), copiadas a kb/src/confluence/paginas.json.
    # Van DESPUÉS de los manuales de Drive para no correr los ids de fragmento que usan las fichas.
    # paginas.json, paginas2_*.json, paginas3_*.json… en ese orden (agregar SIEMPRE en un archivo nuevo al final)
    ncf = 0
    for cf in sorted(glob.glob(os.path.join(SRC, 'confluence', 'paginas*.json'))):
        for pg in json.load(open(cf, encoding='utf-8')):
            txt_all = nfc(pg['text'])
            did = ('cf' + pg['id'])[:40] if not pg['id'].startswith('pl-') else pg['id']
            sha = hashlib.sha256(txt_all.encode('utf-8')).hexdigest()
            con.execute('INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (
                did, pg['title'], pg['module'], pg.get('audience', 'residente'), '', pg['title'], 'text/plain', 0, sha, len(txt_all.encode('utf-8')),
                json.dumps(['confluence:' + pg['id']]), json.dumps([('Confluence/CDS/' if not pg['id'].startswith('pl-') else '') + pg['path']], ensure_ascii=False), '', 'ok'))
            for part in [x.strip() for x in re.split(r'\n\s*\n', txt_all) if x.strip()]:
                if len(part) < 20:
                    continue
                ord_ += 1
                con.execute('INSERT INTO chunks (doc_id,page,section,ord,text,image) VALUES (?,?,?,?,?,?)', (did, None, pg['title'], ord_, part, None))
            ncf += 1
            report.append(f'ok        confluence     {pg["module"]:30} {pg["title"]}')
    con.commit()
    # imágenes y videos de Confluence (índice armado por kb/tools/conf_media.py)
    mi = os.path.join(SRC, 'confluence', 'media_index.json')
    if os.path.exists(mi):
        idx = json.load(open(mi, encoding='utf-8'))
        tit = {k: v['title'] for k, v in idx['paginas'].items()}
        for fid, m in idx['imagenes'].items():
            pg = (m.get('pages') or [None])[0]
            con.execute('INSERT INTO media VALUES (?,?,?,?,?,?,?,?,?)', (fid, 'imagen', pg, tit.get(pg), m['title'], m['file'], m['w'], m['h'], 0))
        for nombre, v in idx['videos'].items():
            if not os.path.exists(os.path.join(KB, 'videos', nombre + '.mp4')):
                continue
            pg = (v.get('pages') or [None])[0]
            con.execute('INSERT INTO media VALUES (?,?,?,?,?,?,?,?,?)', (nombre, 'video', pg, tit.get(pg), v['title'], v['file'], None, None, 1))
        con.commit()
    # fichas humanas: primero se validan las citas literales, después se ubican los círculos
    con.commit()
    import subprocess, sys as _sys
    tools = os.path.dirname(__file__)
    if glob.glob(os.path.join(KB, 'cards', '*.json')):
        chk = subprocess.run([_sys.executable, os.path.join(tools, 'check_cards.py')], capture_output=True, text=True, encoding='utf-8')
        print(chk.stdout.strip())
        if chk.returncode:
            raise SystemExit('fichas con errores: no se arma la base')
        _sys.path.insert(0, tools)
        import cards_build
        nc, rep = cards_build.build(con)
        print(f'fichas {nc}' + ''.join('\n  · ' + r for r in rep))
        con.commit()
        import jev_criterios  # opciones fijas del puente a Jev (backend/ayuda-jev-criterios.gs)
        jev_criterios.main()
    now = datetime.datetime.now().isoformat(timespec='seconds')
    con.executemany('INSERT INTO kb_meta VALUES (?,?)', [('schema_version', '2'), ('built_at', now),
                    ('source', 'Google Drive (2 carpetas compartidas por link)'), ('documents', str(len(docs) + ncf))])
    con.commit()
    con.execute('VACUUM')
    n = con.execute('select count(*), sum(length(text)) from chunks').fetchone()
    con.close()
    print('\n'.join(report))
    print(f'docs {len(docs)} · fragmentos {n[0]} · {n[1]} caracteres · {os.path.getsize(DB) // 1024} KB')


if __name__ == '__main__':
    main()
