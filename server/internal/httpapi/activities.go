package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (s *Server) handleListActivities(w http.ResponseWriter, r *http.Request) {
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
		SELECT id, title, description, starts_at, ends_at, status::text, created_at
		FROM activities WHERE guild_id = $1 ORDER BY starts_at DESC`, gid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var (
			id, title, status string
			desc              *string
			starts            time.Time
			ends              *time.Time
			created           time.Time
		)
		if err := rows.Scan(&id, &title, &desc, &starts, &ends, &status, &created); err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
		list = append(list, map[string]any{
			"id": id, "title": title, "description": desc,
			"starts_at": starts, "ends_at": ends, "status": status, "created_at": created,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"activities": list})
}

func (s *Server) handleCreateActivity(w http.ResponseWriter, r *http.Request) {
	gid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad guild id")
		return
	}
	role, ok := s.memberRole(r, gid, userIDFrom(r.Context()))
	if !ok || !roleAtLeast(role, "officer") {
		writeError(w, http.StatusForbidden, "forbidden", "officer or owner required")
		return
	}
	var req struct {
		Title       string     `json:"title"`
		Description string     `json:"description"`
		StartsAt    time.Time  `json:"starts_at"`
		EndsAt      *time.Time `json:"ends_at"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Title) == "" || req.StartsAt.IsZero() {
		writeError(w, http.StatusBadRequest, "validation_error", "title and starts_at required")
		return
	}
	var id uuid.UUID
	err = s.pool.QueryRow(r.Context(), `
		INSERT INTO activities (guild_id, title, description, starts_at, ends_at, created_by)
		VALUES ($1,$2,NULLIF($3,''),$4,$5,$6) RETURNING id`,
		gid, strings.TrimSpace(req.Title), req.Description, req.StartsAt, req.EndsAt, userIDFrom(r.Context()),
	).Scan(&id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (s *Server) handlePatchActivity(w http.ResponseWriter, r *http.Request) {
	aid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad activity id")
		return
	}
	var gid uuid.UUID
	if err := s.pool.QueryRow(r.Context(), `SELECT guild_id FROM activities WHERE id = $1`, aid).Scan(&gid); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "activity not found")
		return
	}
	role, ok := s.memberRole(r, gid, userIDFrom(r.Context()))
	if !ok || !roleAtLeast(role, "officer") {
		writeError(w, http.StatusForbidden, "forbidden", "officer or owner required")
		return
	}
	var req struct {
		Title       *string    `json:"title"`
		Description *string    `json:"description"`
		StartsAt    *time.Time `json:"starts_at"`
		EndsAt      *time.Time `json:"ends_at"`
		Status      *string    `json:"status"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid json")
		return
	}
	_, err = s.pool.Exec(r.Context(), `
		UPDATE activities SET
			title = COALESCE($1, title),
			description = COALESCE($2, description),
			starts_at = COALESCE($3, starts_at),
			ends_at = COALESCE($4, ends_at),
			status = COALESCE($5::activity_status, status),
			updated_at = now()
		WHERE id = $6`,
		req.Title, req.Description, req.StartsAt, req.EndsAt, req.Status, aid,
	)
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleGetActivity(w http.ResponseWriter, r *http.Request) {
	aid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad activity id")
		return
	}
	var (
		gid                     uuid.UUID
		title, status           string
		desc                    *string
		starts                  time.Time
		ends                    *time.Time
	)
	err = s.pool.QueryRow(r.Context(), `
		SELECT guild_id, title, description, starts_at, ends_at, status::text
		FROM activities WHERE id = $1`, aid,
	).Scan(&gid, &title, &desc, &starts, &ends, &status)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "activity not found")
		return
	}
	if _, ok := s.memberRole(r, gid, userIDFrom(r.Context())); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "not a guild member")
		return
	}

	srows, err := s.pool.Query(r.Context(), `
		SELECT id, user_id, character_id, status::text, note, signed_at, checked_in_at
		FROM activity_signups WHERE activity_id = $1`, aid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer srows.Close()
	signups := []map[string]any{}
	for srows.Next() {
		var (
			id, uid, st string
			cid, note   *string
			signed      time.Time
			checked     *time.Time
		)
		if err := srows.Scan(&id, &uid, &cid, &st, &note, &signed, &checked); err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
		signups = append(signups, map[string]any{
			"id": id, "user_id": uid, "character_id": cid, "status": st,
			"note": note, "signed_at": signed, "checked_in_at": checked,
		})
	}

	rrows, err := s.pool.Query(r.Context(), `
		SELECT id, character_id, user_id, group_name, slot_role, sort_order, note
		FROM activity_rosters WHERE activity_id = $1 ORDER BY sort_order`, aid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer rrows.Close()
	roster := []map[string]any{}
	for rrows.Next() {
		var (
			id                 string
			cid, uid           *string
			group, slot, note  *string
			sort               int
		)
		if err := rrows.Scan(&id, &cid, &uid, &group, &slot, &sort, &note); err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
		roster = append(roster, map[string]any{
			"id": id, "character_id": cid, "user_id": uid,
			"group_name": group, "slot_role": slot, "sort_order": sort, "note": note,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id": aid, "guild_id": gid, "title": title, "description": desc,
		"starts_at": starts, "ends_at": ends, "status": status,
		"signups": signups, "roster": roster,
	})
}

func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	aid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad activity id")
		return
	}
	var gid uuid.UUID
	if err := s.pool.QueryRow(r.Context(), `SELECT guild_id FROM activities WHERE id = $1`, aid).Scan(&gid); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "activity not found")
		return
	}
	if _, ok := s.memberRole(r, gid, userIDFrom(r.Context())); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "not a guild member")
		return
	}
	var req struct {
		CharacterID *uuid.UUID `json:"character_id"`
		Status      string     `json:"status"`
		Note        string     `json:"note"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid json")
		return
	}
	st := req.Status
	if st == "" {
		st = "signed"
	}
	uid := userIDFrom(r.Context())
	var id uuid.UUID
	err = s.pool.QueryRow(r.Context(), `
		INSERT INTO activity_signups (activity_id, user_id, character_id, status, note)
		VALUES ($1,$2,$3,$4::signup_status,NULLIF($5,''))
		ON CONFLICT (activity_id, user_id) DO UPDATE SET
			character_id = EXCLUDED.character_id,
			status = EXCLUDED.status,
			note = EXCLUDED.note,
			signed_at = now()
		RETURNING id`,
		aid, uid, req.CharacterID, st, req.Note,
	).Scan(&id)
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id})
}

