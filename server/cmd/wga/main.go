package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/shupi-studio/wga/server/internal/auth"
	"github.com/shupi-studio/wga/server/internal/config"
	"github.com/shupi-studio/wga/server/internal/db"
	"github.com/shupi-studio/wga/server/internal/httpapi"
)

func main() {
	config.LoadDotEnv(config.DefaultDotEnvPaths()...)
	cfg := config.Load()
	ctx := context.Background()

	pool, err := db.Connect(ctx, cfg.DatabaseURL, cfg.DBMaxConns)
	if err != nil {
		log.Fatalf("database: %v\nHint: install PostgreSQL locally, create db/user wga, run server/migrations/000001_init.up.sql", err)
	}
	defer pool.Close()

	tokens := auth.NewTokenService(cfg.JWTSecret, cfg.JWTTTL)
	srv := httpapi.New(cfg, pool, tokens)

	httpServer := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("WGA API listening on %s", cfg.HTTPAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdownCtx)
	log.Println("shutdown complete")
}
