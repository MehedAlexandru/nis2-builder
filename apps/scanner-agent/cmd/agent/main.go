package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nis2-compass/scanner-agent/internal/config"
	"github.com/nis2-compass/scanner-agent/internal/upload"
	"github.com/nis2-compass/scanner-agent/internal/version"
)

func main() {
	showVersion := flag.Bool("version", false, "print version and exit")
	server := flag.String("server", os.Getenv("NIS2_SERVER"), "platform base URL (or NIS2_SERVER)")
	token := flag.String("enrollment-token", os.Getenv("NIS2_ENROLLMENT_TOKEN"), "one-time enrollment token (or NIS2_ENROLLMENT_TOKEN)")
	once := flag.Bool("once", false, "send a single heartbeat and exit")
	dryRun := flag.Bool("dry-run", false, "validate configuration and print the plan without network calls")
	authorized := flag.Bool("i-authorize-scanning", false, "confirm you are authorized to scan the target network")
	timeout := flag.Duration("timeout", config.DefaultTimeout, "HTTP timeout")
	flag.Parse()

	if *showVersion {
		fmt.Println(version.String())
		return
	}

	cfg, err := config.Load(config.Options{
		ServerURL:       *server,
		EnrollmentToken: *token,
		Once:            *once,
		DryRun:          *dryRun,
		Authorized:      *authorized,
		Timeout:         *timeout,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "configuration error: %v\n", err)
		os.Exit(2)
	}

	logger := log.New(os.Stdout, "nis2-agent ", log.LstdFlags|log.LUTC)

	if cfg.DryRun {
		fmt.Printf("agent version: %s\n", version.String())
		fmt.Printf("server: %s\n", cfg.ServerURL)
		fmt.Printf("enrollment token supplied: %t\n", cfg.EnrollmentToken != "")
		fmt.Printf("scanning authorized: %t\n", cfg.Authorized)
		fmt.Println("network discovery: disabled until Phase 6 (no packets will be sent)")
		return
	}

	if !cfg.Authorized {
		logger.Println("note: network scanning is disabled until Phase 6; no packets will be sent")
	}

	client := upload.New(cfg.ServerURL, cfg.EnrollmentToken, cfg.Timeout)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if cfg.Once {
		if err := client.Heartbeat(ctx, version.Version); err != nil {
			logger.Fatalf("heartbeat failed: %v", err)
		}
		logger.Println("heartbeat sent")
		return
	}

	logger.Printf("agent %s starting (heartbeat only; scanning arrives in Phase 6)", version.Version)
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		if err := client.Heartbeat(ctx, version.Version); err != nil {
			logger.Printf("heartbeat failed: %v", err)
		} else {
			logger.Println("heartbeat sent")
		}

		select {
		case <-ctx.Done():
			logger.Println("shutting down")
			return
		case <-ticker.C:
		}
	}
}
