FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/server ./cmd/server

FROM alpine:3.20

RUN apk add --no-cache ca-certificates wget tzdata

WORKDIR /app
COPY --from=builder /out/server /app/server

EXPOSE 8080

CMD ["/app/server"]
