package upload

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHeartbeatSendsBearerTokenAndClaimsJob(t *testing.T) {
	var path, auth string
	var payload HeartbeatPayload

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		auth = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Errorf("decode body: %v", err)
		}
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{
			"agent":{"id":"agent-1","name":"Office agent","status":"ACTIVE"},
			"job":{"id":"job-1","auditId":"audit-1","method":"AGENT_SCAN","params":{"authorized":true,"cidrs":["192.0.2.0/24"],"topPorts":100,"enableMdns":false,"enableNetbios":false,"rateLimitPerSecond":20}}
		}`))
	}))
	defer server.Close()

	client := New(server.URL, "enrollment-token", 5*time.Second)
	heartbeat, err := client.Heartbeat(context.Background(), "0.1.0-test")
	if err != nil {
		t.Fatalf("heartbeat failed: %v", err)
	}

	if path != "/api/v1/agents/heartbeat" {
		t.Errorf("unexpected path: %s", path)
	}
	if auth != "Bearer enrollment-token" {
		t.Errorf("unexpected authorization header: %s", auth)
	}
	if payload.Version != "0.1.0-test" || payload.Platform == "" {
		t.Errorf("unexpected heartbeat payload: %+v", payload)
	}
	if heartbeat.Job == nil || heartbeat.Job.ID != "job-1" || heartbeat.Job.Params.TopPorts != 100 {
		t.Fatalf("unexpected job: %+v", heartbeat.Job)
	}
}

func TestHeartbeatReturnsErrorOnNon2xx(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "nope", http.StatusUnauthorized)
	}))
	defer server.Close()

	client := New(server.URL, "bad-token", 5*time.Second)
	if _, err := client.Heartbeat(context.Background(), "0.1.0-test"); err == nil {
		t.Fatal("expected an error for a 401 response")
	}
}

func TestUploadAndFailureUseAgentEndpoints(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.Method+" "+r.URL.Path)
		if r.Header.Get("Authorization") != "Bearer token" {
			t.Errorf("unexpected authorization: %s", r.Header.Get("Authorization"))
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := New(server.URL, "token", 5*time.Second)
	if err := client.UploadResults(context.Background(), "job-1", ScanResult{
		ScannedAt: "2026-11-12T10:00:00Z",
		Devices: []ScanDevice{{
			IPAddresses: []string{"192.0.2.10"},
			MACAddress:  "AA:BB:CC:DD:EE:01",
			Hostname:    "printer",
			DeviceType:  "PRINTER",
			OpenPorts:   []string{"9100/tcp (printer)"},
		}},
	}); err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if err := client.FailJob(context.Background(), "job-2", "scan failed"); err != nil {
		t.Fatalf("fail report failed: %v", err)
	}

	want := []string{
		"POST /api/v1/agents/jobs/job-1/results",
		"POST /api/v1/agents/jobs/job-2/fail",
	}
	if len(paths) != len(want) || paths[0] != want[0] || paths[1] != want[1] {
		t.Fatalf("unexpected paths: %v", paths)
	}
}
