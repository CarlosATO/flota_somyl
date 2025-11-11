#!/usr/bin/env python3
"""
Simple runner para desarrollo: intenta iniciar backend (Flask) y frontend (Vite).
Uso: python run.py
"""
import subprocess
import os
import signal
import sys
from pathlib import Path

ROOT = Path(__file__).parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"

procs = []

def start(cmd, cwd):
    print(f"Iniciando: {' '.join(cmd)} (cwd={cwd})")
    p = subprocess.Popen(cmd, cwd=str(cwd))
    procs.append(p)

def stop_all():
    for p in procs:
        try:
            p.terminate()
        except Exception:
            pass

def sigint_handler(sig, frame):
    print("Deteniendo procesos...")
    stop_all()
    sys.exit(0)

if __name__ == '__main__':
    signal.signal(signal.SIGINT, sigint_handler)

    # Backend: ejecutar flask app (espera que exista create_app en backend/app.py)
    start([sys.executable, "-m", "flask", "--app", "backend.app", "run", "--port=5001"], ROOT)

    # Frontend: npm run dev
    start(["npm", "run", "dev"], FRONTEND_DIR)

    # Esperar
    for p in procs:
        p.wait()
