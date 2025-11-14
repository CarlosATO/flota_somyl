# Usar imagen base con Python y Node
FROM nikolaik/python-nodejs:python3.11-nodejs18

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY requirements.txt ./
COPY frontend/package*.json ./frontend/

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Instalar dependencias de Node y construir frontend
WORKDIR /app/frontend
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Volver al directorio principal y copiar todo
WORKDIR /app
COPY . .

# Exponer puerto
EXPOSE 8080

# Comando de inicio
CMD ["gunicorn", "backend.app:app", "--workers", "4", "--bind", "0.0.0.0:8080"]
