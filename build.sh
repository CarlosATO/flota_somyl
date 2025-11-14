#!/bin/bash
set -e

echo "=== Installing Python dependencies ==="
pip install -r requirements.txt

echo "=== Building Frontend ==="
cd frontend
npm ci
npm run build
cd ..

echo "=== Verifying dist directory ==="
if [ -d "frontend/dist" ]; then
    echo "✅ frontend/dist exists"
    ls -la frontend/dist
else
    echo "❌ frontend/dist does not exist"
    exit 1
fi

echo "=== Build completed successfully ==="
