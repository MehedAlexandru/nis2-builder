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
	"github.com/nis2-compass/scanner-agent/internal/discovery"
	"github.com/nis2-compass/scanner-agent/internal/upload"
	"github.com/nis2-compass/scanner-agent/internal/version"
)

func main() {
	showVersion := flag.Bool("version", false, "print version and exit")
	server := flag.String("server", os.Getenv("NIS2_SERVER"), "platform base URL (or NIS2_SERVER)")
	token := flag.String("enrollment-token", os.Getenv("NIS2_ENROLLMENT_TOKEN"), "one-time enrollment token (or NIS2_ENROLLMENT_TOKEN)")
	once := flag.Bool("once", false, "send one heartbeat, process a claimed job, then exit")
	dryRun := flag.Bool("dry-run", false, "validate configuration and print the plan without network calls")
	authorized := flag.Bool("i-authorize-scanning", false, "confirm you are authorized to scan the target network")
	timeout := flag.Duration("timeout", config.DefaultTimeout, "HTTP timeout")
	pollInterval := flag.Duration("poll-interval", 15*time.Second, "heartbeat/job polling interval")
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
		fmt.Println("discovery: TCP reachability, reverse DNS, OS ARP cache, MAC OUI and service guess")
		fmt.Println("no packets will be sent in dry-run mode")
		return
	}

	if !cfg.Authorized {
		logger.Println("warning: --i-authorize-scanning is not set; claimed jobs will be failed")
	}

	client := upload.New(cfg.ServerURL, cfg.EnrollmentToken, cfg.Timeout)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if cfg.Once {
		heartbeat, err := client.Heartbeat(ctx, version.Version)
		if err != nil {
			logger.Fatalf("heartbeat failed: %v", err)
		}
		logger.Printf("heartbeat sent (agent %s, status %s)", heartbeat.Agent.Name, heartbeat.Agent.Status)
		if heartbeat.Job != nil {
			runJob(ctx, client, logger, *heartbeat.Job, cfg.Authorized)
		}
		return
	}

	logger.Printf("agent %s starting (poll interval %s)", version.Version, pollInterval)
	for {
		heartbeat, err := client.Heartbeat(ctx, version.Version)
		if err != nil {
			if ctx.Err() != nil {
				logger.Println("shutting down")
				return
			}
			logger.Printf("heartbeat failed: %v", err)
		} else {
			logger.Printf("heartbeat sent (agent %s, status %s)", heartbeat.Agent.Name, heartbeat.Agent.Status)
			if heartbeat.Job != nil {
				runJob(ctx, client, logger, *heartbeat.Job, cfg.Authorized)
			}
		}

		select {
		case <-ctx.Done():
			logger.Println("shutting down")
			return
		case <-time.After(*pollInterval):
		}
	}
}

func runJob(
	ctx context.Context,
	client *upload.Client,
	logger *log.Logger,
	job upload.Job,
	authorized bool,
) {
	if !authorized {
		reportFailure(client, logger, job.ID, "agent was not started with --i-authorize-scanning")
		return
	}
	if job.AuditID == "" {
		reportFailure(client, logger, job.ID, "scan job has no target audit")
		return
	}
	logger.Printf(
		"scan %s starting (cidrs=%v topPorts=%d rate=%d/s)",
		job.ID,
		job.Params.CIDRs,
		job.Params.TopPorts,
		job.Params.RateLimitPerSecond,
	)
	scanCtx, cancel := context.WithTimeout(ctx, 30*time.Minute)
	defer cancel()
	hosts, err := (discovery.Local{}).Discover(scanCtx, discovery.Options{
		Authorized:         job.Params.Authorized,
		CIDRs:              job.Params.CIDRs,
		EnableMDNS:         job.Params.EnableMDNS,
		EnableNetBIOS:      job.Params.EnableNetBIOS,
		TopPorts:           job.Params.TopPorts,
		RateLimitPerSecond: job.Params.RateLimitPerSecond,
	})
	if err != nil {
		reportFailure(client, logger, job.ID, err.Error())
		return
	}

	result := upload.ScanResult{
		ScannedAt: time.Now().UTC().Format(time.RFC3339),
		Devices:   make([]upload.ScanDevice, 0, len(hosts)),
	}
	for _, host := range hosts {
		result.Devices = append(result.Devices, upload.ScanDevice{
			IPAddresses: []string{host.IP},
			MACAddress:  host.MAC,
			Hostname:    host.Hostname,
			Vendor:      host.Vendor,
			DeviceType:  host.Type,
			OS:          host.OS,
			OpenPorts:   host.OpenPorts,
		})
	}
	if err := client.UploadResults(scanCtx, job.ID, result); err != nil {
		logger.Printf("scan %s upload failed: %v", job.ID, err)
		reportFailure(client, logger, job.ID, err.Error())
		return
	}
	logger.Printf("scan %s completed: %d devices uploaded", job.ID, len(result.Devices))
}

func reportFailure(client *upload.Client, logger *log.Logger, jobID, message string) {
	failCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := client.FailJob(failCtx, jobID, message); err != nil {
		logger.Printf("scan %s failure report failed: %v", jobID, err)
		return
	}
	logger.Printf("scan %s failed: %s", jobID, message)
}
