package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

type ctxKey int

const (
	ctxUserID ctxKey = iota
	ctxUsername
)

func withCORS(origin string, next http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, o := range strings.Split(origin, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			allowed[o] = true
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqOrigin := r.Header.Get("Origin")
		if allowed[reqOrigin] || allowed["*"] {
			w.Header().Set("Access-Control-Allow-Origin", reqOrigin)
			w.Header().Set("Vary", "Origin")
		} else if len(allowed) == 1 {
			for o := range allowed {
				w.Header().Set("Access-Control-Allow-Origin", o)
			}
		}
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Guild-Id")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "unauthorized", "missing bearer token")
			return
		}
		claims, err := s.tokens.Parse(strings.TrimPrefix(h, "Bearer "))
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "invalid token")
			return
		}
		ctx := context.WithValue(r.Context(), ctxUserID, claims.UserID)
		ctx = context.WithValue(ctx, ctxUsername, claims.Username)
		next(w, r.WithContext(ctx))
	}
}

func userIDFrom(ctx context.Context) uuid.UUID {
	v, _ := ctx.Value(ctxUserID).(uuid.UUID)
	return v
}

func usernameFrom(ctx context.Context) string {
	v, _ := ctx.Value(ctxUsername).(string)
	return v
}
