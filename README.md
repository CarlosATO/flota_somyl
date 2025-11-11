# Flotas - Esqueleto de proyecto

Este repositorio contiene el esqueleto inicial para la aplicación de gestión de flotas.

Stack replicado de referencia:
- Backend: Flask
- Frontend: React + Vite
- DB: Supabase (configurable mediante variables de entorno)

Para desarrollo local:

1. Backend

   python -m venv .venv
   source .venv/bin/activate
   pip install -r backend/requirements.txt

2. Frontend

   cd frontend
   npm install
   npm run dev

3. Opcional: ejecutar `python run.py` desde la raíz para iniciar ambos (script simple incluido).

Variables de entorno (colocar en `.env` en la raíz o en `backend/`):

- SUPABASE_URL
- SUPABASE_KEY
- SECRET_KEY

Nota: no subir `.env` a git.
