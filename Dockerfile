# Usar imagen base con Python y Node
FROM nikolaik/python-nodejs:python3.11-nodejs18

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias de Python
COPY requirements.txt ./

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar archivos del frontend
COPY frontend/ ./frontend/

# Instalar dependencias de Node y construir frontend
WORKDIR /app/frontend

# Declarar build args para las variables de entorno de Vite
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Exportarlas como variables de entorno para el build
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm install
RUN npm run build

# --- CAMBIO CLAVE: Mover el build a una carpeta simple ---
# Creamos /app/public y copiamos el contenido de dist ahí
RUN mkdir -p /app/public && cp -r /app/frontend/dist/* /app/public/

# Volver al directorio principal
WORKDIR /app
COPY backend/ ./backend/
COPY run.py ./
COPY Procfile ./

# Exponer puerto por defecto de la app (documentacional)
EXPOSE 5003

# CMD Modificado para leer la variable PORT del entorno
# En plataformas como Railway/Heroku la plataforma proporciona $PORT en runtime.
CMD gunicorn backend.app:app --workers 4 --bind 0.0.0.0:$PORT

