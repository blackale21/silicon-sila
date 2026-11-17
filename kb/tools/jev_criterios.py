"""Genera backend/ayuda-jev-criterios.gs con las opciones FIJAS que Jev puede elegir (una por ficha).

El Apps Script sólo acepta preguntarle a Jev "¿qué ficha corresponde?" con esta lista: nadie puede
usar el puente para otra cosa. Correr de nuevo cada vez que cambian las fichas (build_kb.py lo hace solo).
    python kb/tools/jev_criterios.py
"""
import json, os, sqlite3

KB = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(os.path.dirname(KB), 'backend', 'ayuda-jev-criterios.gs')


def main():
    con = sqlite3.connect(os.path.join(KB, 'sila_kb.sqlite'))
    crit = {i: f'{t} (tema: {m}). Ej.: {"; ".join(json.loads(a)[:3])}'
            for i, t, m, a in con.execute('SELECT id, title, module, ask FROM cards ORDER BY module, id')}
    crit['ninguna'] = ('La consulta no trata de ninguno de estos temas de la app Silicon Access '
                       '(problemas edilicios, convivencia, precios, horarios, temas personales, etc.).')
    js = ('/** GENERADO por kb/tools/jev_criterios.py: no editar a mano. Opciones fijas que Jev puede elegir. */\n'
          f'const JEV_CRITERIOS = {json.dumps(crit, ensure_ascii=False, indent=1)};\n')
    open(OUT, 'w', encoding='utf-8').write(js)
    print(f'{len(crit) - 1} fichas → {os.path.relpath(OUT)}')


if __name__ == '__main__':
    main()
