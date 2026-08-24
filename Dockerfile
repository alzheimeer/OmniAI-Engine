FROM node:20-bullseye-slim

# Instalar dependencias del SO necesarias para Puppeteer (Chromium) y FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    chromium \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# Configurar Puppeteer para usar el Chromium instalado nativamente en Debian
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Directorio de trabajo
WORKDIR /usr/src/app

# Instalar dependencias de Node
COPY package*.json ./
RUN npm install

# Copiar el resto del código y compilar TypeScript
COPY . .
RUN npm run build

# Comando de arranque
CMD ["npm", "start"]
