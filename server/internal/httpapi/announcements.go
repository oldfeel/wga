package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (s *Server) handleListAnnouncements(w http.ResponseWriter, r *http.Request) {
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
		SELECT a.id, a.title, a.body, a.created_by, u.username, a.created_at, a.updated_at
		FROM announcements a
		LEFT JOIN users u ON u.id = a.created_by
		WHERE a.guild_id = $1
		ORDER BY a.created_at DESC
		LIMIT 100`, gid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var (
			id, title, body string
			createdBy       *uuid.UUID
			username        *string
			created, updated time.Time
		)
		if err := rows.Scan(&id, &title, &body, &createdBy, &username, &created, &updated); err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
		item := map[string]any{
			"id": id, "title": title, "body": body,
			"created_at": created, "updated_at": updated,
		}
		if createdBy != nil {
			item["created_by"] = createdBy.String()
		}
		if username != nil {
			item["author"] = *username
		}
		list = append(list, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"announcements": list})
}

func (s *Server) handleCreateAnnouncement(w http.ResponseWriter, r *http.Request) {
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
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid json")
		return
	}
	title := strings.TrimSpace(req.Title)
	body := strings.TrimSpace(req.Body)
	if title == "" || body == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "title and body required")
		return
	}
	var id uuid.UUID
	var created time.Time
	err = s.pool.QueryRow(r.Context(), `
		INSERT INTO announcements (guild_id, title, body, created_by)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at`,
		gid, title, body, userIDFrom(r.Context()),
	).Scan(&id, &created)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id": id, "title": title, "body": body, "created_at": created,
	})
}
