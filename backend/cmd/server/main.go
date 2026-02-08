package main

import (
	"log"

	"propets/backend/internal/app"
)

func main() {
	cfg := app.LoadConfig()

	server, err := app.NewServer(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer server.Close()

	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
