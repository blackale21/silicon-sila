"""Claves de API guardadas CIFRADAS en la base (tabla `secrets` de kb/sila_kb.sqlite).

Cifrado AES-256-GCM. La llave de cifrado NO está en la base:
  - modo "llave" (por defecto): una llave aleatoria de 256 bits en kb/.llave_local, que NO se sube a git.
    No pide nada al usarla. Lo que esté publicado en la base es ilegible sin ese archivo.
  - modo "frase" (opcional): la llave sale de una frase (PBKDF2-SHA256, 600.000 iteraciones).
Al pasar a un servidor: copiar kb/.llave_local a su configuración privada (o la variable SILA_LLAVE en base64).

Uso:
    python kb/tools/secretos.py guardar typesafe        (pega la clave; no se ve al escribir)
    python kb/tools/secretos.py sin-frase typesafe      (pasa una clave guardada con frase al modo llave; pide la frase UNA vez)
    python kb/tools/secretos.py listar
    python kb/tools/secretos.py borrar typesafe
Desde otro script:  from secretos import leer;  key = leer('typesafe')
"""
import base64, datetime, getpass, os, sqlite3, sys

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

KB = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DB = os.path.join(KB, 'sila_kb.sqlite')
LLAVE = os.path.join(KB, '.llave_local')
ITER = 600_000
b64 = lambda b: base64.b64encode(b).decode()
unb64 = base64.b64decode

DDL = '''CREATE TABLE IF NOT EXISTS secrets (
  name       TEXT PRIMARY KEY,
  alg        TEXT NOT NULL,
  kdf        TEXT NOT NULL,
  salt       TEXT NOT NULL,
  iv         TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL
)'''


def _llave(crear=False):
    if os.environ.get('SILA_LLAVE'):
        return unb64(os.environ['SILA_LLAVE'])
    if not os.path.exists(LLAVE):
        if not crear:
            raise SystemExit(f'Falta {os.path.relpath(LLAVE)} (la llave local). Volvé a guardar la clave: python kb/tools/secretos.py guardar typesafe')
        with open(LLAVE, 'w') as f:
            f.write(b64(os.urandom(32)))
    return unb64(open(LLAVE).read().strip())


def _de_frase(frase, salt, it=ITER):
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=it).derive(frase.encode('utf-8'))


def _escribir(name, valor, key, kdf, salt, db):
    iv = os.urandom(12)
    ct = AESGCM(key).encrypt(iv, valor.encode('utf-8'), name.encode('utf-8'))  # el nombre va como dato asociado
    con = sqlite3.connect(db)
    con.execute(DDL)
    con.execute('INSERT OR REPLACE INTO secrets VALUES (?,?,?,?,?,?,?)', (
        name, 'AES-256-GCM', kdf, b64(salt), b64(iv), b64(ct), datetime.datetime.now().isoformat(timespec='seconds')))
    con.commit()
    con.close()


def guardar(name, valor, frase=None, db=DB):
    if frase:
        salt = os.urandom(16)
        _escribir(name, valor, _de_frase(frase, salt), f'PBKDF2-SHA256:{ITER}', salt, db)
    else:
        _escribir(name, valor, _llave(crear=True), 'LLAVE-LOCAL', b'', db)


def leer(name, frase=None, db=DB):
    con = sqlite3.connect(db)
    con.execute(DDL)
    row = con.execute('SELECT kdf, salt, iv, ciphertext FROM secrets WHERE name=?', (name,)).fetchone()
    con.close()
    if not row:
        raise SystemExit(f'No hay una clave "{name}" guardada. Corré: python kb/tools/secretos.py guardar {name}')
    kdf, salt, iv, ct = row
    if kdf == 'LLAVE-LOCAL':
        key = _llave()
    else:
        frase = frase or os.environ.get('SILA_FRASE') or getpass.getpass('Frase para descifrar: ')
        key = _de_frase(frase, unb64(salt), int(kdf.split(':')[1]))
    try:
        return AESGCM(key).decrypt(unb64(iv), unb64(ct), name.encode('utf-8')).decode('utf-8')
    except Exception:
        raise SystemExit('No se pudo descifrar: frase o llave local incorrecta (o el dato fue alterado).')


def _main():
    if len(sys.argv) < 2 or sys.argv[1] not in ('guardar', 'sin-frase', 'listar', 'borrar'):
        print(__doc__)
        return
    cmd = sys.argv[1]
    name = sys.argv[2] if len(sys.argv) > 2 else 'typesafe'
    con = sqlite3.connect(DB); con.execute(DDL)
    if cmd == 'listar':
        for r in con.execute('SELECT name, alg, kdf, created_at FROM secrets'):
            print(' · '.join(r))
        return
    if cmd == 'borrar':
        con.execute('DELETE FROM secrets WHERE name=?', (name,)); con.commit()
        print('borrada:', name)
        return
    if cmd == 'sin-frase':
        valor = leer(name)  # pide la frase actual una última vez
        guardar(name, valor)
        assert leer(name) == valor
        print(f'Listo: "{name}" ya no usa frase. Sigue cifrada en la base; la llave quedó en {os.path.relpath(LLAVE)} (no se sube a git).')
        return
    valor = getpass.getpass(f'Pegá la clave de API de "{name}" (no se ve al escribir): ').strip()
    if len(valor) < 10:
        raise SystemExit('La clave parece incompleta; no se guardó nada.')
    guardar(name, valor)
    assert leer(name) == valor
    print(f'Listo: "{name}" quedó cifrada en {os.path.relpath(DB)}. Llave local: {os.path.relpath(LLAVE)} (no se sube a git).')


if __name__ == '__main__':
    _main()
