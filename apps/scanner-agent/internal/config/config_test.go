package config

import (
	"strings"
	"testing"
	"time"
)

func TestLoadValidHTTPS(t *testing.T) {
	cfg, err := Load(Options{
		ServerURL:       "https://app.example.com/",
		EnrollmentToken: "token",
		Timeout:         10 * time.Second,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.ServerURL != "https://app.example.com" {
		t.Fatalf("server URL not normalised: %q", cfg.ServerURL)
	}
	if cfg.Timeout != 10*time.Second {
		t.Fatalf("unexpected timeout: %v", cfg.Timeout)
	}
}

func TestLoadAllowsHTTPOnLoopbackOnly(t *testing.T) {
	if _, err := Load(Options{ServerURL: "http://localhost:3000", EnrollmentToken: "t"}); err != nil {
		t.Fatalf("localhost should be allowed in development: %v", err)
	}
	if _, err := Load(Options{ServerURL: "http://192.168.1.10:3000", EnrollmentToken: "t"}); err == nil {
		t.Fatal("expected plain HTTP to a remote host to be rejected")
	}
}

func TestLoadRequiresTokenUnlessDryRun(t *testing.T) {
	if _, err := Load(Options{ServerURL: "https://app.example.com"}); err == nil {
		t.Fatal("expected missing token to be rejected")
	}
	if _, err := Load(Options{ServerURL: "https://app.example.com", DryRun: true}); err != nil {
		t.Fatalf("dry-run should not require a token: %v", err)
	}
}

func TestLoadRejectsMissingServer(t *testing.T) {
	_, err := Load(Options{})
	if err == nil || !strings.Contains(err.Error(), "server URL") {
		t.Fatalf("expected a server URL error, got %v", err)
	}
}

func TestLoadAppliesDefaultTimeout(t *testing.T) {
	cfg, err := Load(Options{ServerURL: "https://app.example.com", EnrollmentToken: "t"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Timeout != DefaultTimeout {
		t.Fatalf("expected default timeout, got %v", cfg.Timeout)
	}
}
