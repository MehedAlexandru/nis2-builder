// Package discovery contains the network discovery primitives. Phase 0 defines
// the contract and the MAC OUI lookup; active discovery lands in Phase 6.
//
// Safety: discovery is inventory-only. The agent never runs vulnerability
// exploitation, credential attacks or intrusive probes.
package discovery

import (
	"context"
	"errors"
	"strings"
)

var ErrNotImplemented = errors.New("active network discovery lands in Phase 6")

type Host struct {
	IP       string
	MAC      string
	Hostname string
	Vendor   string
}

type Options struct {
	CIDRs              []string
	EnableMDNS         bool
	EnableNetBIOS      bool
	EnableSNMP         bool
	TopPorts           int
	RateLimitPerSecond int
}

type Discovery interface {
	Discover(ctx context.Context, opts Options) ([]Host, error)
}

// Local implements Discovery for the local L2 segment and routed subnets.
// It is intentionally a no-op until Phase 6 so the binary cannot scan anything.
type Local struct{}

func (Local) Discover(_ context.Context, _ Options) ([]Host, error) {
	return nil, ErrNotImplemented
}

// ouiVendors is a starter table. Phase 6 replaces it with a generated, complete
// IEEE OUI dataset shipped as an embedded data file.
var ouiVendors = map[string]string{
	"00:0c:29": "VMware",
	"00:1c:42": "Parallels",
	"00:50:56": "VMware",
	"08:00:27": "PCS Systemtechnik (VirtualBox)",
	"52:54:00": "QEMU/KVM",
	"00:16:3e": "Xen",
	"b8:27:eb": "Raspberry Pi",
	"dc:a6:32": "Raspberry Pi",
}

// VendorFromMAC resolves the vendor from the first three octets of a MAC.
// MAC addresses are only visible on the same L2 segment; callers must not
// claim vendor attribution for devices behind a router.
func VendorFromMAC(mac string) string {
	normalised := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(mac), "-", ":"))
	parts := strings.Split(normalised, ":")
	if len(parts) < 3 {
		return "Unknown"
	}
	prefix := strings.Join(parts[:3], ":")
	for i, part := range parts[:3] {
		if len(part) != 2 {
			return "Unknown"
		}
		parts[i] = part
	}
	if vendor, ok := ouiVendors[prefix]; ok {
		return vendor
	}
	return "Unknown"
}
