package app

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	AppPort          string
	DBHost           string
	DBPort           string
	DBName           string
	DBUser           string
	DBPassword       string
	JWTSecret        string
	AccessTokenTTL   time.Duration
	RefreshTokenTTL  time.Duration
	AdminInitPhone   string
	AdminInitPass    string
	AdminInitEnabled bool
}

func LoadConfig() Config {
	return Config{
		AppPort:          getEnv("APP_PORT", "8080"),
		DBHost:           getEnv("DB_HOST", "127.0.0.1"),
		DBPort:           getEnv("DB_PORT", "3306"),
		DBName:           getEnv("DB_NAME", "pet_rescue"),
		DBUser:           getEnv("DB_USER", "pet_user"),
		DBPassword:       getEnv("DB_PASSWORD", "pet_password"),
		JWTSecret:        getEnv("JWT_SECRET", "dev_jwt_secret_change_me"),
		AccessTokenTTL:   time.Duration(getEnvInt("ACCESS_TOKEN_TTL_MIN", 15)) * time.Minute,
		RefreshTokenTTL:  time.Duration(getEnvInt("REFRESH_TOKEN_TTL_HOUR", 168)) * time.Hour,
		AdminInitPhone:   os.Getenv("ADMIN_INIT_PHONE"),
		AdminInitPass:    os.Getenv("ADMIN_INIT_PASSWORD"),
		AdminInitEnabled: getEnvBool("ADMIN_INIT_ENABLED", false),
	}
}

func (c Config) DSN() string {
	return c.DBUser + ":" + c.DBPassword + "@tcp(" + c.DBHost + ":" + c.DBPort + ")/" + c.DBName + "?parseTime=true&charset=utf8mb4&loc=Asia%2FShanghai"
}

func getEnv(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return i
}

func getEnvBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}