func (s *Server) handleCheckIn(w http.ResponseWriter, r *http.Request) {
	aid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad activity id")
		return
	}
	var gid uuid.UUID
	if err := s.pool.QueryRow(r.Context(), `SELECT guild_id FROM activities WHERE id = $1`, aid).Scan(&gid); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "activity not found")
		return
	}
	role, ok := s.memberRole(r, gid, userIDFrom(r.Context()))
	if !ok {
		writeError(w, http.StatusForbidden, "forbidden", "not a guild member")
		return
	}
	var req struct {
		UserID *uuid.UUID `json:"user_id"`
	}
	_ = decodeJSON(r, &req)
	target := userIDFrom(r.Context())
	if req.UserID != nil {
		if !roleAtLeast(role, "officer") && *req.UserID != target {
			writeError(w, http.StatusForbidden, "forbidden", "cannot check in others")
			return
		}
		target = *req.UserID
	}
	tag, err := s.pool.Exec(r.Context(), `
		UPDATE activity_signups
		SET status = 'checked_in', checked_in_at = now()
		WHERE activity_id = $1 AND user_id = $2`, aid, target)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "signup not found; sign up first")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handlePutRoster(w http.ResponseWriter, r *http.Request) {
	aid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad activity id")
		return
	}
	var gid uuid.UUID
	if err := s.pool.QueryRow(r.Context(), `SELECT guild_id FROM activities WHERE id = $1`, aid).Scan(&gid); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "activity not found")
		return
	}
	role, ok := s.memberRole(r, gid, userIDFrom(r.Context()))
	if !ok || !roleAtLeast(role, "officer") {
		writeError(w, http.StatusForbidden, "forbidden", "officer or owner required")
		return
	}
	var req struct {
		Roster []struct {
			CharacterID *uuid.UUID `json:"character_id"`
			UserID      *uuid.UUID `json:"user_id"`
			GroupName   string     `json:"group_name"`
			SlotRole    string     `json:"slot_role"`
			SortOrder   int        `json:"sort_order"`
			Note        string     `json:"note"`
		} `json:"roster"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid json")
		return
	}
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer tx.Rollback(r.Context())
	if _, err := tx.Exec(r.Context(), `DELETE FROM activity_rosters WHERE activity_id = $1`, aid); err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	for _, row := range req.Roster {
		_, err := tx.Exec(r.Context(), `
			INSERT INTO activity_rosters (activity_id, character_id, user_id, group_name, slot_role, sort_order, note)
			VALUES ($1,$2,$3,NULLIF($4,''),NULLIF($5,''),$6,NULLIF($7,''))`,
			aid, row.CharacterID, row.UserID, row.GroupName, row.SlotRole, row.SortOrder, row.Note,
		)
		if err != nil {
			writeError(w, http.StatusBadRequest, "validation_error", err.Error())
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "count": len(req.Roster)})
}
