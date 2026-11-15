package upload

import (
	"bytes"
	"context"
	"encoding/json"
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

type HeartbeatPayload struct {
	Version  string `json:"version"`
	Platform string `json:"platform"`
}

type ScanParams struct {
	Authorized         bool     `json:"authorized"`
	CIDRs              []string `json:"cidrs"`
	TopPorts           int      `json:"topPorts"`
	EnableMDNS         bool     `json:"enableMdns"`
	EnableNetBIOS      bool     `json:"enableNetbios"`
	RateLimitPerSecond int      `json:"rateLimitPerSecond"`
}

type Job struct {
	ID      string     `json:"id"`
	AuditID string     `json:"auditId"`
	Method  string     `json:"method"`
	Params  ScanParams `json:"params"`
}

type HeartbeatResponse struct {
	Agent struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Status string `json:"status"`
	} `json:"agent"`
	Job *Job `json:"job"`
}

type ScanDevice struct {
	IPAddresses []string `json:"ipAddresses"`
	MACAddress  string   `json:"macAddress,omitempty"`
	Hostname    string   `json:"hostname,omitempty"`
	Vendor      string   `json:"vendor,omitempty"`
	DeviceType  string   `json:"deviceType,omitempty"`
	OS          string   `json:"os,omitempty"`
	OpenPorts   []string `json:"openPorts,omitempty"`
}

type ScanResult struct {
	ScannedAt string       `json:"scannedAt,omitempty"`
	Devices   []ScanDevice `json:"devices"`
	Warnings  []string     `json:"warnings,omitempty"`
}

// Heartbeat tells the platform the agent is alive and claims the next queued
// scan job, if any. Communication is outbound HTTPS only.
func (c *Client) Heartbeat(ctx context.Context, version string) (*HeartbeatResponse, error) {
	body, err := json.Marshal(HeartbeatPayload{
		Version:  version,
		Platform: runtime.GOOS + "/" + runtime.GOARCH,
	})
	if err != nil {
		return nil, fmt.Errorf("encode heartbeat: %w", err)
	}

	req, err := c.newRequest(ctx, http.MethodPost, "/api/v1/agents/heartbeat", body)
	if err != nil {
		return nil, err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("send heartbeat: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		payload, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return nil, fmt.Errorf("heartbeat rejected with %d: %s", res.StatusCode, string(payload))
	}
	var response HeartbeatResponse
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&response); err != nil {
		return nil, fmt.Errorf("decode heartbeat response: %w", err)
	}
	return &response, nil
}

func (c *Client) UploadResults(ctx context.Context, jobID string, result ScanResult) error {
	body, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("encode scan result: %w", err)
	}
	req, err := c.newRequest(
		ctx,
		http.MethodPost,
		"/api/v1/agents/jobs/"+jobID+"/results",
		body,
	)
	if err != nil {
		return err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("upload scan result: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		payload, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return fmt.Errorf("scan upload rejected with %d: %s", res.StatusCode, string(payload))
	}
	return nil
}

func (c *Client) FailJob(ctx context.Context, jobID, message string) error {
	body, err := json.Marshal(map[string]string{"error": message})
	if err != nil {
		return fmt.Errorf("encode failure: %w", err)
	}
	req, err := c.newRequest(
		ctx,
		http.MethodPost,
		"/api/v1/agents/jobs/"+jobID+"/fail",
		body,
	)
	if err != nil {
		return err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("report scan failure: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		payload, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return fmt.Errorf("failure report rejected with %d: %s", res.StatusCode, string(payload))
	}
	return nil
}

func (c *Client) newRequest(
	ctx context.Context,
	method string,
	path string,
	body []byte,
) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build agent request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.token)
	return req, nil
}
