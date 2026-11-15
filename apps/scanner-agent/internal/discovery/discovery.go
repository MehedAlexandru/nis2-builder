// Package discovery contains passive inventory and non-intrusive network
// discovery primitives. The agent never runs vulnerability exploitation,
// credential attacks or intrusive probes.
package discovery

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	ErrNotAuthorized  = errors.New("scanning requires explicit authorization")
	ErrTargetTooLarge = errors.New("target range is too large for a non-intrusive scan")
)

type Host struct {
	IP        string
	MAC       string
	Hostname  string
	Vendor    string
	OS        string
	Type      string
	OpenPorts []string
}

type Options struct {
	Authorized         bool
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

const (
	maxTargets       = 4096
	defaultRateLimit = 20
	probeTimeout     = 350 * time.Millisecond
	portWorkers      = 8
)

type portSpec struct {
	number  int
	service string
}

var topPorts = []portSpec{
	{22, "ssh"}, {80, "http"}, {443, "https"}, {445, "smb"}, {3389, "rdp"},
	{53, "dns"}, {67, "dhcp"}, {68, "dhcp"}, {123, "ntp"}, {135, "msrpc"},
	{139, "netbios"}, {161, "snmp"}, {389, "ldap"}, {636, "ldaps"}, {873, "rsync"},
	{902, "vmware"}, {993, "imaps"}, {995, "pop3s"}, {1433, "mssql"}, {1521, "oracle"},
	{2049, "nfs"}, {2375, "docker"}, {2376, "docker-tls"}, {3306, "mysql"}, {5432, "postgres"},
	{5900, "vnc"}, {5985, "winrm"}, {5986, "winrm-tls"}, {6379, "redis"}, {8080, "http-alt"},
	{8443, "https-alt"}, {8888, "http-alt"}, {9100, "printer"}, {631, "ipp"}, {515, "lpd"},
	{554, "rtsp"}, {8554, "rtsp-alt"}, {37777, "dahua"}, {8000, "http-alt"}, {9000, "http-alt"},
	{25, "smtp"}, {110, "pop3"}, {143, "imap"}, {465, "smtps"}, {587, "submission"},
	{21, "ftp"}, {23, "telnet"}, {69, "tftp"}, {111, "rpcbind"}, {137, "netbios-ns"},
	{138, "netbios-dgm"}, {162, "snmp-trap"}, {179, "bgp"}, {427, "svrloc"}, {548, "afp"},
	{646, "ldp"}, {749, "kerberos-adm"}, {1900, "ssdp"}, {2869, "upnp"}, {5000, "http-alt"},
	{5353, "mdns"}, {5357, "wsd"}, {6443, "kubernetes"}, {7001, "weblogic"}, {8008, "http-alt"},
	{8081, "http-alt"}, {8088, "http-alt"}, {8090, "http-alt"}, {8181, "http-alt"}, {8880, "http-alt"},
	{9443, "https-alt"}, {10000, "webmin"}, {27017, "mongodb"}, {11211, "memcached"}, {9200, "elasticsearch"},
}

// Local implements Discovery for the local L2 segment and routed subnets using
// TCP reachability plus the operating-system ARP cache. MAC addresses are only
// available for devices on the same L2 segment.
type Local struct{}

func (Local) Discover(ctx context.Context, opts Options) ([]Host, error) {
	if !opts.Authorized {
		return nil, ErrNotAuthorized
	}
	cidrs := opts.CIDRs
	if len(cidrs) == 0 {
		detected, err := localCIDRs()
		if err != nil {
			return nil, err
		}
		cidrs = detected
	}
	targets, networks, err := expandTargets(cidrs)
	if err != nil {
		return nil, err
	}
	rate := opts.RateLimitPerSecond
	if rate <= 0 {
		rate = defaultRateLimit
	}
	ports := topPorts
	if opts.TopPorts > 0 && opts.TopPorts < len(ports) {
		ports = ports[:opts.TopPorts]
	}
	if opts.TopPorts == 0 {
		ports = ports[:12]
	}

	arp := readARPTable()
	results := make(map[string]Host)
	limiter := time.NewTicker(time.Second / time.Duration(rate))
	defer limiter.Stop()

	for _, ip := range targets {
		select {
		case <-ctx.Done():
			return sortedHosts(results), ctx.Err()
		case <-limiter.C:
		}
		host, ok := probeHost(ctx, ip.String(), ports)
		if !ok {
			continue
		}
		if mac := arp[ip.String()]; mac != "" {
			host.MAC = mac
			host.Vendor = VendorFromMAC(mac)
		}
		host.Hostname = reverseDNS(ctx, ip.String())
		host.Type, host.OS = inferTypeAndOS(host.Vendor, host.OpenPorts)
		results[ip.String()] = host
	}

	// Include recently active ARP neighbours that do not listen on any of the
	// probed TCP ports. This is what makes an L2 sweep useful for silent hosts.
	for ip, mac := range arp {
		parsed := net.ParseIP(ip)
		if parsed == nil || !insideAny(parsed, networks) {
			continue
		}
		if _, exists := results[ip]; exists {
			continue
		}
		results[ip] = Host{
			IP:       ip,
			MAC:      mac,
			Hostname: reverseDNS(ctx, ip),
			Vendor:   VendorFromMAC(mac),
			Type:     "UNKNOWN",
			OS:       "",
		}
	}

	return sortedHosts(results), nil
}

func probeHost(ctx context.Context, ip string, ports []portSpec) (Host, bool) {
	open := make([]portSpec, 0, 4)
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, portWorkers)
	for _, port := range ports {
		select {
		case <-ctx.Done():
			return Host{}, false
		case sem <- struct{}{}:
		}
		wg.Add(1)
		go func(spec portSpec) {
			defer wg.Done()
			defer func() { <-sem }()
			dialer := net.Dialer{Timeout: probeTimeout}
			conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(ip, strconv.Itoa(spec.number)))
			if err != nil {
				return
			}
			_ = conn.Close()
			mu.Lock()
			open = append(open, spec)
			mu.Unlock()
		}(port)
	}
	wg.Wait()
	if len(open) == 0 {
		return Host{}, false
	}
	sort.Slice(open, func(i, j int) bool { return open[i].number < open[j].number })
	labels := make([]string, 0, len(open))
	for _, port := range open {
		labels = append(labels, fmt.Sprintf("%d/tcp (%s)", port.number, port.service))
	}
	return Host{IP: ip, OpenPorts: labels}, true
}

