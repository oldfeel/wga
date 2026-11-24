package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

func randomInvite() (string, error) {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func (s *Server) memberRole(r *http.Request, guildID, userID uuid.UUID) (string, bool) {
	var role string
	err := s.pool.QueryRow(r.Context(),
		`SELECT role::text FROM guild_members WHERE guild_id = $1 AND user_id = $2`,
		guildID, userID,
	).Scan(&role)
	if err != nil {
		return "", false
	}
	return role, true
}

func roleAtLeast(role, need string) bool {
	rank := map[string]int{"member": 1, "officer": 2, "owner": 3}
	return rank[role] >= rank[need]
}

func (s *Server) handleCreateGuild(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "name required")
		return
	}
	invite, err := randomInvite()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", "invite failed")
		return
	}
	uid := userIDFrom(r.Context())
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer tx.Rollback(r.Context())

	var gid uuid.UUID
	err = tx.QueryRow(r.Context(),
		`INSERT INTO guilds (name, invite_code, created_by) VALUES ($1, $2, $3) RETURNING id`,
		strings.TrimSpace(req.Name), invite, uid,
	).Scan(&gid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	_, err = tx.Exec(r.Context(),
		`INSERT INTO guild_members (guild_id, user_id, role) VALUES ($1, $2, 'owner')`,
		gid, uid,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":          gid,
		"name":        req.Name,
		"invite_code": invite,
		"role":        "owner",
	})
}

func (s *Server) handleJoinGuild(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InviteCode string `json:"invite_code"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.InviteCode) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "invite_code required")
		return
	}
	uid := userIDFrom(r.Context())
	var gid uuid.UUID
	var name string
	err := s.pool.QueryRow(r.Context(),
		`SELECT id, name FROM guilds WHERE invite_code = $1`,
		strings.TrimSpace(req.InviteCode),
	).Scan(&gid, &name)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "invalid invite code")
		return
	}
	_, err = s.pool.Exec(r.Context(),
		`INSERT INTO guild_members (guild_id, user_id, role) VALUES ($1, $2, 'member')
		 ON CONFLICT (guild_id, user_id) DO NOTHING`,
		gid, uid,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": gid, "name": name, "role": "member"})
}

func (s *Server) handleGetGuild(w http.ResponseWriter, r *http.Request) {
	gid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad guild id")
		return
	}
	if _, ok := s.memberRole(r, gid, userIDFrom(r.Context())); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "not a guild member")
		return
	}
	var name, invite string
	var created time.Time
	err = s.pool.QueryRow(r.Context(),
		`SELECT name, invite_code, created_at FROM guilds WHERE id = $1`, gid,
	).Scan(&name, &invite, &created)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "guild not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id": gid, "name": name, "invite_code": invite, "created_at": created,
	})
}

func (s *Server) handleRotateInvite(w http.ResponseWriter, r *http.Request) {
	gid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad guild id")
		return
	}
	role, ok := s.memberRole(r, gid, userIDFrom(r.Context()))
	if !ok || !roleAtLeast(role, "owner") {
		writeError(w, http.StatusForbidden, "forbidden", "owner required")
		return
	}
	invite, err := randomInvite()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", "invite failed")
		return
	}
	_, err = s.pool.Exec(r.Context(),
		`UPDATE guilds SET invite_code = $1, updated_at = now() WHERE id = $2`,
		invite, gid,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": gid, "invite_code": invite})
}

func (s *Server) handleListMembers(w http.ResponseWriter, r *http.Request) {
	gid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad guild id")
		return
	}
	if _, ok := s.memberRole(r, gid, userIDFrom(r.Context())); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "not a guild member")
		return
	}
	rows, err := s.pool.Query(r.Context(), `
		SELECT u.id, u.username, u.display_name, gm.role::text, gm.joined_at
		FROM guild_members gm
		JOIN users u ON u.id = gm.user_id
		WHERE gm.guild_id = $1
		ORDER BY gm.role DESC, gm.joined_at`, gid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var (
			id, username, role string
			display            *string
			joined             time.Time
		)
		if err := rows.Scan(&id, &username, &display, &role, &joined); err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
		dn := ""
		if display != nil {
			dn = *display
		}
		list = append(list, map[string]any{
			"id": id, "username": username, "display_name": dn, "role": role, "joined_at": joined,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"members": list})
}

func (s *Server) handlePatchMember(w http.ResponseWriter, r *http.Request) {
	gid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad guild id")
		return
	}
	targetID, err := uuid.Parse(r.PathValue("userId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad user id")
		return
	}
	actor := userIDFrom(r.Context())
	role, ok := s.memberRole(r, gid, actor)
	if !ok || !roleAtLeast(role, "owner") {
		writeError(w, http.StatusForbidden, "forbidden", "owner required")
		return
	}
	var req struct {
		Role string `json:"role"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid json")
		return
	}
	newRole := strings.TrimSpace(req.Role)
	if newRole != "owner" && newRole != "officer" && newRole != "member" {
		writeError(w, http.StatusBadRequest, "validation_error", "role must be owner|officer|member")
		return
	}

	var current string
	err = s.pool.QueryRow(r.Context(),
		`SELECT role::text FROM guild_members WHERE guild_id = $1 AND user_id = $2`,
		gid, targetID,
	).Scan(&current)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "member not found")
		return
	}

	// 不能把最后一位 owner 降级
	if current == "owner" && newRole != "owner" {
		var owners int
		_ = s.pool.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM guild_members WHERE guild_id = $1 AND role = 'owner'`, gid,
		).Scan(&owners)
		if owners <= 1 {
			writeError(w, http.StatusConflict, "conflict", "cannot demote the last owner")
			return
		}
	}

	_, err = s.pool.Exec(r.Context(),
		`UPDATE guild_members SET role = $1::guild_role WHERE guild_id = $2 AND user_id = $3`,
		newRole, gid, targetID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "user_id": targetID, "role": newRole})
}
