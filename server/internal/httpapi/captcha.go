package httpapi

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	mrand "math/rand"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

const captchaCharset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

type captchaEntry struct {
	answer    string
	expiresAt time.Time
}

type captchaStore struct {
	mu    sync.Mutex
	items map[string]captchaEntry
}

func newCaptchaStore() *captchaStore {
	return &captchaStore{items: map[string]captchaEntry{}}
}

func randomCode(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, n)
	for i := 0; i < n; i++ {
		out[i] = captchaCharset[int(buf[i])%len(captchaCharset)]
	}
	return string(out), nil
}

func (c *captchaStore) issue() (id, imageDataURL string, err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.purgeLocked()

	answer, err := randomCode(4)
	if err != nil {
		return "", "", err
	}
	pngBytes, err := renderCaptchaPNG(answer)
	if err != nil {
		return "", "", err
	}
	id = uuid.NewString()
	c.items[id] = captchaEntry{
		answer:    strings.ToUpper(answer),
		expiresAt: time.Now().Add(5 * time.Minute),
	}
	imageDataURL = "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)
	return id, imageDataURL, nil
}

func (c *captchaStore) verify(id, answer string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.purgeLocked()
	ent, ok := c.items[id]
	if !ok {
		return false
	}
	delete(c.items, id)
	if time.Now().After(ent.expiresAt) {
		return false
	}
	return ent.answer == strings.ToUpper(strings.TrimSpace(answer))
}

func (c *captchaStore) purgeLocked() {
	now := time.Now()
	for k, v := range c.items {
		if now.After(v.expiresAt) {
			delete(c.items, k)
		}
	}
}

func renderCaptchaPNG(code string) ([]byte, error) {
	const (
		srcW, srcH = 112, 28
		scale      = 2 // 放大后更清晰：224x56
	)
	src := image.NewRGBA(image.Rect(0, 0, srcW, srcH))
	bg := color.RGBA{R: 24, G: 32, B: 42, A: 255}
	draw.Draw(src, src.Bounds(), &image.Uniform{C: bg}, image.Point{}, draw.Src)

	for i := 0; i < 60; i++ {
		x, y := mrand.Intn(srcW), mrand.Intn(srcH)
		src.Set(x, y, color.RGBA{
			R: uint8(70 + mrand.Intn(80)),
			G: uint8(80 + mrand.Intn(80)),
			B: uint8(90 + mrand.Intn(80)),
			A: 255,
		})
	}
	for i := 0; i < 3; i++ {
		c := color.RGBA{
			R: uint8(50 + mrand.Intn(100)),
			G: uint8(60 + mrand.Intn(100)),
			B: uint8(70 + mrand.Intn(100)),
			A: 200,
		}
		drawLine(src, mrand.Intn(srcW/4), mrand.Intn(srcH), srcW/2+mrand.Intn(srcW/2), mrand.Intn(srcH), c)
	}

	face := basicfont.Face7x13
	for i, ch := range []rune(code) {
		col := color.RGBA{R: 230, G: 240, B: 245, A: 255}
		x := 10 + i*26
		y := 18 + mrand.Intn(3) - 1
		d := &font.Drawer{
			Dst:  src,
			Src:  image.NewUniform(col),
			Face: face,
			Dot:  fixed.P(x, y),
		}
		// 每个字符只画一次，避免叠影看起来像重复字符
		d.DrawString(string(ch))
	}

	dstW, dstH := srcW*scale, srcH*scale
	dst := image.NewRGBA(image.Rect(0, 0, dstW, dstH))
	for y := 0; y < dstH; y++ {
		for x := 0; x < dstW; x++ {
			dst.Set(x, y, src.At(x/scale, y/scale))
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, dst); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func drawLine(img *image.RGBA, x0, y0, x1, y1 int, c color.RGBA) {
	dx := abs(x1 - x0)
	dy := abs(y1 - y0)
	sx, sy := 1, 1
	if x0 > x1 {
		sx = -1
	}
	if y0 > y1 {
		sy = -1
	}
	err := dx - dy
	for {
		img.Set(x0, y0, c)
		if x0 == x1 && y0 == y1 {
			break
		}
		e2 := 2 * err
		if e2 > -dy {
			err -= dy
			x0 += sx
		}
		if e2 < dx {
			err += dx
			y0 += sy
		}
	}
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

func (s *Server) handleCaptcha(w http.ResponseWriter, r *http.Request) {
	id, imageURL, err := s.captcha.issue()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", "captcha render failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"captcha_id": id,
		"image":      imageURL,
	})
}
