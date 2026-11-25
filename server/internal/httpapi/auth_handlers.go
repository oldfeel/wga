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
	if len(req.Username) < 3 || len(req.Password) < 6 {
		writeError(w, http.StatusBadRequest, "validation_error", "username >= 3 and password >= 6 required")
		return
	}
	if req.CaptchaID == "" || req.CaptchaCode == "" || !s.captcha.verify(req.CaptchaID, req.CaptchaCode) {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid captcha")
		return
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

	// seed admin if username is in ADMIN_USERNAMES
	for _, a := range s.cfg.AdminUsernames {
		if strings.EqualFold(a, req.Username) {
			_, _ = s.pool.Exec(r.Context(), `UPDATE users SET is_admin = true WHERE id = $1`, id)
			break
		}
	}

	token, err := s.tokens.Issue(id, req.Username)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", "token failed")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"token": token,
		"user": map[string]any{
			"id":           id,
			"username":     req.Username,
			"display_name": req.DisplayName,
			"is_admin":     s.isAdmin(r, id),
		},
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid json")
		return
	}
	var (
		id      uuid.UUID
		hash    string
		name    *string
		isAdmin bool
	)
	err := s.pool.QueryRow(r.Context(),
		`SELECT id, password_hash, display_name, COALESCE(is_admin, false) FROM users WHERE username = $1`,
		strings.TrimSpace(req.Username),
	).Scan(&id, &hash, &name, &isAdmin)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid credentials")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid credentials")
		return
	}
	// refresh admin flag from env list
	for _, a := range s.cfg.AdminUsernames {
		if strings.EqualFold(a, req.Username) && !isAdmin {
			_, _ = s.pool.Exec(r.Context(), `UPDATE users SET is_admin = true WHERE id = $1`, id)
			isAdmin = true
			break
		}
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
			"is_admin":     isAdmin,
		},
	})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	uid := userIDFrom(r.Context())
	var isAdmin bool
	_ = s.pool.QueryRow(r.Context(), `SELECT COALESCE(is_admin, false) FROM users WHERE id = $1`, uid).Scan(&isAdmin)
	for _, a := range s.cfg.AdminUsernames {
		if strings.EqualFold(a, usernameFrom(r.Context())) && !isAdmin {
			_, _ = s.pool.Exec(r.Context(), `UPDATE users SET is_admin = true WHERE id = $1`, uid)
			isAdmin = true
			break
		}
	}

	rows, err := s.pool.Query(r.Context(), `
		SELECT g.id, g.name, g.verification_status::text, gm.role::text, gm.joined_at,
		       s.flavor, s.region_key, s.realm_name
		FROM guild_members gm
		JOIN guilds g ON g.id = gm.guild_id
		JOIN servers s ON s.id = g.server_id
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
			gid, name, vstatus, role, flavor, region, realm string
			joined                                          time.Time
		)
		if err := rows.Scan(&gid, &name, &vstatus, &role, &joined, &flavor, &region, &realm); err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
		guilds = append(guilds, map[string]any{
			"id":                  gid,
			"name":                name,
			"verification_status": vstatus,
			"role":                role,
			"joined_at":           joined,
			"flavor":              flavor,
			"region_key":          region,
			"realm_name":          realm,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user": map[string]any{
			"id":       uid,
			"username": usernameFrom(r.Context()),
			"is_admin": isAdmin,
		},
		"guilds": guilds,
	})
}
