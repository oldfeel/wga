package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	HTTPAddr     string
	CORSOrigin   string
	DatabaseURL  string
	JWTSecret    string
	JWTTTL       time.Duration
	DBMaxConns   int32
}

func Load() Config {
	ttlHours := envInt("JWT_TTL_HOURS", 168)
	return Config{
		HTTPAddr:    env("HTTP_ADDR", "0.0.0.0:8080"),
		CORSOrigin:  env("CORS_ORIGIN", "http://localhost:5173"),
		DatabaseURL: env("DATABASE_URL", "postgres://wga:change-me@127.0.0.1:5432/wga?sslmode=disable"),
		JWTSecret:   env("JWT_SECRET", "dev-only-change-me"),
		JWTTTL:      time.Duration(ttlHours) * time.Hour,
		DBMaxConns:  int32(envInt("DB_MAX_CONNS", 10)),
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
