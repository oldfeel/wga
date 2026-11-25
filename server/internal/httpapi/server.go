package httpapi

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shupi-studio/wga/server/internal/auth"
	"github.com/shupi-studio/wga/server/internal/config"
)

type Server struct {
	cfg     config.Config
	pool    *pgxpool.Pool
	tokens  *auth.TokenService
	captcha *captchaStore
}

func New(cfg config.Config, pool *pgxpool.Pool, tokens *auth.TokenService) *Server {
	return &Server{cfg: cfg, pool: pool, tokens: tokens, captcha: newCaptchaStore()}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.handleHealth)

	mux.HandleFunc("GET /api/v1/auth/captcha", s.handleCaptcha)
	mux.HandleFunc("POST /api/v1/auth/register", s.handleRegister)
	mux.HandleFunc("POST /api/v1/auth/login", s.handleLogin)
	mux.HandleFunc("GET /api/v1/auth/me", s.requireAuth(s.handleMe))

	mux.HandleFunc("POST /api/v1/guilds", s.requireAuth(s.handleCreateGuild))
	mux.HandleFunc("POST /api/v1/guilds/join", s.requireAuth(s.handleJoinGuild))
	mux.HandleFunc("GET /api/v1/guilds/{id}", s.requireAuth(s.handleGetGuild))
	mux.HandleFunc("POST /api/v1/guilds/{id}/invite/rotate", s.requireAuth(s.handleRotateInvite))
	mux.HandleFunc("GET /api/v1/guilds/{id}/members", s.requireAuth(s.handleListMembers))
	mux.HandleFunc("PATCH /api/v1/guilds/{id}/members/{userId}", s.requireAuth(s.handlePatchMember))
	mux.HandleFunc("GET /api/v1/guilds/{id}/characters", s.requireAuth(s.handleListCharacters))
	mux.HandleFunc("GET /api/v1/guilds/{id}/characters/{charId}", s.requireAuth(s.handleGetCharacter))
	mux.HandleFunc("PATCH /api/v1/guilds/{id}/characters/{charId}", s.requireAuth(s.handlePatchCharacter))
	mux.HandleFunc("POST /api/v1/guilds/{id}/snapshots", s.requireAuth(s.handleUploadSnapshot))
	mux.HandleFunc("GET /api/v1/snapshots/{id}", s.requireAuth(s.handleGetSnapshot))

	mux.HandleFunc("GET /api/v1/guilds/{id}/activities", s.requireAuth(s.handleListActivities))
	mux.HandleFunc("POST /api/v1/guilds/{id}/activities", s.requireAuth(s.handleCreateActivity))
	mux.HandleFunc("GET /api/v1/activities/{id}", s.requireAuth(s.handleGetActivity))
	mux.HandleFunc("PATCH /api/v1/activities/{id}", s.requireAuth(s.handlePatchActivity))
	mux.HandleFunc("POST /api/v1/activities/{id}/signups", s.requireAuth(s.handleSignup))
	mux.HandleFunc("POST /api/v1/activities/{id}/check-in", s.requireAuth(s.handleCheckIn))
	mux.HandleFunc("PUT /api/v1/activities/{id}/roster", s.requireAuth(s.handlePutRoster))

	mux.HandleFunc("GET /api/v1/guilds/{id}/announcements", s.requireAuth(s.handleListAnnouncements))
	mux.HandleFunc("POST /api/v1/guilds/{id}/announcements", s.requireAuth(s.handleCreateAnnouncement))

	return withCORS(s.cfg.CORSOrigin, mux)
}
