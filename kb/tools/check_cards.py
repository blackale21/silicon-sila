"""Valida las fichas de respuesta (kb/cards/*.json) contra el texto de los manuales.

Regla anti-invento: cada paso/nota debe traer `chunk` (id de fragmento) y `quote`, y el `quote`
tiene que estar LITERALMENTE en el texto de ese fragmento (se ignoran mayúsculas, espacios,
comillas tipográficas y viñetas). Uso: python kb/tools/check_cards.py [archivo.json ...]
"""
import glob, json, os, re, sqlite3, sys, unicodedata

KB = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def norm(s):
    s = unicodedata.normalize('NFC', s or '').lower()
    s = s.replace('“', '"').replace('”', '"').replace('’', "'").replace('‘', "'").replace('•', ' ').replace('●', ' ')
    s = re.sub(r'(\w)-\s+(\w)', r'\1\2', s)
    return re.sub(r'\s+', ' ', s).strip()


def main(files):
    con = sqlite3.connect(os.path.join(KB, 'sila_kb.sqlite'))
    text = {cid: norm(t) for cid, t in con.execute('select id, text from chunks')}
    errors, ids, n = [], set(), 0
    for f in files:
        try:
            cards = json.load(open(f, encoding='utf-8'))
        except Exception as e:
            errors.append(f'{f}: JSON inválido: {e}')
            continue
        for c in cards:
            n += 1
            cid = c.get('id', '?')
            where = f'{os.path.basename(f)} › {cid}'
            if cid in ids:
                errors.append(f'{where}: id repetido')
            ids.add(cid)
            for k in ('id', 'module', 'title', 'ask', 'intro', 'steps'):
                if not c.get(k):
                    errors.append(f'{where}: falta "{k}"')
            if len(c.get('ask', [])) < 4:
                errors.append(f'{where}: "ask" necesita al menos 4 formas de preguntar')
            for kind in ('steps', 'tips'):
                for i, s in enumerate(c.get(kind) or []):
                    tag = f'{where} › {kind}[{i}]'
                    if not s.get('say'):
                        errors.append(f'{tag}: falta "say"')
                    if s.get('chunk') not in text:
                        errors.append(f'{tag}: chunk {s.get("chunk")} no existe')
                        continue
                    q = norm(s.get('quote'))
                    if len(q) < 12:
                        errors.append(f'{tag}: quote demasiado corto')
                    elif q not in text[s['chunk']]:
                        errors.append(f'{tag}: el quote NO está literal en el chunk {s["chunk"]}: «{s.get("quote")}»')
                    for m in s.get('mark') or []:
                        if not isinstance(m, str) or not m.strip():
                            errors.append(f'{tag}: mark inválido')
    print(f'{n} fichas revisadas · {len(errors)} errores')
    for e in errors:
        print(' -', e)
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:] or sorted(glob.glob(os.path.join(KB, 'cards', '*.json')))))
