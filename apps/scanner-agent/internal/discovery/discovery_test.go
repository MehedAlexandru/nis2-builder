package discovery

import "testing"

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

func TestLocalDiscoveryIsDisabled(t *testing.T) {
	if _, err := (Local{}).Discover(t.Context(), Options{}); err != ErrNotImplemented {
		t.Fatalf("expected ErrNotImplemented, got %v", err)
	}
}
