"""Prueba comparativa: buscador local del bot vs Jev (TypeSafe AI) para elegir la ficha correcta.

    python kb/tools/jev_bench.py            (pide la frase para descifrar la clave guardada)

- La clave de API se lee CIFRADA de la base (python kb/tools/secretos.py guardar typesafe).
- A Jev se le manda sólo la consulta y la lista de títulos de las fichas (+ "ninguna").
  Jev ELIGE; no redacta nada. La respuesta al vecino sigue saliendo de las fichas validadas.
- Resultado: kb/tmp/jev_resultado.md (no se versiona).
"""
import json, os, sqlite3, subprocess, sys, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
KB = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from secretos import leer  # noqa: E402

API = 'https://api.typesafe.ai/v1/systemone'
MODEL = 'jev-latest'


def cards():
    con = sqlite3.connect(os.path.join(KB, 'sila_kb.sqlite'))
    return [(i, t, m, json.loads(a)) for i, t, m, a in con.execute('SELECT id, title, module, ask FROM cards ORDER BY module, id')]


def jev(key, consulta, criteria):
    body = {
        'model': MODEL,
        'state': {'consulta_del_residente': consulta},
        'questions': {'ficha': {
            'type': 'choice',
            'instructions': ('Sos el asistente de ayuda de la app Silicon Access para residentes de barrios cerrados. '
                             'Elegí el tema de ayuda que responde la consulta del residente (puede tener errores de tipeo). '
                             'Si ninguno la responde de verdad, elegí "ninguna".'),
            'criteria': criteria,
        }},
    }
    req = urllib.request.Request(API, data=json.dumps(body).encode('utf-8'), method='POST', headers={
        'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    t = time.perf_counter()
    for intento in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                j = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 529) and intento < 3:
                time.sleep(float(e.headers.get('retry-after') or 2 ** intento))
                continue
            raise SystemExit(f'Jev respondió {e.code}: {e.read().decode("utf-8", "replace")[:400]}')
    ms = (time.perf_counter() - t) * 1000
    a = j['answers']['ficha']
    return a['choice'], a.get('confidence') or max(a.get('probabilities', {0: 0}).values()), ms, j.get('usage', {}), j.get('model')


def main():
    bateria = json.load(open(os.path.join(HERE, 'jev_bateria.json'), encoding='utf-8'))
    cs = cards()
    criteria = {i: f'{t} (tema: {m}). Ej.: {"; ".join(a[:3])}' for i, t, m, a in cs}
    criteria['ninguna'] = 'La consulta no trata de ninguno de estos temas de la app (problemas edilicios, convivencia, precios, horarios, etc.).'
    key = leer('typesafe')

    loc = json.loads(subprocess.run(['node', os.path.join(HERE, 'local_decide.js')], input=json.dumps([b['q'] for b in bateria]),
                                    capture_output=True, text=True, encoding='utf-8', check=True).stdout)
    filas, ok_l, ok_j, ok_mix, ms_j, tok, modelo = [], 0, 0, 0, [], 0, ''
    for b, l in zip(bateria, loc):
        esperado = set(b['ok'])
        # local: acierta si respondió una ficha correcta, o si dijo "none" cuando no había respuesta
        if not esperado:
            bien_l = l['type'] == 'none'
        else:
            bien_l = l['type'] in ('card', 'choose', 'narrow') and bool(esperado & set(l['ids'])) and (l['type'] == 'card' or len(l['ids']) <= 4)
        c, conf, ms, use, modelo = jev(key, b['q'], criteria)
        bien_j = (c == 'ninguna') if not esperado else (c in esperado)
        # combinado: local si está seguro (card/none), Jev si dudó (choose/narrow/vague) o no encontró
        usa_jev = l['type'] != 'card'
        bien_mix = bien_j if usa_jev else bien_l
        ok_l += bien_l; ok_j += bien_j; ok_mix += bien_mix
        ms_j.append(ms); tok += use.get('input_tokens', 0)
        filas.append(f"| {b['q']} | {'—' if not esperado else ', '.join(sorted(esperado))[:60]} | {'✅' if bien_l else '❌'} {l['type']} {l['ids'][0] if l['ids'] else ''} | {'✅' if bien_j else '❌'} {c} ({conf:.2f}) | {ms:.0f} |")
        print(('✅' if bien_j else '❌'), f'{ms:5.0f} ms', b['q'], '→', c)
    n = len(bateria)
    ms_j.sort()
    res = (f"# Prueba buscador local vs Jev ({modelo})\n\n"
           f"- Consultas: {n} (incluye errores de tipeo y {sum(1 for b in bateria if not b['ok'])} fuera de los manuales)\n"
           f"- **Local:** {ok_l}/{n} aciertos · {sum(x['ms'] for x in loc) / n:.2f} ms por consulta (en el navegador, sin internet)\n"
           f"- **Jev:** {ok_j}/{n} aciertos · mediana {ms_j[n // 2]:.0f} ms, máx {ms_j[-1]:.0f} ms (ida y vuelta por internet) · {tok} tokens de entrada en total\n"
           f"- **Combinado** (local cuando está seguro, Jev cuando duda): {ok_mix}/{n}\n\n"
           "| Consulta | Ficha esperada | Local | Jev (confianza) | ms Jev |\n|---|---|---|---|---|\n" + '\n'.join(filas) + '\n')
    os.makedirs(os.path.join(KB, 'tmp'), exist_ok=True)
    out = os.path.join(KB, 'tmp', 'jev_resultado.md')
    open(out, 'w', encoding='utf-8').write(res)
    print('\n' + res.split('\n\n')[1])
    print('Detalle:', os.path.relpath(out))


if __name__ == '__main__':
    main()
