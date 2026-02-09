# syntax=docker/dockerfile:1

FROM mydumper/mydumper:v0.21.2-2

# Install Node.js 22.x (LTS) — the mydumper image is AlmaLinux 9 (RHEL-based)
RUN dnf module enable -y nodejs:22 \
    && dnf install -y nodejs npm \
    && dnf clean all

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY src/ src/
RUN npm ci && npm run build && npm prune --omit=dev

# This is just informational. These are the variables that index.js requires.
ENV MYSQL_HOST=""
ENV MYSQL_USER=""
ENV MYSQL_PASSWORD=""
ENV MYSQL_PORT="3306"
ENV MYSQL_DATABASE=""
ENV R2_ACCESS_KEY_ID=""
ENV R2_SECRET_ACCESS_KEY=""
ENV R2_ENDPOINT=""
ENV R2_BUCKET=""
ENV R2_PATH="mysql-backup"

CMD ["node", "dist/index.js"]
