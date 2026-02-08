ARG DOCKER_MIRROR_PREFIX=docker.m.daocloud.io/library/

FROM ${DOCKER_MIRROR_PREFIX}node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ${DOCKER_MIRROR_PREFIX}nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
