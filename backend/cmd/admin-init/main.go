package main

import (
	"context"
	"fmt"
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

	if err := server.InitFirstAdmin(context.Background(), cfg.AdminInitPhone, cfg.AdminInitPass); err != nil {
		log.Fatal(err)
	}

	fmt.Println("admin init completed")
}
