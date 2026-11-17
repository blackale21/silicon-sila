"""Claves de API guardadas CIFRADAS en la base (tabla `secrets` de kb/sila_kb.sqlite).

Cifrado: AES-256-GCM con una clave derivada de una frase (PBKDF2-SHA256, 600.000 iteraciones,
sal aleatoria). Es el mismo esquema que soporta WebCrypto, por si algún día se descifra en un
servidor JS. Sin la frase, lo guardado en la base no sirve para nada.

Uso (en una terminal, la clave y la frase NO se muestran ni quedan en el historial):
    python kb/tools/secretos.py guardar typesafe
    python kb/tools/secretos.py listar
    python kb/tools/secretos.py borrar typesafe
Desde otro script:  from secretos import leer;  key = leer('typesafe', frase)
La frase también se puede pasar con la variable de entorno SILA_FRASE (no recomendado en PCs compartidas).
"""
import base64, datetime, getpass, os, sqlite3, sys

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

DB = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'sila_kb.sqlite'))
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


def _key(frase, salt, it=ITER):
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=it).derive(frase.encode('utf-8'))


def guardar(name, valor, frase, db=DB):
    salt, iv = os.urandom(16), os.urandom(12)
    ct = AESGCM(_key(frase, salt)).encrypt(iv, valor.encode('utf-8'), name.encode('utf-8'))  # el nombre va como dato asociado
    con = sqlite3.connect(db)
    con.execute(DDL)
    con.execute('INSERT OR REPLACE INTO secrets VALUES (?,?,?,?,?,?,?)', (
        name, 'AES-256-GCM', f'PBKDF2-SHA256:{ITER}', b64(salt), b64(iv), b64(ct), datetime.datetime.now().isoformat(timespec='seconds')))
    con.commit()
    con.close()


def leer(name, frase=None, db=DB):
    con = sqlite3.connect(db)
    con.execute(DDL)
    row = con.execute('SELECT kdf, salt, iv, ciphertext FROM secrets WHERE name=?', (name,)).fetchone()
    con.close()
    if not row:
        raise SystemExit(f'No hay una clave "{name}" guardada. Corré: python kb/tools/secretos.py guardar {name}')
    frase = frase or os.environ.get('SILA_FRASE') or getpass.getpass('Frase para descifrar: ')
    it = int(row[0].split(':')[1])
    try:
        return AESGCM(_key(frase, unb64(row[1]), it)).decrypt(unb64(row[2]), unb64(row[3]), name.encode('utf-8')).decode('utf-8')
    except Exception:
        raise SystemExit('Frase incorrecta (o el dato fue alterado).')


def _main():
    if len(sys.argv) < 2 or sys.argv[1] not in ('guardar', 'listar', 'borrar'):
        print(__doc__)
        return
    cmd = sys.argv[1]
    if cmd == 'listar':
        con = sqlite3.connect(DB); con.execute(DDL)
        for r in con.execute('SELECT name, alg, kdf, created_at FROM secrets'):
            print(' · '.join(r))
        return
    name = sys.argv[2] if len(sys.argv) > 2 else 'typesafe'
    if cmd == 'borrar':
        con = sqlite3.connect(DB); con.execute(DDL); con.execute('DELETE FROM secrets WHERE name=?', (name,)); con.commit()
        print('borrada:', name)
        return
    valor = getpass.getpass(f'Pegá la clave de API de "{name}" (no se ve al escribir): ').strip()
    if len(valor) < 10:
        raise SystemExit('La clave parece incompleta; no se guardó nada.')
    f1 = getpass.getpass('Elegí una frase para cifrarla (mín. 12 caracteres, mejor 4 palabras): ')
    if len(f1) < 12:
        raise SystemExit('La frase es muy corta; no se guardó nada.')
    if getpass.getpass('Repetí la frase: ') != f1:
        raise SystemExit('Las frases no coinciden; no se guardó nada.')
    guardar(name, valor, f1)
    assert leer(name, f1) == valor
    print(f'Listo: "{name}" quedó cifrada en {os.path.relpath(DB)} (AES-256-GCM). La frase NO se guarda en ningún lado.')


if __name__ == '__main__':
    _main()
