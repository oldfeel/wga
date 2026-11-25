package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type registerReq struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
	CaptchaID   string `json:"captcha_id"`
	CaptchaCode string `json:"captcha_code"`
	InviteCode  string `json:"invite_code"`
}

type loginReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid json")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.CaptchaID = strings.TrimSpace(req.CaptchaID)
	req.CaptchaCode = strings.TrimSpace(req.CaptchaCode)
	req.InviteCode = strings.TrimSpace(req.InviteCode)
	if len(req.Username) < 3 || len(req.Password) < 6 {
		writeError(w, http.StatusBadRequest, "validation_error", "username >= 3 and password >= 6 required")
		return
	}
	if req.CaptchaID == "" || req.CaptchaCode == "" || !s.captcha.verify(req.CaptchaID, req.CaptchaCode) {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid captcha")
		return
	}

	var inviteGuildID uuid.UUID
	var inviteGuildName string
	if req.InviteCode != "" {
		err := s.pool.QueryRow(r.Context(),
			`SELECT id, name FROM guilds WHERE invite_code = $1`, req.InviteCode,
		).Scan(&inviteGuildID, &inviteGuildName)
		if err != nil {
			writeError(w, http.StatusBadRequest, "validation_error", "invalid invite_code")
			return
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", "hash failed")
		return
	}
	var id uuid.UUID
	err = s.pool.QueryRow(r.Context(),
		`INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, NULLIF($3, '')) RETURNING id`,
		req.Username, string(hash), strings.TrimSpace(req.DisplayName),
	).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			writeError(w, http.StatusConflict, "conflict", "username taken")
			return
		}
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}

	var joinedGuild map[string]any
	if req.InviteCode != "" {
		_, err = s.pool.Exec(r.Context(),
			`INSERT INTO guild_members (guild_id, user_id, role) VALUES ($1, $2, 'member')
			 ON CONFLICT (guild_id, user_id) DO NOTHING`,
			inviteGuildID, id,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
		joinedGuild = map[string]any{"id": inviteGuildID, "name": inviteGuildName, "role": "member"}
	}

	token, err := s.tokens.Issue(id, req.Username)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", "token failed")
		return
	}
	out := map[string]any{
		"token": token,
		"user": map[string]any{
			"id":           id,
			"username":     req.Username,
			"display_name": req.DisplayName,
		},
	}
	if joinedGuild != nil {
		out["guild"] = joinedGuild
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid json")
		return
	}
	var (
		id   uuid.UUID
		hash string
		name *string
	)
	err := s.pool.QueryRow(r.Context(),
		`SELECT id, password_hash, display_name FROM users WHERE username = $1`,
		strings.TrimSpace(req.Username),
	).Scan(&id, &hash, &name)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid credentials")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid credentials")
		return
	}
	token, err := s.tokens.Issue(id, req.Username)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", "token failed")
		return
	}
	dn := ""
	if name != nil {
		dn = *name
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user": map[string]any{
			"id":           id,
			"username":     req.Username,
			"display_name": dn,
		},
	})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	uid := userIDFrom(r.Context())
	rows, err := s.pool.Query(r.Context(), `
		SELECT g.id, g.name, g.invite_code, gm.role, gm.joined_at
		FROM guild_members gm
		JOIN guilds g ON g.id = gm.guild_id
		WHERE gm.user_id = $1
		ORDER BY gm.joined_at`, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer rows.Close()

	guilds := []map[string]any{}
	for rows.Next() {
		var (
			gid, name, invite, role string
			joined                  time.Time
		)
		if err := rows.Scan(&gid, &name, &invite, &role, &joined); err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
		guilds = append(guilds, map[string]any{
			"id":          gid,
			"name":        name,
			"invite_code": invite,
			"role":        role,
			"joined_at":   joined,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user": map[string]any{
			"id":       uid,
			"username": usernameFrom(r.Context()),
		},
		"guilds": guilds,
	})
}
