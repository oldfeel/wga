package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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

func (s *Server) isAdmin(r *http.Request, userID uuid.UUID) bool {
	var ok bool
	_ = s.pool.QueryRow(r.Context(),
		`SELECT is_admin FROM users WHERE id = $1`, userID,
	).Scan(&ok)
	return ok
}

type serverIdentity struct {
	Flavor     string `json:"flavor"`
	RegionKey  string `json:"region_key"`
	RealmName  string `json:"realm_name"`
	GuildName  string `json:"name"`
}

func parseServerIdentity(flavor, region, realm, name string) (serverIdentity, bool) {
	id := serverIdentity{
		Flavor:    strings.TrimSpace(flavor),
		RegionKey: strings.TrimSpace(region),
		RealmName: strings.TrimSpace(realm),
		GuildName: strings.TrimSpace(name),
	}
	if id.Flavor == "" {
		id.Flavor = "forever"
	}
	if id.RegionKey == "" {
		id.RegionKey = "UNKNOWN"
	}
	if id.RealmName == "" || id.GuildName == "" {
		return id, false
	}
	return id, true
}

func (s *Server) upsertServer(r *http.Request, tx pgx.Tx, flavor, region, realm string) (uuid.UUID, error) {
	var sid uuid.UUID
	err := tx.QueryRow(r.Context(), `
		INSERT INTO servers (flavor, region_key, realm_name)
		VALUES ($1, $2, $3)
		ON CONFLICT (flavor, region_key, realm_name) DO UPDATE SET flavor = EXCLUDED.flavor
		RETURNING id`,
		flavor, region, realm,
	).Scan(&sid)
	return sid, err
}

func (s *Server) handleLookupGuild(w http.ResponseWriter, r *http.Request) {
	id, ok := parseServerIdentity(
		r.URL.Query().Get("flavor"),
		r.URL.Query().Get("region_key"),
		r.URL.Query().Get("realm_name"),
		r.URL.Query().Get("guild_name"),
	)
	if !ok {
		// also accept name=
		if gn := r.URL.Query().Get("name"); gn != "" {
			id.GuildName = strings.TrimSpace(gn)
			ok = id.RealmName != "" && id.GuildName != ""
		}
	}
	if !ok {
		writeError(w, http.StatusBadRequest, "validation_error", "flavor/region_key/realm_name/guild_name required")
		return
	}

	uid := userIDFrom(r.Context())
	var (
		gid, name, vstatus string
		sid                uuid.UUID
	)
	err := s.pool.QueryRow(r.Context(), `
		SELECT g.id, g.name, g.verification_status::text, g.server_id
		FROM guilds g
		JOIN servers s ON s.id = g.server_id
		WHERE s.flavor = $1
		  AND lower(btrim(s.region_key)) = lower(btrim($2))
		  AND lower(btrim(s.realm_name)) = lower(btrim($3))
		  AND lower(btrim(g.name)) = lower(btrim($4))
		LIMIT 1`,
		id.Flavor, id.RegionKey, id.RealmName, id.GuildName,
	).Scan(&gid, &name, &vstatus, &sid)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":      "not_found",
			"flavor":      id.Flavor,
			"region_key":  id.RegionKey,
			"realm_name":  id.RealmName,
			"guild_name":  id.GuildName,
		})
		return
	}

	role, isMember := s.memberRole(r, uuid.MustParse(gid), uid)
	writeJSON(w, http.StatusOK, map[string]any{
		"status":              "found",
		"id":                  gid,
		"name":                name,
		"verification_status": vstatus,
		"flavor":              id.Flavor,
		"region_key":          id.RegionKey,
		"realm_name":          id.RealmName,
		"is_member":           isMember,
		"role":                role,
		"is_owner":            role == "owner",
	})
}

func (s *Server) handleCreateGuild(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name      string `json:"name"`
		Flavor    string `json:"flavor"`
		RegionKey string `json:"region_key"`
		RealmName string `json:"realm_name"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid json")
		return
	}
	id, ok := parseServerIdentity(req.Flavor, req.RegionKey, req.RealmName, req.Name)
	if !ok {
		writeError(w, http.StatusBadRequest, "validation_error", "name, realm_name required (flavor/region_key optional)")
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

	sid, err := s.upsertServer(r, tx, id.Flavor, id.RegionKey, id.RealmName)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}

	// already exists?
	var existing uuid.UUID
	err = tx.QueryRow(r.Context(), `
		SELECT id FROM guilds
		WHERE server_id = $1 AND lower(btrim(name)) = lower(btrim($2))`,
		sid, id.GuildName,
	).Scan(&existing)
	if err == nil {
		writeError(w, http.StatusConflict, "conflict", "guild already exists; apply to join or claim")
		return
	}

	var gid uuid.UUID
	err = tx.QueryRow(r.Context(),
		`INSERT INTO guilds (name, invite_code, created_by, server_id, verification_status)
		 VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
		id.GuildName, invite, uid, sid,
	).Scan(&gid)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			writeError(w, http.StatusConflict, "conflict", "guild already exists")
			return
		}
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
		"id":                  gid,
		"name":                id.GuildName,
		"role":                "owner",
		"verification_status": "pending",
		"flavor":              id.Flavor,
		"region_key":          id.RegionKey,
		"realm_name":          id.RealmName,
	})
}

