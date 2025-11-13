#!/usr/bin/env python3
import os, sys
from dotenv import load_dotenv
load_dotenv()

url = os.getenv('PROYECTOS_SUPABASE_URL')
key = os.getenv('PROYECTOS_SUPABASE_KEY')
print(f'PROYECTOS_SUPABASE_URL set: {bool(url)}')
print(f'PROYECTOS_SUPABASE_KEY set: {bool(key)}')
print('URL:', url)
# Do not print the key fully for safety; show length if present
print('KEY length:', len(key) if key else 0)

try:
    from supabase import create_client
except Exception as e:
    print('ERROR: no se pudo importar supabase.create_client ->', e)
    sys.exit(3)

if not url or not key:
    print('ERROR: faltan variables de entorno PROYECTOS_SUPABASE_URL/KEY')
    sys.exit(2)

try:
    client = create_client(url, key)
    print('Supabase client creado.')
except Exception as e:
    print('ERROR creando cliente Supabase ->', e)
    sys.exit(4)

for tbl in ('orden_compra', 'proyectos'):
    try:
        print('\nProbando tabla:', tbl)
        res = client.table(tbl).select('*').limit(3).execute()
        # res may have .data or .error
        data = getattr(res, 'data', None)
        error = getattr(res, 'error', None)
        print('  data rows:', len(data) if data else 0)
        print('  res repr:', repr(res))
        if error:
            print('  error:', error)
    except Exception as e:
        print('  EXCEPCION al consultar tabla', tbl, '->', e)

print('\nScript finalizado.')
