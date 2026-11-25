package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
)

type snapshotPayload struct {
	SchemaVersion int             `json:"schema_version"`
	AddonVersion  string          `json:"addon_version"`
	ClientVersion *string         `json:"client_version"`
	CapturedAt    time.Time       `json:"captured_at"`
	Character     snapshotChar    `json:"character"`
	Equipment     json.RawMessage `json:"equipment"`
	Talents       json.RawMessage `json:"talents"`
	Lockouts      json.RawMessage `json:"lockouts"`
	Professions   json.RawMessage `json:"professions"`
	Availability  *string         `json:"availability_note"`
}

type snapshotChar struct {
	Name      string   `json:"name"`
	Realm     string   `json:"realm"`
	Race      string   `json:"race"`
	Class     string   `json:"class"`
	Spec      string   `json:"spec"`
	Level     int      `json:"level"`
	ItemLevel *float64 `json:"item_level"`
}

func (s *Server) handleUploadSnapshot(w http.ResponseWriter, r *http.Request) {
	gid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad guild id")
		return
	}
	uid := userIDFrom(r.Context())
	if _, ok := s.memberRole(r, gid, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "not a guild member")
		return
	}

	var payload snapshotPayload
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid snapshot json")
		return
	}
	if payload.SchemaVersion != 1 || payload.Character.Name == "" || payload.Character.Realm == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "schema_version=1 and character name/realm required")
		return
	}
	if payload.CapturedAt.IsZero() {
		payload.CapturedAt = time.Now()
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", "marshal failed")
		return
	}

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer tx.Rollback(r.Context())

	var charID uuid.UUID
	err = tx.QueryRow(r.Context(), `
		INSERT INTO characters (
			guild_id, owner_user_id, name, realm, race, class, spec, level, item_level,
			availability_note, last_snapshot_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
		ON CONFLICT (guild_id, realm, name) DO UPDATE SET
			owner_user_id = COALESCE(characters.owner_user_id, EXCLUDED.owner_user_id),
			race = EXCLUDED.race,
			class = EXCLUDED.class,
			spec = EXCLUDED.spec,
			level = EXCLUDED.level,
			item_level = EXCLUDED.item_level,
			availability_note = COALESCE(EXCLUDED.availability_note, characters.availability_note),
			last_snapshot_at = EXCLUDED.last_snapshot_at,
			updated_at = now()
		RETURNING id`,
		gid, uid,
		payload.Character.Name, payload.Character.Realm,
		payload.Character.Race, payload.Character.Class, payload.Character.Spec,
		payload.Character.Level, payload.Character.ItemLevel,
		payload.Availability, payload.CapturedAt,
	).Scan(&charID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}

	// 每角色只保留最新一份快照（不做历史归档）
	if _, err := tx.Exec(r.Context(), `DELETE FROM snapshots WHERE character_id = $1`, charID); err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	var snapID uuid.UUID
	err = tx.QueryRow(r.Context(), `
		INSERT INTO snapshots (character_id, guild_id, uploaded_by, schema_version, addon_version, captured_at, payload)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id`,
		charID, gid, uid, payload.SchemaVersion, payload.AddonVersion, payload.CapturedAt, raw,
	).Scan(&snapID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"snapshot_id":  snapID,
		"character_id": charID,
	})
}

