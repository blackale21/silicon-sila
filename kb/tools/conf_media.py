"""Procesa las imágenes y videos bajados de Confluence (kb/src/confluence/media, con manifest.json).

  python kb/tools/conf_media.py
    → kb/conf/<fileId>.webp      imágenes livianas para el chat (máx. 900 px de ancho)
    → kb/src/confluence/png/     PNG para el OCR con posiciones (círculos rojos)
    → kb/videos/<nombre>.mp4     videos comprimidos (720p, H.264, arranque rápido)
    → kb/src/confluence/media_index.json  qué archivo es de qué página y en qué orden aparece
Los originales quedan en kb/src (no se publican).
"""
import json, os, re, shutil, subprocess, sys

KB = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(KB, 'src', 'confluence', 'media')
PNG = os.path.join(KB, 'src', 'confluence', 'png')
OUT_IMG = os.path.join(KB, 'conf')
OUT_VID = os.path.join(KB, 'videos')

# nombre legible de cada video (el título del archivo en Confluence no dice qué muestra)
VIDEOS = {
    '20250901-1844-27.3126340.mp4': 'crear-invitacion',
    '20250901-1920-33.7317779.mp4': 'crear-autorizacion',
    '20250905-1941-53.6592648.mp4': 'autorizar-empresa',
    'Autorización (1).mp4': 'autorizaciones',
    'App Mobile - Reservas.mp4': 'reservar-amenity-corto',
    'Residentes- Amenities.mp4': 'amenities-residentes',
}


def ffmpeg():
    exe = shutil.which('ffmpeg')
    if exe:
        return exe
    base = os.path.expanduser(r'~\AppData\Local\Microsoft\WinGet\Packages')
    for root, _, files in os.walk(base):
        if 'ffmpeg.exe' in files:
            return os.path.join(root, 'ffmpeg.exe')
    sys.exit('no encuentro ffmpeg')


def main():
    from PIL import Image
    man = json.load(open(os.path.join(SRC, 'manifest.json'), encoding='utf-8'))
    for d in (PNG, OUT_IMG, OUT_VID):
        os.makedirs(d, exist_ok=True)
    idx = {'imagenes': {}, 'videos': {}, 'paginas': {}}
    for e in man['enviados']:
        src = os.path.join(SRC, e['file'])
        if not os.path.exists(src):
            print('falta', e['file']); continue
        if e['mime'].startswith('image/'):
            try:
                im = Image.open(src).convert('RGB')
            except Exception as err:
                print('no abre', e['file'], err); continue
            png = os.path.join(PNG, e['id'] + '.png')
            if not os.path.exists(png):
                im.save(png)
            w, h = im.size
            if w > 900:
                im = im.resize((900, round(h * 900 / w)), Image.LANCZOS)
            dst = os.path.join(OUT_IMG, e['id'] + '.webp')
            if not os.path.exists(dst):
                im.save(dst, 'WEBP', quality=80, method=6)
            idx['imagenes'][e['id']] = {'title': e['title'], 'file': f'kb/conf/{e["id"]}.webp', 'w': w, 'h': h, 'pages': e['pages']}
        elif e['mime'].startswith('video/'):
            nombre = VIDEOS.get(e['title'], re.sub(r'[^a-z0-9]+', '-', e['title'].lower()).strip('-'))
            dst = os.path.join(OUT_VID, nombre + '.mp4')
            if not os.path.exists(dst):
                subprocess.run([ffmpeg(), '-y', '-loglevel', 'error', '-i', src, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264',
                                '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', dst], check=True)
                subprocess.run([ffmpeg(), '-y', '-loglevel', 'error', '-ss', '2', '-i', dst, '-frames:v', '1', '-vf', 'scale=640:-2',
                                os.path.join(OUT_VID, nombre + '.jpg')], check=True)
            idx['videos'][nombre] = {'title': e['title'], 'file': f'kb/videos/{nombre}.mp4', 'poster': f'kb/videos/{nombre}.jpg',
                                     'mb': round(os.path.getsize(dst) / 1e6, 1), 'pages': e['pages']}
    for p in man['pages']:
        tit = {a['title']: a['fileId'] for a in p['atts']}
        idx['paginas'][p['id']] = {'title': p['title'], 'path': p['path'],
                                   'orden': [tit[f] for f in p['orden'] if f in tit]}
    json.dump(idx, open(os.path.join(KB, 'src', 'confluence', 'media_index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"imágenes {len(idx['imagenes'])} · videos {len(idx['videos'])} · páginas {len(idx['paginas'])}")
    for k, v in idx['videos'].items():
        print(f'  video {k}: {v["mb"]} MB')


if __name__ == '__main__':
    main()