func (s *Server) handleJoinGuild(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusGone, "gone", "invite join disabled; use join application")
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
	var (
		name, vstatus, flavor, region, realm string
		created                              time.Time
		verifiedAt                           *time.Time
	)
	err = s.pool.QueryRow(r.Context(), `
		SELECT g.name, g.verification_status::text, g.created_at, g.verified_at,
		       s.flavor, s.region_key, s.realm_name
		FROM guilds g
		JOIN servers s ON s.id = g.server_id
		WHERE g.id = $1`, gid,
	).Scan(&name, &vstatus, &created, &verifiedAt, &flavor, &region, &realm)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "guild not found")
		return
	}
	out := map[string]any{
		"id":                  gid,
		"name":                name,
		"verification_status": vstatus,
		"created_at":          created,
		"flavor":              flavor,
		"region_key":          region,
		"realm_name":          realm,
	}
	if verifiedAt != nil {
		out["verified_at"] = verifiedAt
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleRotateInvite(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusGone, "gone", "invite codes disabled")
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

func (s *Server) handleCreateJoinApplication(w http.ResponseWriter, r *http.Request) {
	gid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad guild id")
		return
	}
	uid := userIDFrom(r.Context())
	if _, ok := s.memberRole(r, gid, uid); ok {
		writeError(w, http.StatusConflict, "conflict", "already a member")
		return
	}
	var exists bool
	_ = s.pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM guilds WHERE id = $1)`, gid).Scan(&exists)
	if !exists {
		writeError(w, http.StatusNotFound, "not_found", "guild not found")
		return
	}
	var req struct {
		Message string `json:"message"`
	}
	_ = decodeJSON(r, &req)

	var appID uuid.UUID
	err = s.pool.QueryRow(r.Context(), `
		INSERT INTO guild_join_applications (guild_id, user_id, message)
		VALUES ($1, $2, NULLIF($3, ''))
		RETURNING id`,
		gid, uid, strings.TrimSpace(req.Message),
	).Scan(&appID)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			writeError(w, http.StatusConflict, "conflict", "pending application already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": appID, "status": "pending"})
}

func (s *Server) handleListJoinApplications(w http.ResponseWriter, r *http.Request) {
	gid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad guild id")
		return
	}
	role, ok := s.memberRole(r, gid, userIDFrom(r.Context()))
	if !ok || !roleAtLeast(role, "officer") {
		writeError(w, http.StatusForbidden, "forbidden", "officer required")
		return
	}
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "pending"
	}
	rows, err := s.pool.Query(r.Context(), `
		SELECT a.id, a.user_id, u.username, u.display_name, a.status::text, a.message, a.created_at
		FROM guild_join_applications a
		JOIN users u ON u.id = a.user_id
		WHERE a.guild_id = $1 AND a.status::text = $2
		ORDER BY a.created_at`, gid, status)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var (
			id, userID, username, st string
			display, message         *string
			created                  time.Time
		)
		if err := rows.Scan(&id, &userID, &username, &display, &st, &message, &created); err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
		dn, msg := "", ""
		if display != nil {
			dn = *display
		}
		if message != nil {
			msg = *message
		}
		list = append(list, map[string]any{
			"id": id, "user_id": userID, "username": username, "display_name": dn,
			"status": st, "message": msg, "created_at": created,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"applications": list})
}

func (s *Server) handleDecideJoinApplication(w http.ResponseWriter, r *http.Request) {
	gid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad guild id")
		return
	}
	appID, err := uuid.Parse(r.PathValue("appId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad application id")
		return
	}
	actor := userIDFrom(r.Context())
	role, ok := s.memberRole(r, gid, actor)
	if !ok || !roleAtLeast(role, "officer") {
		writeError(w, http.StatusForbidden, "forbidden", "officer required")
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

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer tx.Rollback(r.Context())

	var applicant uuid.UUID
	var status string
	err = tx.QueryRow(r.Context(), `
		SELECT user_id, status::text FROM guild_join_applications
		WHERE id = $1 AND guild_id = $2 FOR UPDATE`,
		appID, gid,
	).Scan(&applicant, &status)
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
		_, err = tx.Exec(r.Context(), `
			INSERT INTO guild_members (guild_id, user_id, role) VALUES ($1, $2, 'member')
			ON CONFLICT (guild_id, user_id) DO NOTHING`,
			gid, applicant,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
	}
	_, err = tx.Exec(r.Context(), `
		UPDATE guild_join_applications
		SET status = $1::application_status, reviewed_by = $2, reviewed_at = now()
		WHERE id = $3`,
		newStatus, actor, appID,
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

func (s *Server) handleCreateClaimApplication(w http.ResponseWriter, r *http.Request) {
	gid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad guild id")
		return
	}
	uid := userIDFrom(r.Context())
	role, isMember := s.memberRole(r, gid, uid)
	if isMember && role == "owner" {
		writeError(w, http.StatusConflict, "conflict", "already owner")
		return
	}
	var exists bool
	_ = s.pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM guilds WHERE id = $1)`, gid).Scan(&exists)
	if !exists {
		writeError(w, http.StatusNotFound, "not_found", "guild not found")
		return
	}
	var req struct {
		IsLeader      bool   `json:"is_leader"`
		CharacterName string `json:"character_name"`
		RealmName     string `json:"realm_name"`
		Message       string `json:"message"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid json")
		return
	}
	if !req.IsLeader {
		writeError(w, http.StatusBadRequest, "validation_error", "is_leader required (game guild master)")
		return
	}

	var appID uuid.UUID
	err = s.pool.QueryRow(r.Context(), `
		INSERT INTO guild_claim_applications
			(guild_id, user_id, character_name, realm_name, is_leader, message)
		VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), true, NULLIF($5, ''))
		RETURNING id`,
		gid, uid, strings.TrimSpace(req.CharacterName), strings.TrimSpace(req.RealmName), strings.TrimSpace(req.Message),
	).Scan(&appID)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			writeError(w, http.StatusConflict, "conflict", "pending claim already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": appID, "status": "pending"})
}
