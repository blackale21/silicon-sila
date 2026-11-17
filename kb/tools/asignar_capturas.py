"""Elige, para cada paso de las fichas sacadas de Confluence, la captura donde aparece el botón a marcar.

Busca el rótulo (`mark`) con el OCR de todas las capturas de las páginas indicadas y se queda con la que
mejor lo contiene, respetando el orden de los pasos (cada paso usa una captura igual o posterior a la del
anterior). Si el rótulo no aparece en ninguna captura, el paso queda sin imagen (no se adivina).
También agrega el video de la ficha si corresponde.
  python kb/tools/asignar_capturas.py   → reescribe kb/cards/g5.json y g6.json
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from cards_build import find_label, fold  # noqa: E402

KB = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
IDX = json.load(open(os.path.join(KB, 'src', 'confluence', 'media_index.json'), encoding='utf-8'))

G = '395345921'  # Web de Guardia
PLAN = {  # ficha: (páginas donde buscar, rótulo a marcar en cada paso o None)
    'acceso-olvide-contrasena': (['105054213', '118882441', '114491394'], ['Iniciar sesión', '¿No recordás tu contraseña?', 'Solicitar nueva contraseña', 'Cambiar Contraseña', 'Guardar nueva contraseña', None]),
    'acceso-activar-con-codigo': (['107085826'], ['Primera vez', None, None, None, None]),
    'autogestion-agregar-corresidente': (['116424735'], ['Autogestión', 'Corresidentes', None, None, None, None]),
    'autogestion-agregar-inquilino': (['116424735'], ['Autogestión', 'Inquilinos', None, None]),
    'autogestion-vehiculos-mascotas': (['116424735'], ['Autogestión', 'Vehículos', None]),
    'perfil-cambiar-mis-datos': (['122814495'], ['Mis Datos', None]),
    'perfil-foto': (['122814495'], ['Mis Datos']),
    'perfil-sesiones-dispositivos': (['122814495'], ['Mis Dispositivos', 'Configuración']),
    'autorizaciones-tres-opciones': (['99057669'], ['No tenés sus datos', 'Completá sus datos', 'Autorizá empresas']),
    'autorizaciones-permanente': (['99057669', '104628237', '110395719'], ['Autorizo a', 'Registrar nuevo contacto', 'Autorización permanente', 'Autorizar']),
    'autorizaciones-cancelar-renovar': (['99057669', '114917389', '563281922'], ['Ver autorizaciones', 'Eliminar', 'Guardar']),
    'mis-lotes-varios-barrios': (['123535423'], ['Mis Lotes', None]),
    'documentos-del-barrio': (['381845507', '119898132'], ['Documentos', None]),
    'telefonos-utiles': (['122716173'], ['Teléfonos Útiles', None]),
    'guardia-entrar-web': ([G], [None, 'Aceptar', None, None]),
    'guardia-ingreso-sin-autorizacion': ([G], ['Visitas', 'Buscar', None, None, 'Habilitar ingreso']),
    'guardia-ingreso-preautorizado': ([G], ['Buscar', None, 'Habilitar Ingreso']),
    'guardia-salida': ([G], ['Salidas', None, None, 'Habilitar egreso']),
    'guardia-multilote': ([G], ['Lote Destino']),
    'guardia-tipo-ingresante': ([G], ['Tipo de Ingresante']),
    'guardia-seguro-vencido': ([G], [None, 'Verifica los datos']),
    'guardia-excedidos': ([G], [None, 'Excedidos', 'Generar Salida']),
    'guardia-paquete-nuevo': ([G], ['Cargar Nuevo', 'Destinatario', 'Crear']),
    'guardia-emergencia': ([G], ['Responder', 'Finalizar', 'Ignorar']),
    'guardia-timbre-virtual': ([G], [None, None, 'Habilitar Ingreso']),
    'guardia-migrar-via': ([G], ['Migrar Vía']),
    'guardia-doble-validacion': ([G], [None, None]),
    'guardia-ultima-actividad': ([G], ['Ajustes', 'Última Actividad']),
}
# capturas que NO se usan (muestran datos de personas: nombre + DNI, patente, operador)
SACAR = {('guardia-seguro-vencido', 2), ('guardia-ultima-actividad', 1), ('guardia-entrar-web', 2), ('guardia-paquete-nuevo', 2),
         ('autorizaciones-permanente', 4), ('guardia-salida', 4), ('guardia-emergencia', 1), ('guardia-emergencia', 2),
         ('guardia-excedidos', 3)}
# zonas a difuminar (x, y, ancho, alto en proporción de la captura entera): listas con nombres, mails y fotos
LISTA_AUTOG = [[0, 0.31, 1, 0.48]]
TAPAR = {('autogestion-agregar-corresidente', 1): LISTA_AUTOG, ('autogestion-agregar-corresidente', 2): LISTA_AUTOG,
         ('autogestion-agregar-inquilino', 1): LISTA_AUTOG, ('autogestion-vehiculos-mascotas', 1): LISTA_AUTOG,
         ('autogestion-vehiculos-mascotas', 2): LISTA_AUTOG,
         ('perfil-cambiar-mis-datos', 1): [[0, 0.12, 1, 0.2]], ('perfil-foto', 1): [[0, 0.12, 1, 0.2]]}
VIDEOS = {  # ficha: video (kb/videos/<nombre>.mp4) + título corto
    'autorizaciones-tres-opciones': ('autorizaciones', 'Autorizaciones en la app'),
    'autorizaciones-permanente': ('crear-autorizacion', 'Cómo crear una autorización'),
    'autorizar-empresa': ('autorizar-empresa', 'Cómo autorizar a una empresa'),
    'autorizaciones-cancelar-renovar': ('autorizar-empresa', 'Autorizaciones de empresas'),
    'app-movil-autorizar-visita': ('crear-autorizacion', 'Cómo crear una autorización'),
    'amenities-reservar': ('reservar-amenity-corto', 'Cómo reservar un amenity'),
    'amenities-invitar': ('reservar-amenity-corto', 'Cómo reservar e invitar en Amenities'),
}


def ocr_de(fid):
    p = os.path.join(KB, 'ocr', 'conf', f'{fid}.json')
    return json.load(open(p, encoding='utf-8-sig')) if os.path.exists(p) else None


def puntaje(fid, label):
    o = ocr_de(fid)
    if not o:
        return 0
    best = 0
    for sc, _, n in find_label(label, o):
        best = max(best, sc + (0.3 if n <= len(fold(label).split()) + 2 else 0))
    return best


def main():
    rep = []
    for f in ('g5.json', 'g6.json', 'g1.json', 'g2.json', 'g3.json', 'g4.json'):
        p = os.path.join(KB, 'cards', f)
        cards = json.load(open(p, encoding='utf-8'))
        cambio = False
        for c in cards:
            if c['id'] in VIDEOS and os.path.exists(os.path.join(KB, 'videos', VIDEOS[c['id']][0] + '.mp4')):
                c['video'] = {'nombre': VIDEOS[c['id']][0], 'titulo': VIDEOS[c['id']][1]}
                cambio = True
            if c['id'] not in PLAN:
                continue
            pages, labels = PLAN[c['id']]
            imgs = [fid for pg in pages for fid in IDX['paginas'].get(pg, {}).get('orden', []) if fid in IDX['imagenes']]
            pos = 0
            for s, label in zip(c['steps'], labels):
                s.pop('img', None); s.pop('mark', None); s.pop('tapar', None)
                if not label:
                    continue
                cand = [(puntaje(fid, label), -i, i, fid) for i, fid in enumerate(imgs) if i >= pos]
                cand = [x for x in cand if x[0] >= 0.85]
                if not cand:
                    rep.append(f'sin captura · {c["id"]} · «{label}»')
                    continue
                sc, _, i, fid = max(cand)
                n = c['steps'].index(s) + 1
                if (c['id'], n) in SACAR:
                    continue
                s['img'] = fid; s['mark'] = [label]; pos = i
                if (c['id'], n) in TAPAR:
                    s['tapar'] = TAPAR[(c['id'], n)]
                cambio = True
        if cambio:
            open(p, 'w', encoding='utf-8').write(json.dumps(cards, ensure_ascii=False, indent=2) + '\n')
    print('\n'.join(rep) or 'todas las marcas ubicadas')


if __name__ == '__main__':
    main()
