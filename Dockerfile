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

# Volver al directorio principal y copiar el backend
WORKDIR /app
COPY backend/ ./backend/
COPY run.py ./
COPY Procfile ./

# Exponer puerto por defecto de la app
EXPOSE 5003

# Comando de inicio
CMD ["gunicorn", "backend.app:app", "--workers", "4", "--bind", "0.0.0.0:5003"]
