package discovery

import (
	"errors"
	"strings"
	"testing"
)

func TestVendorFromMAC(t *testing.T) {
	cases := []struct {
		mac  string
		want string
	}{
		{"00:50:56:AA:BB:CC", "VMware"},
		{"08-00-27-12-34-56", "PCS Systemtechnik (VirtualBox)"},
		{"b8:27:eb:01:02:03", "Raspberry Pi"},
		{"00:11:22:33:44:55", "Unknown"},
		{"not-a-mac", "Unknown"},
		{"", "Unknown"},
	}
	for _, tc := range cases {
		if got := VendorFromMAC(tc.mac); got != tc.want {
			t.Errorf("VendorFromMAC(%q) = %q, want %q", tc.mac, got, tc.want)
		}
	}
}

func TestLocalDiscoveryRequiresAuthorization(t *testing.T) {
	if _, err := (Local{}).Discover(t.Context(), Options{}); err != ErrNotAuthorized {
		t.Fatalf("expected ErrNotAuthorized, got %v", err)
	}
}

func TestExpandTargetsRejectsLargeRanges(t *testing.T) {
	_, _, err := expandTargets([]string{"10.0.0.0/8"})
	if !errors.Is(err, ErrTargetTooLarge) {
		t.Fatalf("expected ErrTargetTooLarge, got %v", err)
	}
}

func TestExpandTargetsSkipsNetworkAndBroadcast(t *testing.T) {
	targets, _, err := expandTargets([]string{"192.0.2.0/30"})
	if err != nil {
		t.Fatal(err)
	}
	if len(targets) != 2 || targets[0].String() != "192.0.2.1" || targets[1].String() != "192.0.2.2" {
		t.Fatalf("unexpected targets: %v", targets)
	}
}

func TestInferTypeAndOS(t *testing.T) {
	deviceType, _ := inferTypeAndOS("Hewlett Packard", []string{"9100/tcp (printer)", "631/tcp (ipp)"})
	if deviceType != "PRINTER" {
		t.Fatalf("expected printer, got %s", deviceType)
	}
	deviceType, osGuess := inferTypeAndOS("Dell", []string{"445/tcp (smb)", "3389/tcp (rdp)"})
	if deviceType != "SERVER" || !strings.Contains(osGuess, "Windows") {
		t.Fatalf("unexpected classification: %s %s", deviceType, osGuess)
	}
}

func TestNormalizeMACAndARPLine(t *testing.T) {
	if got := normalizeMAC("aa-bb-cc-dd-ee-01"); got != "AA:BB:CC:DD:EE:01" {
		t.Fatalf("unexpected MAC: %s", got)
	}
	match := arpLinePattern.FindStringSubmatch(
		"192.0.2.10          0x1          0x2          aa:bb:cc:dd:ee:01     eth0",
	)
	if len(match) != 3 {
		t.Fatalf("expected ARP match, got %v", match)
	}
}
