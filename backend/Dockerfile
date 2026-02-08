ARG DOCKER_MIRROR_PREFIX=docker.m.daocloud.io/library/

FROM ${DOCKER_MIRROR_PREFIX}golang:1.22-alpine AS builder

WORKDIR /app

ARG GO_PROXY=https://goproxy.cn,direct
ARG GO_SUMDB=sum.golang.google.cn
ENV GOPROXY=${GO_PROXY}
ENV GOSUMDB=${GO_SUMDB}

COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/server ./cmd/server

FROM ${DOCKER_MIRROR_PREFIX}alpine:3.20

RUN apk add --no-cache ca-certificates wget tzdata

WORKDIR /app
COPY --from=builder /out/server /app/server

EXPOSE 8080

CMD ["/app/server"]