func expandTargets(cidrs []string) ([]net.IP, []*net.IPNet, error) {
	var targets []net.IP
	var networks []*net.IPNet
	for _, raw := range cidrs {
		_, network, err := net.ParseCIDR(strings.TrimSpace(raw))
		if err != nil {
			return nil, nil, fmt.Errorf("invalid CIDR %q", raw)
		}
		networks = append(networks, network)
		ip := network.IP.Mask(network.Mask)
		ones, bits := network.Mask.Size()
		broadcast := lastAddress(network.IP, network.Mask)
		for network.Contains(ip) {
			isNetwork := ip.Equal(network.IP)
			isBroadcast := ones <= bits-2 && ip.Equal(broadcast)
			if !isNetwork && !isBroadcast {
				targets = append(targets, append(net.IP(nil), ip...))
			}
			ip = nextIP(ip)
			if len(targets) > maxTargets {
				return nil, nil, ErrTargetTooLarge
			}
		}
	}
	return targets, networks, nil
}

func localCIDRs() ([]string, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil, fmt.Errorf("list interfaces: %w", err)
	}
	seen := make(map[string]bool)
	var cidrs []string
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok || ipNet.IP.To4() == nil {
				continue
			}
			ones, _ := ipNet.Mask.Size()
			if ones < 24 {
				// Keep the default sweep bounded to a /24 around the agent.
				ip := ipNet.IP.To4()
				ipNet = &net.IPNet{IP: ip.Mask(net.CIDRMask(24, 32)), Mask: net.CIDRMask(24, 32)}
			}
			value := ipNet.String()
			if !seen[value] {
				seen[value] = true
				cidrs = append(cidrs, value)
			}
		}
	}
	if len(cidrs) == 0 {
		return nil, errors.New("no active IPv4 network interface found; pass --cidr")
	}
	return cidrs, nil
}

