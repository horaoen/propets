package app

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type TokenManager struct {
	secret          []byte
	accessTokenTTL  time.Duration
	refreshTokenTTL time.Duration
}

type UserClaims struct {
	UserID int64
	Phone  string
	Role   string
}

type TokenPair struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
}

func NewTokenManager(secret string, accessTTL, refreshTTL time.Duration) *TokenManager {
	return &TokenManager{
		secret:          []byte(secret),
		accessTokenTTL:  accessTTL,
		refreshTokenTTL: refreshTTL,
	}
}

func (m *TokenManager) GenerateTokenPair(claims UserClaims) (TokenPair, string, time.Time, error) {
	now := time.Now()
	accessToken, err := m.generateToken(claims, "access", "", now.Add(m.accessTokenTTL))
	if err != nil {
		return TokenPair{}, "", time.Time{}, err
	}

	refreshID, err := randomHex(24)
	if err != nil {
		return TokenPair{}, "", time.Time{}, err
	}
	refreshExpiry := now.Add(m.refreshTokenTTL)
	refreshToken, err := m.generateToken(claims, "refresh", refreshID, refreshExpiry)
	if err != nil {
		return TokenPair{}, "", time.Time{}, err
	}

	return TokenPair{AccessToken: accessToken, RefreshToken: refreshToken}, refreshID, refreshExpiry, nil
}

func (m *TokenManager) ParseToken(tokenString string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}
	mapClaims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid claims")
	}
	if _, err := mapClaims.GetExpirationTime(); err != nil {
		return nil, err
	}
	return mapClaims, nil
}

func (m *TokenManager) generateToken(claims UserClaims, tokenType, jti string, expiresAt time.Time) (string, error) {
	mapClaims := jwt.MapClaims{
		"sub":   strconv.FormatInt(claims.UserID, 10),
		"phone": claims.Phone,
		"role":  claims.Role,
		"type":  tokenType,
		"exp":   expiresAt.Unix(),
		"iat":   time.Now().Unix(),
	}
	if jti != "" {
		mapClaims["jti"] = jti
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, mapClaims)
	return token.SignedString(m.secret)
}

func randomHex(byteLen int) (string, error) {
	b := make([]byte, byteLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
