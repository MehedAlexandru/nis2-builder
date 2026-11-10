package upload

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHeartbeatSendsBearerTokenAndPayload(t *testing.T) {
	var path, auth string
	var payload heartbeatPayload

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		auth = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Errorf("decode body: %v", err)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	client := New(server.URL, "enrollment-token", 5*time.Second)
	if err := client.Heartbeat(context.Background(), "0.1.0-test"); err != nil {
		t.Fatalf("heartbeat failed: %v", err)
	}

	if path != "/api/v1/agents/heartbeat" {
		t.Errorf("unexpected path: %s", path)
	}
	if auth != "Bearer enrollment-token" {
		t.Errorf("unexpected authorization header: %s", auth)
	}
	if payload.Version != "0.1.0-test" {
		t.Errorf("unexpected version: %s", payload.Version)
	}
}

func TestHeartbeatReturnsErrorOnNon2xx(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "nope", http.StatusUnauthorized)
	}))
	defer server.Close()

	client := New(server.URL, "bad-token", 5*time.Second)
	if err := client.Heartbeat(context.Background(), "0.1.0-test"); err == nil {
		t.Fatal("expected an error for a 401 response")
	}
}