func insideAny(ip net.IP, networks []*net.IPNet) bool {
	for _, network := range networks {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

func lastAddress(ip net.IP, mask net.IPMask) net.IP {
	last := make(net.IP, len(ip))
	for index := range ip {
		last[index] = ip[index] | ^mask[index]
	}
	return last
}

func nextIP(ip net.IP) net.IP {
	next := append(net.IP(nil), ip...)
	for index := len(next) - 1; index >= 0; index-- {
		next[index]++
		if next[index] != 0 {
			break
		}
	}
	return next
}

func sortedHosts(hosts map[string]Host) []Host {
	result := make([]Host, 0, len(hosts))
	for _, host := range hosts {
		result = append(result, host)
	}
	sort.Slice(result, func(i, j int) bool {
		return bytesLess(net.ParseIP(result[i].IP), net.ParseIP(result[j].IP))
	})
	return result
}

func bytesLess(left, right net.IP) bool {
	left = left.To4()
	right = right.To4()
	if left == nil || right == nil {
		return left == nil && right != nil
	}
	for index := 0; index < 4; index++ {
		if left[index] != right[index] {
			return left[index] < right[index]
		}
	}
	return false
}

func reverseDNS(ctx context.Context, ip string) string {
	lookupCtx, cancel := context.WithTimeout(ctx, 800*time.Millisecond)
	defer cancel()
	names, err := net.DefaultResolver.LookupAddr(lookupCtx, ip)
	if err != nil || len(names) == 0 {
		return ""
	}
	return strings.TrimSuffix(names[0], ".")
}

func inferTypeAndOS(vendor string, ports []string) (string, string) {
	numbers := make(map[int]bool)
	for _, port := range ports {
		number, err := strconv.Atoi(strings.SplitN(port, "/", 2)[0])
		if err == nil {
			numbers[number] = true
		}
	}
	lowerVendor := strings.ToLower(vendor)
	deviceType := "UNKNOWN"
	switch {
	case numbers[9100] || numbers[631] || numbers[515] || strings.Contains(lowerVendor, "printer"):
		deviceType = "PRINTER"
	case numbers[554] || numbers[8554] || numbers[37777]:
		deviceType = "IP_CAMERA"
	case strings.Contains(lowerVendor, "router") || numbers[53] || numbers[67]:
		deviceType = "ROUTER"
	case strings.Contains(lowerVendor, "switch"):
		deviceType = "SWITCH"
	case strings.Contains(lowerVendor, "firewall") || strings.Contains(lowerVendor, "fortinet"):
		deviceType = "FIREWALL"
	case numbers[445] || numbers[3389] || numbers[22] || numbers[80] || numbers[443]:
		deviceType = "SERVER"
	}
	osGuess := ""
	switch {
	case numbers[445] || numbers[3389] || numbers[5985] || numbers[5986]:
		osGuess = "Windows (estimated)"
	case numbers[22]:
		osGuess = "Linux/Unix (estimated)"
	case deviceType == "ROUTER" || deviceType == "SWITCH" || deviceType == "FIREWALL":
		osGuess = "Network appliance (estimated)"
	}
	return deviceType, osGuess
}

var arpLinePattern = regexp.MustCompile(`(?i)(\d{1,3}(?:\.\d{1,3}){3})\s+.*?([0-9a-f]{2}(?:[:-][0-9a-f]{2}){5})`)

func readARPTable() map[string]string {
	result := make(map[string]string)
	if runtime.GOOS == "linux" {
		if file, err := os.Open("/proc/net/arp"); err == nil {
			defer file.Close()
			scanner := bufio.NewScanner(file)
			first := true
			for scanner.Scan() {
				if first {
					first = false
					continue
				}
				fields := strings.Fields(scanner.Text())
				if len(fields) < 4 || fields[2] == "0x0" {
					continue
				}
				if mac := normalizeMAC(fields[3]); mac != "" {
					result[fields[0]] = mac
				}
			}
		}
	}
	command := exec.Command("arp", "-a")
	output, err := command.Output()
	if err != nil {
		return result
	}
	for _, match := range arpLinePattern.FindAllStringSubmatch(string(output), -1) {
		if mac := normalizeMAC(match[2]); mac != "" {
			result[match[1]] = mac
		}
	}
	return result
}

func normalizeMAC(value string) string {
	compact := strings.ToUpper(strings.NewReplacer("-", "", ":", "").Replace(strings.TrimSpace(value)))
	if len(compact) != 12 {
		return ""
	}
	for _, char := range compact {
		if !strings.ContainsRune("0123456789ABCDEF", char) {
			return ""
		}
	}
	return strings.Join([]string{
		compact[0:2], compact[2:4], compact[4:6], compact[6:8], compact[8:10], compact[10:12],
	}, ":")
}

// ouiVendors is a starter table. A generated IEEE OUI dataset can replace it
// without changing the discovery contract.
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
	for _, part := range parts[:3] {
		if len(part) != 2 {
			return "Unknown"
		}
	}
	if vendor, ok := ouiVendors[prefix]; ok {
		return vendor
	}
	return "Unknown"
}
