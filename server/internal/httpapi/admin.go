package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (s *Server) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		if !s.isAdmin(r, userIDFrom(r.Context())) {
			writeError(w, http.StatusForbidden, "forbidden", "admin required")
			return
		}
		next(w, r)
	})
}

func (s *Server) handleAdminListGuilds(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "pending"
	}
	rows, err := s.pool.Query(r.Context(), `
		SELECT g.id, g.name, g.verification_status::text, g.created_at,
		       s.flavor, s.region_key, s.realm_name,
		       u.username
		FROM guilds g
		JOIN servers s ON s.id = g.server_id
		LEFT JOIN users u ON u.id = g.created_by
		WHERE g.verification_status::text = $1
		ORDER BY g.created_at`, status)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var (
			id, name, vst, flavor, region, realm string
			created                              time.Time
			creator                              *string
		)
		if err := rows.Scan(&id, &name, &vst, &created, &flavor, &region, &realm, &creator); err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
		cu := ""
		if creator != nil {
			cu = *creator
		}
		list = append(list, map[string]any{
			"id": id, "name": name, "verification_status": vst, "created_at": created,
			"flavor": flavor, "region_key": region, "realm_name": realm, "created_by": cu,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"guilds": list})
}

func (s *Server) handleAdminVerifyGuild(w http.ResponseWriter, r *http.Request) {
	gid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad guild id")
		return
	}
	var req struct {
		Decision  string `json:"decision"` // verify | reject
		RegionKey string `json:"region_key"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid json")
		return
	}
	dec := strings.ToLower(strings.TrimSpace(req.Decision))
	if dec != "verify" && dec != "reject" {
		writeError(w, http.StatusBadRequest, "validation_error", "decision must be verify|reject")
		return
	}
	adminID := userIDFrom(r.Context())

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer tx.Rollback(r.Context())

	var sid uuid.UUID
	err = tx.QueryRow(r.Context(), `SELECT server_id FROM guilds WHERE id = $1 FOR UPDATE`, gid).Scan(&sid)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "guild not found")
		return
	}
	if rk := strings.TrimSpace(req.RegionKey); rk != "" {
		_, err = tx.Exec(r.Context(), `UPDATE servers SET region_key = $1 WHERE id = $2`, rk, sid)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
	}

	if dec == "verify" {
		_, err = tx.Exec(r.Context(), `
			UPDATE guilds
			SET verification_status = 'verified', verified_at = now(), verified_by = $1, updated_at = now()
			WHERE id = $2`, adminID, gid)
	} else {
		_, err = tx.Exec(r.Context(), `
			UPDATE guilds
			SET verification_status = 'rejected', verified_at = now(), verified_by = $1, updated_at = now()
			WHERE id = $2`, adminID, gid)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "verification_status": map[string]string{"verify": "verified", "reject": "rejected"}[dec]})
}

func (s *Server) handleAdminListClaims(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "pending"
	}
	rows, err := s.pool.Query(r.Context(), `
		SELECT a.id, a.guild_id, g.name, a.user_id, u.username,
		       a.character_name, a.realm_name, a.is_leader, a.message, a.status::text, a.created_at,
		       s.flavor, s.region_key, s.realm_name
		FROM guild_claim_applications a
		JOIN guilds g ON g.id = a.guild_id
		JOIN servers s ON s.id = g.server_id
		JOIN users u ON u.id = a.user_id
		WHERE a.status::text = $1
		ORDER BY a.created_at`, status)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var (
			id, gid, gname, uid, username, st, flavor, region, srealm string
			cname, realm, message                                     *string
			isLeader                                                  bool
			created                                                   time.Time
		)
		if err := rows.Scan(&id, &gid, &gname, &uid, &username, &cname, &realm, &isLeader, &message, &st, &created, &flavor, &region, &srealm); err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
		cn, rn, msg := "", "", ""
		if cname != nil {
			cn = *cname
		}
		if realm != nil {
			rn = *realm
		}
		if message != nil {
			msg = *message
		}
		list = append(list, map[string]any{
			"id": id, "guild_id": gid, "guild_name": gname, "user_id": uid, "username": username,
			"character_name": cn, "realm_name": rn, "is_leader": isLeader, "message": msg,
			"status": st, "created_at": created,
			"flavor": flavor, "region_key": region, "server_realm": srealm,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"applications": list})
}

func (s *Server) handleAdminDecideClaim(w http.ResponseWriter, r *http.Request) {
	appID, err := uuid.Parse(r.PathValue("appId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad application id")
		return
	}
	var req struct {
		Decision string `json:"decision"` // approve | reject
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid json")
		return
	}
	dec := strings.ToLower(strings.TrimSpace(req.Decision))
	if dec != "approve" && dec != "reject" {
		writeError(w, http.StatusBadRequest, "validation_error", "decision must be approve|reject")
		return
	}
	adminID := userIDFrom(r.Context())

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer tx.Rollback(r.Context())

	var (
		gid, claimant uuid.UUID
		status        string
	)
	err = tx.QueryRow(r.Context(), `
		SELECT guild_id, user_id, status::text FROM guild_claim_applications
		WHERE id = $1 FOR UPDATE`, appID,
	).Scan(&gid, &claimant, &status)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "application not found")
		return
	}
	if status != "pending" {
		writeError(w, http.StatusConflict, "conflict", "application already decided")
		return
	}

	newStatus := "rejected"
	if dec == "approve" {
		newStatus = "approved"
		// demote existing owners to officer
		_, err = tx.Exec(r.Context(), `
			UPDATE guild_members SET role = 'officer'
			WHERE guild_id = $1 AND role = 'owner' AND user_id <> $2`,
			gid, claimant,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
		_, err = tx.Exec(r.Context(), `
			INSERT INTO guild_members (guild_id, user_id, role) VALUES ($1, $2, 'owner')
			ON CONFLICT (guild_id, user_id) DO UPDATE SET role = 'owner'`,
			gid, claimant,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
		_, err = tx.Exec(r.Context(), `
			UPDATE guilds
			SET verification_status = 'verified', verified_at = now(), verified_by = $1, updated_at = now()
			WHERE id = $2`, adminID, gid)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
	}

	_, err = tx.Exec(r.Context(), `
		UPDATE guild_claim_applications
		SET status = $1::application_status, reviewed_by = $2, reviewed_at = now()
		WHERE id = $3`,
		newStatus, adminID, appID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": newStatus})
}