func (s *Server) handleListCharacters(w http.ResponseWriter, r *http.Request) {
	gid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad guild id")
		return
	}
	if _, ok := s.memberRole(r, gid, userIDFrom(r.Context())); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "not a guild member")
		return
	}

	q := `
		SELECT id, name, realm, race, class, spec, level, item_level, last_snapshot_at
		FROM characters WHERE guild_id = $1`
	args := []any{gid}
	n := 2
	if class := r.URL.Query().Get("class"); class != "" {
		q += ` AND class = $` + itoa(n)
		args = append(args, class)
		n++
	}
	if spec := r.URL.Query().Get("spec"); spec != "" {
		q += ` AND spec = $` + itoa(n)
		args = append(args, spec)
		n++
	}
	if minIlvl := r.URL.Query().Get("min_ilvl"); minIlvl != "" {
		if v, err := strconv.ParseFloat(minIlvl, 64); err == nil {
			q += ` AND item_level >= $` + itoa(n)
			args = append(args, v)
			n++
		}
	}
	if prof := r.URL.Query().Get("profession"); prof != "" {
		// match latest snapshot professions by name (contains)
		q += ` AND EXISTS (
			SELECT 1 FROM snapshots s
			WHERE s.character_id = characters.id
			  AND s.payload @> jsonb_build_object('professions', jsonb_build_array(jsonb_build_object('name', $` + itoa(n) + `::text)))
		)`
		args = append(args, prof)
		n++
	}
	if r.URL.Query().Get("has_lockout") == "1" || r.URL.Query().Get("has_lockout") == "true" {
		q += ` AND EXISTS (
			SELECT 1 FROM snapshots s
			WHERE s.character_id = characters.id
			  AND jsonb_typeof(s.payload->'lockouts') = 'array'
			  AND jsonb_array_length(s.payload->'lockouts') > 0
			  AND s.captured_at = characters.last_snapshot_at
		)`
	}
	q += ` ORDER BY name`

	rows, err := s.pool.Query(r.Context(), q, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	defer rows.Close()

	list := []map[string]any{}
	for rows.Next() {
		var (
			id, name, realm     string
			race, class, spec   *string
			level               *int
			ilvl                *float64
			lastSnap            *time.Time
		)
		if err := rows.Scan(&id, &name, &realm, &race, &class, &spec, &level, &ilvl, &lastSnap); err != nil {
			writeError(w, http.StatusInternalServerError, "server_error", err.Error())
			return
		}
		list = append(list, map[string]any{
			"id": id, "name": name, "realm": realm,
			"race": race, "class": class, "spec": spec,
			"level": level, "item_level": ilvl, "last_snapshot_at": lastSnap,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"characters": list})
}

func (s *Server) handlePatchCharacter(w http.ResponseWriter, r *http.Request) {
	gid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad guild id")
		return
	}
	cid, err := uuid.Parse(r.PathValue("charId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad character id")
		return
	}
	if _, ok := s.memberRole(r, gid, userIDFrom(r.Context())); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "not a guild member")
		return
	}
	var req struct {
		AvailabilityNote *string `json:"availability_note"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "invalid json")
		return
	}
	if req.AvailabilityNote == nil {
		writeError(w, http.StatusBadRequest, "validation_error", "availability_note required")
		return
	}
	tag, err := s.pool.Exec(r.Context(), `
		UPDATE characters SET
			availability_note = NULLIF($1, ''),
			updated_at = now()
		WHERE id = $2 AND guild_id = $3`,
		*req.AvailabilityNote, cid, gid,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "character not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleGetCharacter(w http.ResponseWriter, r *http.Request) {
	gid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad guild id")
		return
	}
	cid, err := uuid.Parse(r.PathValue("charId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad character id")
		return
	}
	if _, ok := s.memberRole(r, gid, userIDFrom(r.Context())); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "not a guild member")
		return
	}

	var (
		id, name, realm           string
		race, class, spec, avail  *string
		level                     *int
		ilvl                      *float64
		lastSnap                  *time.Time
	)
	err = s.pool.QueryRow(r.Context(), `
		SELECT id, name, realm, race, class, spec, level, item_level, availability_note, last_snapshot_at
		FROM characters WHERE id = $1 AND guild_id = $2`, cid, gid,
	).Scan(&id, &name, &realm, &race, &class, &spec, &level, &ilvl, &avail, &lastSnap)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "character not found")
		return
	}

	var (
		snapID      *string
		payload     []byte
		capturedAt  *time.Time
		addonVer    *string
	)
	_ = s.pool.QueryRow(r.Context(), `
		SELECT id::text, payload, captured_at, addon_version
		FROM snapshots WHERE character_id = $1
		ORDER BY captured_at DESC LIMIT 1`, cid,
	).Scan(&snapID, &payload, &capturedAt, &addonVer)

	out := map[string]any{
		"id": id, "name": name, "realm": realm,
		"race": race, "class": class, "spec": spec,
		"level": level, "item_level": ilvl,
		"availability_note": avail, "last_snapshot_at": lastSnap,
	}
	if snapID != nil && payload != nil {
		var raw any
		_ = json.Unmarshal(payload, &raw)
		out["latest_snapshot"] = map[string]any{
			"id": *snapID, "captured_at": capturedAt, "addon_version": addonVer, "payload": raw,
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleGetSnapshot(w http.ResponseWriter, r *http.Request) {
	sid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "bad snapshot id")
		return
	}
	var (
		gid                     uuid.UUID
		payload                 []byte
		captured                time.Time
		addon                   *string
		schema                  int
		charID, charName, realm string
	)
	err = s.pool.QueryRow(r.Context(), `
		SELECT s.guild_id, s.payload, s.captured_at, s.addon_version, s.schema_version,
		       c.id::text, c.name, c.realm
		FROM snapshots s
		JOIN characters c ON c.id = s.character_id
		WHERE s.id = $1`, sid,
	).Scan(&gid, &payload, &captured, &addon, &schema, &charID, &charName, &realm)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "snapshot not found")
		return
	}
	if _, ok := s.memberRole(r, gid, userIDFrom(r.Context())); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "not a guild member")
		return
	}
	var raw any
	_ = json.Unmarshal(payload, &raw)
	writeJSON(w, http.StatusOK, map[string]any{
		"id": sid, "character_id": charID, "character_name": charName, "realm": realm,
		"captured_at": captured, "addon_version": addon, "schema_version": schema,
		"payload": raw,
	})
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
