package config

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const DefaultTimeout = 30 * time.Second

type Options struct {
	ServerURL       string
	EnrollmentToken string
	Once            bool
	DryRun          bool
	Authorized      bool
	Timeout         time.Duration
}

type Config struct {
	ServerURL       string
	EnrollmentToken string
	Once            bool
	DryRun          bool
	Authorized      bool
	Timeout         time.Duration
}

// Load validates the agent configuration. HTTPS is mandatory except for
// localhost development. The enrollment token may be omitted only in dry-run
// mode, where no request is made.
func Load(opts Options) (Config, error) {
	serverURL := strings.TrimRight(strings.TrimSpace(opts.ServerURL), "/")
	if serverURL == "" {
		return Config{}, errors.New("server URL is required (--server or NIS2_SERVER)")
	}

	parsed, err := url.Parse(serverURL)
	if err != nil || parsed.Hostname() == "" {
		return Config{}, fmt.Errorf("invalid server URL %q", opts.ServerURL)
	}
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && isLoopback(parsed.Hostname())) {
		return Config{}, errors.New("server URL must use HTTPS (HTTP is allowed only for localhost)")
	}

	token := strings.TrimSpace(opts.EnrollmentToken)
	if token == "" && !opts.DryRun {
		return Config{}, errors.New("enrollment token is required (--enrollment-token or NIS2_ENROLLMENT_TOKEN)")
	}

	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = DefaultTimeout
	}

	return Config{
		ServerURL:       serverURL,
		EnrollmentToken: token,
		Once:            opts.Once,
		DryRun:          opts.DryRun,
		Authorized:      opts.Authorized,
		Timeout:         timeout,
	}, nil
}

func isLoopback(host string) bool {
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}
