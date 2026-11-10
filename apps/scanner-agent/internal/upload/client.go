package upload

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"runtime"
	"time"
)

type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

func New(baseURL, token string, timeout time.Duration) *Client {
	return &Client{
		baseURL: baseURL,
		token:   token,
		http:    &http.Client{Timeout: timeout},
	}
}

type heartbeatPayload struct {
	Version  string `json:"version"`
	Platform string `json:"platform"`
}

// Heartbeat tells the platform the agent is alive. It is the only network call
// implemented in Phase 0; scan result upload arrives with the scanner in Phase 6.
func (c *Client) Heartbeat(ctx context.Context, version string) error {
	body, err := json.Marshal(heartbeatPayload{
		Version:  version,
		Platform: runtime.GOOS + "/" + runtime.GOARCH,
	})
	if err != nil {
		return fmt.Errorf("encode heartbeat: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/v1/agents/heartbeat", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build heartbeat request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.token)

	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("send heartbeat: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		payload, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return fmt.Errorf("heartbeat rejected with %d: %s", res.StatusCode, string(payload))
	}
	return nil
}

var ErrScanUploadNotImplemented = errors.New("scan result upload lands in Phase 6")
