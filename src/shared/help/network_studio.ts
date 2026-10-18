import type { HelpTips, SkipRule } from "../helpMatch";

/** Network Forensics Studio: port scanner, DNS inspector, HTTP and TLS probes. */
export const networkStudioTips: HelpTips = {
  "#dd_theme": "Change the colors of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember the window size, the theme and what is typed in the boxes (target, port, port list, timeout), so they are restored next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#txt_host": "The computer to test: a name such as example.com or an IP address such as 192.168.1.1. A full web address is accepted; only the host part is used by the scans and DNS lookups.",
  "#txt_port": "The port number for Scan Port, TCP Ping and SSL Certificate, from 1 to 65535. Web sites use 443 (HTTPS) or 80 (HTTP).",
  "#btn_ping_http": "Send a web request to the target and show the status code (200 means OK), how long each step took and the response headers. Uses https, or http with the port for localhost.",
  "#btn_scan_socket": "Try to open a connection to the one port in the Port box and report OPEN (something is listening), CLOSED or TIMEOUT. Only test computers you own or may test.",
  "#btn_scan_all": "Check 12 well-known ports (FTP, SSH, DNS, HTTP, HTTPS, MySQL, PostgreSQL, Redis, MongoDB and some dev servers) on the target. It can take several seconds.",
  "#btn_preset_localhost": "Fill in this computer (127.0.0.1) and port 3000, a common development server port.",
  "#btn_preset_cloudflare": "Fill in Cloudflare's public DNS server 1.1.1.1 and port 443.",
  "#btn_preset_google": "Fill in google.com and port 443.",
  "#btn_preset_github": "Fill in github.com and port 443.",
  "#btn_dns_all": "Look up all the main DNS records of the target at once (A, AAAA, MX, TXT, NS, SOA, CNAME) and show them as one report. DNS is the internet's name directory.",
  "#btn_dns_a": "Look up the A records: the IPv4 addresses (such as 93.184.216.34) the name points to.",
  "#btn_dns_aaaa": "Look up the AAAA records: the IPv6 addresses (long ones with colons) the name points to.",
  "#btn_dns_mx": "Look up the MX records: the mail servers that receive email for this domain, with their priority.",
  "#btn_dns_txt": "Look up the TXT records: free text a domain publishes, often used for email protection (SPF) and ownership checks.",
  "#btn_dns_ns": "Look up the NS records: the name servers that hold this domain's DNS records.",
  "#btn_dns_soa": "Look up the SOA record: the zone's primary name server, admin contact and refresh timers.",
  "#btn_dns_caa": "Look up the CAA records: which certificate authorities are allowed to issue HTTPS certificates for this domain.",
  "#btn_dns_ptr": "Reverse DNS: find the host name registered for an IP address. Put an IP address in the Target box first. Many addresses have none.",
  "#btn_clear_diag": "Empty the results panel. The activity log below keeps its lines.",
  "#txt_ports": "Ports for Scan Port List, separated by commas, with ranges using a dash, for example 22,80,443,8000-8010. At most 1024 ports are scanned.",
  "#txt_timeout": "How long to wait for each port to answer, in milliseconds (100 to 5000). Used by Scan Port List and TCP Ping. Lower is faster but may miss slow ports.",
  "#chk_open_only": "When on, Scan Top Ports and Scan Port List show only the OPEN ports. When off, closed and timed-out ports are listed too.",
  "#btn_scan_custom": "Scan every port in the Ports box on the target, using the Timeout, and list the results. Only test computers you own or may test.",
  "#btn_tls_cert": "Connect to the target port and show its HTTPS (TLS) certificate: who it is for, who issued it and when it expires.",
  "#btn_tcp_ping": "Open a connection to the target port 5 times and show each response time, packet loss and the minimum, average and maximum. This is not an ICMP ping.",
  "#btn_copy_report": "Copy the text version of the current results to the clipboard.",
  "#btn_export_diag": "Save the current results as a text file. Name the file with .csv after a port scan to get a table of ports and results.",
  "#net_console": "A log of every action and its outcome. You can't type here.",
};

/** Controls that need no tip, each with a reason. */
export const networkStudioSkip: SkipRule[] = [
];
