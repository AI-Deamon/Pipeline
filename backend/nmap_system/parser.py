#!/usr/bin/env python3
"""
BSOL Automated Penetration Testing System — Parser
Reads raw nmap output and detects real vulnerabilities using 17 detection rules
"""

import json
import re
import sys
import logging
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, List, Any
from rich.console import Console

console = Console()


# ============================================================================
# FindingDetector Class — All 17 Detection Rules
# ============================================================================

class FindingDetector:
    """Detects vulnerabilities from raw nmap output using 17 detection rules"""

    def __init__(self):
        self.findings: List[Dict[str, Any]] = []
        self.finding_counter = 0
        self._seen: set = set()

    def add_finding(self, host: str, ip: str, environment: str, scan_type: str,
                    scan_file: str, port: str, service: str, title: str,
                    severity: str, description: str, raw_evidence: str,
                    cve: Optional[str] = None) -> str:
        """Add a finding to the list, returns finding ID"""
        # Check for duplicate first (same host + same title + same port)
        if self.is_duplicate(host, title, port):
            console.print(f"  [yellow]⚠ Skipping duplicate:[/yellow] {title} on {host}:{port}")
            return ""

        self.finding_counter += 1
        finding_id = f"F{self.finding_counter:03d}"

        self.findings.append({
            "id": finding_id,
            "host": host,
            "ip": ip,
            "environment": environment,
            "scan_type": scan_type,
            "scan_file": scan_file,
            "port": str(port),
            "service": service,
            "title": title,
            "cve": cve,
            "severity": severity,
            "description": description,
            "raw_evidence": raw_evidence,
            "confirmed": None,
            "false_positive": None,
            "false_positive_reason": None,
            "recommendation": None,
            "ai_validated": False
        })

        # Add to seen set after duplicate check passes
        self._seen.add((host, title, str(port)))

        console.print(f"  [green]✓ Found:[/green] {title} ({severity})")
        return finding_id

    def is_duplicate(self, host: str, title: str, port: str) -> bool:
        """
        Check if this finding already exists (same host + title + port).
        Issue 12: Uses persistent set of (host, title, port) tuples for O(1) lookup.
        """
        return (host, title, str(port)) in self._seen

    def get_cvss_severity(self, cvss_score: float) -> str:
        """Map CVSS score to severity level"""
        if cvss_score >= 9.0:
            return "Critical"
        elif cvss_score >= 7.0:
            return "High"
        elif cvss_score >= 4.0:
            return "Medium"
        elif cvss_score >= 0.1:
            return "Low"
        return "High"  # Default for CVE without CVSS

    def extract_port_from_context(self, content: str, position: int) -> str:
        """Extract port number from nmap output context before position"""
        lines = content[:position].split('\n')
        for line in reversed(lines[-20:]):  # Look at most recent 20 lines
            port_match = re.match(r'(\d+)/tcp', line.strip())
            if port_match:
                return port_match.group(1)
            # Also check for "Port: XXXX" pattern
            port_match = re.search(r'Port[:\s]+(\d+)', line, re.IGNORECASE)
            if port_match:
                return port_match.group(1)
        return "unknown"

    # =========================================================================
    # Rule 1 — CVE Detection
    # =========================================================================

    def detect_cve(self, content: str, host_info: Dict[str, str], scan_file: str) -> List[str]:
        """
        Rule 1: CVE Detection from vuln scan output
        Pattern: CVE-XXXX-XXXX with VULNERABLE nearby, NOT "NOT VULNERABLE"
        Returns list of finding IDs
        """
        cve_pattern = r'CVE-(\d{4}-\d+)'
        lines = content.split('\n')
        seen_cves = set()  # Prevent duplicates in same file
        finding_ids = []

        for i, line in enumerate(lines):
            cve_matches = re.findall(cve_pattern, line)
            for cve_num in cve_matches:
                if cve_num in seen_cves:
                    continue
                seen_cves.add(cve_num)

                # Get context: 3 lines up and down (narrower to avoid cross-script contamination)
                context_start = max(0, i - 3)
                context_end = min(len(lines), i + 3)
                context = '\n'.join(lines[context_start:context_end])

                # Must have VULNERABLE, must NOT have NOT VULNERABLE
                if 'VULNERABLE' not in context:
                    continue
                if 'NOT VULNERABLE' in context:
                    continue
                if 'false positive' in context.lower():
                    continue

                # Additional check: the VULNERABLE marker should be on or very near the CVE line
                # to avoid cross-contamination from other script blocks
                vuln_line = None
                for j in range(max(0, i - 3), min(len(lines), i + 3)):
                    if 'VULNERABLE' in lines[j] and 'NOT VULNERABLE' not in lines[j]:
                        vuln_line = j
                        break
                if vuln_line is None:
                    continue
                # CVE must be within 2 lines of VULNERABLE marker
                if abs(vuln_line - i) > 2:
                    continue

                # Issue 7: Fix port extraction - pass match position from loop instead of using content.find()
                # Calculate position as sum of line lengths up to current line
                position = sum(len(l) + 1 for l in lines[:i])  # +1 for newline
                port = self.extract_port_from_context(content, position)

                # Extract title: First try Description value, fall back to script name
                title = f"Vulnerability: CVE-{cve_num}"

                # First, try to find Description value
                for j in range(i, min(i + 5, len(lines))):  # Look ahead up to 5 lines
                    desc_match = re.search(r'\|\s*Description:\s*(.+)', lines[j])
                    if desc_match:
                        title = desc_match.group(1).strip()
                        # Clean up: remove leading underscore, fix camelCase/script names
                        if title.startswith('_'):
                            title = title[1:]
                        # Convert _Name_Style or _NameStyle to proper Title Case
                        title = title.replace('_', ' ').strip()
                        if ' ' not in title and any(c.isupper() for c in title[1:]):
                            # CamelCase like "HttpAspnetDebug" → "Http Aspnet Debug"
                            title = re.sub(r'([a-z])([A-Z])', r'\1 \2', title)
                        break

                # If no description found, try to get script name from preceding lines
                if title.startswith("Vulnerability:"):
                    for j in range(max(0, i - 10), i):
                        if '|' in lines[j] and ':' in lines[j]:
                            # Extract script name like "http-slowloris" from "| http-slowloris:"
                            # Exclude leading underscores from nmap internal names
                            script_match = re.search(r'\|\s*([a-zA-Z][\w-]*):', lines[j])
                            if script_match:
                                script_name = script_match.group(1)
                                # Skip generic names and CVE metadata fields
                                if script_name.lower() not in ['vuln', 'description', 'references', 'risk', 'cvss', 'exploit', 'cpe']:
                                    title = script_name.replace('-', ' ').title()
                                    break

                # Try to extract CVSS score
                severity = "High"
                cvss_match = re.search(r'CVSS[:\s]+([\d.]+)', context, re.IGNORECASE)
                if cvss_match:
                    try:
                        cvss_score = float(cvss_match.group(1))
                        severity = self.get_cvss_severity(cvss_score)
                    except ValueError:
                        pass

                raw_evidence = '\n'.join(lines[context_start:context_end])
                description = f"The host is vulnerable to {title} (CVE-{cve_num})."

                # Issue 8: Fix detect_cve() to collect all CVEs - already calls add_finding for each
                # The function already iterates all matches and calls add_finding for each valid CVE
                finding_id = self.add_finding(
                    host=host_info['name'],
                    ip=host_info['ip'],
                    environment=host_info['environment'],
                    scan_type="Vulnerability and Exploit Scan",
                    scan_file=scan_file,
                    port=port,
                    service="unknown",
                    title=title,
                    severity=severity,
                    description=description,
                    raw_evidence=raw_evidence,
                    cve=f"CVE-{cve_num}"
                )
                if finding_id:
                    finding_ids.append(finding_id)

        return finding_ids

    # =========================================================================
    # Rule 2 — Certificate Expiry
    # =========================================================================

    def detect_cert_expiry(self, content: str, host_info: Dict[str, str], scan_file: str) -> List[str]:
        """
        Rule 2: Certificate Expiry Detection
        Pattern: "Not valid after:" date
        Returns list of finding IDs
        """
        expiry_pattern = r'Not valid after:\s*(\d{4}-\d{2}-\d{2}[T\d:]*)'
        today = datetime.now()
        finding_ids = []

        for match in re.finditer(expiry_pattern, content):
            expiry_str = match.group(1)

            # Extract port from context above
            port = self.extract_port_from_context(content, match.start())

            # Extract CN from commonName= before the match
            cn = "Unknown"
            context_before = content[max(0, match.start() - 500):match.start()]
            cn_match = re.search(r'commonName=([^\n/]+)', context_before)
            if cn_match:
                cn = cn_match.group(1).strip()

            # Parse expiry date
            try:
                if 'T' in expiry_str:
                    expiry_date = datetime.strptime(expiry_str[:19], '%Y-%m-%dT%H:%M:%S')
                else:
                    expiry_date = datetime.strptime(expiry_str, '%Y-%m-%d')
            except ValueError:
                continue

            days_until_expiry = (expiry_date - today).days

            # Determine severity and title based on days until expiry
            if days_until_expiry < 0:
                title = f"SSL Certificate Expired — {cn}"
                severity = "High"
            elif days_until_expiry <= 30:
                title = f"SSL Certificate Expiring in {days_until_expiry} Days — {cn}"
                severity = "High"
            elif days_until_expiry <= 60:
                title = f"SSL Certificate Expiring in {days_until_expiry} Days — {cn}"
                severity = "Medium"
            elif days_until_expiry <= 90:
                title = f"SSL Certificate Expiring in {days_until_expiry} Days (Warning) — {cn}"
                severity = "Low"
            else:
                # Beyond 90 days - not a finding
                continue

            raw_evidence = content[max(0, match.start() - 200):match.end() + 100]
            description = f"SSL certificate ({cn}) on port {port} expires on {expiry_date.strftime('%Y-%m-%d')} ({days_until_expiry} days from now)."

            finding_id = self.add_finding(
                host=host_info['name'],
                ip=host_info['ip'],
                environment=host_info['environment'],
                scan_type="Certificate Expiry Check",
                scan_file=scan_file,
                port=port,
                service="ssl",
                title=title,
                severity=severity,
                description=description,
                raw_evidence=raw_evidence,
                cve=None
            )
            if finding_id:
                finding_ids.append(finding_id)

        return finding_ids

    # =========================================================================
    # Rule 3 — Weak DH Keys
    # =========================================================================

    def detect_weak_dh(self, content: str, host_info: Dict[str, str], scan_file: str) -> Optional[str]:
        """
        Rule 3: Weak Diffie-Hellman Key Exchange
        Pattern: ssl-dh-params + VULNERABLE + 1024-bit
        """
        if 'ssl-dh-params' not in content.lower():
            return None
        if 'VULNERABLE' not in content:
            return None
        if '1024' not in content:
            return None

        # Extract port
        port_match = re.search(r'(\d+)/tcp', content)
        port = port_match.group(1) if port_match else "unknown"

        raw_evidence = content[:600]
        description = "Server uses weak 1024-bit Diffie-Hellman parameters, vulnerable to Logjam attack (CVE-2015-4000)."

        return self.add_finding(
            host=host_info['name'],
            ip=host_info['ip'],
            environment=host_info['environment'],
            scan_type="SSL Cipher Enumeration",
            scan_file=scan_file,
            port=port,
            service="ssl",
            title="Weak Diffie-Hellman Key Exchange (1024-bit)",
            severity="High",
            description=description,
            raw_evidence=raw_evidence,
            cve="CVE-2015-4000"
        )

    # =========================================================================
    # Rule 4 — Risky HTTP Methods
    # =========================================================================

    def detect_risky_methods(self, content: str, host_info: Dict[str, str], scan_file: str) -> Optional[str]:
        """
        Rule 4: Risky HTTP Methods
        Pattern: "Potentially risky methods:" line — extract methods after it
        Only flag: PUT, PATCH, DELETE, TRACE, CONNECT
        """
        risky_methods_set = {'PUT', 'PATCH', 'DELETE', 'TRACE', 'CONNECT'}

        # Find the "Potentially risky methods:" line
        risky_match = re.search(r'Potentially risky methods:\s*([^\n]+)', content)
        if not risky_match:
            return None

        methods_line = risky_match.group(1)
        found_methods = set(re.findall(r'\b([A-Z]+)\b', methods_line))
        risky_found = found_methods & risky_methods_set

        if not risky_found:
            return None

        # Extract port
        port_match = re.search(r'(\d+)/tcp\s+open', content)
        port = port_match.group(1) if port_match else "80"

        methods_str = ', '.join(sorted(risky_found))
        title = f"Dangerous HTTP Methods Exposed: {methods_str}"
        raw_evidence = methods_line
        description = f"Web server allows dangerous HTTP methods: {methods_str}. These methods could allow unauthorized modification or information disclosure."

        return self.add_finding(
            host=host_info['name'],
            ip=host_info['ip'],
            environment=host_info['environment'],
            scan_type="HTTP Methods Check",
            scan_file=scan_file,
            port=port,
            service="http",
            title=title,
            severity="Medium",
            description=description,
            raw_evidence=raw_evidence,
            cve=None
        )

    # =========================================================================
    # Rule 5 — RDP Vulnerability
    # =========================================================================

    def detect_rdp_vulnerability(self, content: str, host_info: Dict[str, str], scan_file: str) -> Optional[str]:
        """
        Rule 5: RDP Vulnerability
        Pattern: VULNERABLE present AND NOT VULNERABLE not present
        """
        lines = content.split('\n')

        for i, line in enumerate(lines):
            if 'VULNERABLE' not in line:
                continue
            if 'rdp' not in content.lower():
                continue

            # Check context for NOT VULNERABLE
            context_start = max(0, i - 3)
            context_end = min(len(lines), i + 5)
            context = '\n'.join(lines[context_start:context_end])

            if 'NOT VULNERABLE' in context:
                continue

            # Extract CVE if present
            cve = None
            cve_match = re.search(r'(CVE-\d{4}-\d+)', context)
            if cve_match:
                cve = cve_match.group(1)

            # Issue 13: Fix hardcoded port 3389 - use extract_port_from_context()
            port = self.extract_port_from_context(content, sum(len(l) + 1 for l in lines[:i]))

            title = f"RDP Vulnerability Detected — {cve}" if cve else "RDP Vulnerability Detected"
            description = f"RDP service is vulnerable to remote exploitation. {f'CVE: {cve}' if cve else ''}"

            return self.add_finding(
                host=host_info['name'],
                ip=host_info['ip'],
                environment=host_info['environment'],
                scan_type="RDP Vulnerability Check",
                scan_file=scan_file,
                port=port,
                service="ms-wbt-server",
                title=title,
                severity="Critical",
                description=description,
                raw_evidence=context,
                cve=cve
            )

        return None

    # =========================================================================
    # Rule 6 — Missing HTTP Security Headers
    # =========================================================================

    def detect_missing_headers(self, content: str, host_info: Dict[str, str], scan_file: str) -> Optional[str]:
        """
        Rule 6: Missing HTTP Security Headers
        Only trigger if port is actually open
        Required: Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Content-Security-Policy
        """
        # Check if port is open
        if 'open' not in content.lower():
            return None

        # Check if filtered or closed (skip these)
        if 'filtered' in content.lower() or 'closed' in content.lower():
            # But only skip if ALL ports are filtered/closed
            if not re.search(r'\d+/tcp\s+open', content):
                return None

        # Extract port
        port_match = re.search(r'(\d+)/tcp\s+open', content)
        if not port_match:
            return None
        port = port_match.group(1)

        required_headers = {
            'Strict-Transport-Security': 'HSTS',
            'X-Frame-Options': 'X-Frame-Options',
            'X-Content-Type-Options': 'X-Content-Type-Options',
            'Content-Security-Policy': 'CSP'
        }

        missing = []
        for header, display_name in required_headers.items():
            if header not in content:
                missing.append(display_name)

        if not missing:
            return None

        missing_str = ', '.join(missing)
        title = f"Missing HTTP Security Headers: {missing_str}"
        description = f"Web server on port {port} is missing important security headers: {missing_str}."

        return self.add_finding(
            host=host_info['name'],
            ip=host_info['ip'],
            environment=host_info['environment'],
            scan_type="HTTP Security Headers Check",
            scan_file=scan_file,
            port=port,
            service="http",
            title=title,
            severity="Medium",
            description=description,
            raw_evidence=f"Missing headers: {missing_str}",
            cve=None
        )

    # =========================================================================
    # Rule 7 — SMTP Open Relay
    # =========================================================================

    def detect_smtp_open_relay(self, content: str, host_info: Dict[str, str], scan_file: str) -> Optional[str]:
        """
        Rule 7: SMTP Open Relay
        Pattern: smtp-open-relay ran AND "Server is not an open relay" NOT present
        Supports ports 25, 587, 465
        """
        if 'smtp-open-relay' not in content.lower():
            return None

        if 'Server is not an open relay' in content:
            return None

        # Extract port from context, supporting ports 25, 587, 465
        port = self.extract_port_from_context(content, len(content))
        # If port couldn't be extracted, check for common SMTP ports in content
        if port == "unknown":
            for smtp_port in ['587', '465', '25']:
                if f'{smtp_port}/tcp' in content:
                    port = smtp_port
                    break
            if port == "unknown":
                port = "25"  # Default fallback

        description = "SMTP server may be an open relay, allowing abuse for spam distribution."

        return self.add_finding(
            host=host_info['name'],
            ip=host_info['ip'],
            environment=host_info['environment'],
            scan_type="SMTP Security Check",
            scan_file=scan_file,
            port=port,
            service="smtp",
            title="SMTP Open Relay Detected",
            severity="High",
            description=description,
            raw_evidence=content[:500],
            cve=None
        )

    # =========================================================================
    # Rule 8 — SMTP STARTTLS Missing
    # =========================================================================

    def detect_smtp_starttls(self, content: str, host_info: Dict[str, str], scan_file: str) -> Optional[str]:
        """
        Rule 8: SMTP STARTTLS Missing
        Pattern: smtp scan ran AND STARTTLS not in output
        Supports ports 25, 587, 465
        """
        if 'smtp' not in content.lower():
            return None

        if 'STARTTLS' in content or 'starttls' in content.lower():
            return None

        # Extract port from context, supporting ports 25, 587, 465
        port = self.extract_port_from_context(content, len(content))
        # If port couldn't be extracted, check for common SMTP ports in content
        if port == "unknown":
            for smtp_port in ['587', '465', '25']:
                if f'{smtp_port}/tcp' in content:
                    port = smtp_port
                    break
            if port == "unknown":
                port = "25"  # Default fallback

        description = "SMTP server does not advertise STARTTLS support, emails may be transmitted in plaintext."

        return self.add_finding(
            host=host_info['name'],
            ip=host_info['ip'],
            environment=host_info['environment'],
            scan_type="SMTP Security Check",
            scan_file=scan_file,
            port=port,
            service="smtp",
            title="SMTP STARTTLS Not Advertised",
            severity="Medium",
            description=description,
            raw_evidence=content[:500],
            cve=None
        )

    # =========================================================================
    # Rule 10 — JMX Console
    # =========================================================================

    def detect_jmx_console(self, content: str, host_info: Dict[str, str], scan_file: str) -> Optional[str]:
        """
        Rule 10: JMX Console Authentication Bypass
        Pattern: /jmx-console/ AND (Authentication was not required | Authentication bypass possible | no authentication)
        """
        if '/jmx-console/' not in content.lower():
            return None

        auth_bypass_patterns = [
            'Authentication was not required',
            'Authentication bypass possible',
            'no authentication'
        ]

        if not any(pattern in content for pattern in auth_bypass_patterns):
            return None

        # Extract port
        port_match = re.search(r'(\d+)/tcp', content)
        port = port_match.group(1) if port_match else "8080"

        description = "JMX console is accessible without proper authentication, allowing unauthorized access to Java management interfaces."

        return self.add_finding(
            host=host_info['name'],
            ip=host_info['ip'],
            environment=host_info['environment'],
            scan_type="Vulnerability and Exploit Scan",
            scan_file=scan_file,
            port=port,
            service="jmx",
            title="JMX Console Authentication Bypass",
            severity="High",
            description=description,
            raw_evidence=content[:500],
            cve="CVE-2010-0738"
        )

    # =========================================================================
    # Rule 11 — Deprecated TLS
    # =========================================================================

    def detect_deprecated_tls(self, content: str, host_info: Dict[str, str], scan_file: str) -> Optional[str]:
        """
        Rule 11: Deprecated TLS Versions
        Pattern: TLSv1.0: or TLSv1.1: present
        """
        deprecated = []

        if re.search(r'TLSv1\.0:', content):
            deprecated.append('TLS 1.0')
        if re.search(r'TLSv1\.1:', content):
            deprecated.append('TLS 1.1')

        if not deprecated:
            return None

        # Extract port
        port_match = re.search(r'(\d+)/tcp', content)
        port = port_match.group(1) if port_match else "443"

        deprecated_str = ', '.join(deprecated)
        title = f"Deprecated TLS Versions Enabled: {deprecated_str}"
        description = f"Server supports deprecated TLS versions ({deprecated_str}), which have known security vulnerabilities."

        return self.add_finding(
            host=host_info['name'],
            ip=host_info['ip'],
            environment=host_info['environment'],
            scan_type="SSL Cipher Enumeration",
            scan_file=scan_file,
            port=port,
            service="ssl",
            title=title,
            severity="Medium",
            description=description,
            raw_evidence=f"Deprecated protocols: {deprecated_str}",
            cve=None
        )

    # =========================================================================
    # Rule 12 — Unknown Service
    # =========================================================================

    def detect_unknown_service(self, content: str, host_info: Dict[str, str], scan_file: str, port: str) -> Optional[str]:
        """
        Rule 12: Unknown Service
        Triggered for any {name}_unknown_{port}.txt file
        """
        description = f"An unrecognized service was detected on port {port} during discovery scanning. Automated analysis could not determine service type. Manual verification is recommended before the next assessment."

        return self.add_finding(
            host=host_info['name'],
            ip=host_info['ip'],
            environment=host_info['environment'],
            scan_type="Service Discovery",
            scan_file=scan_file,
            port=port,
            service="unknown",
            title=f"Unrecognized Service on Port {port}",
            severity="Low",
            description=description,
            raw_evidence=content[:300] if content else "No additional information available",
            cve=None
        )

    # =========================================================================
    # Rule 13 — SSH
    # =========================================================================

    def detect_ssh_issues(self, content: str, host_info: Dict[str, str], scan_file: str) -> List[str]:
        """
        Rule 13: SSH Security Issues
        - Weak algorithms: arcfour, des, md5 in ssh2-enum-algos
        - Password auth enabled: password in ssh-auth-methods
        """
        finding_ids = []

        # Check for weak algorithms
        if 'ssh2-enum-algos' in content.lower():
            weak_algos = []
            if re.search(r'\barcfour\b', content, re.IGNORECASE):
                weak_algos.append('arcfour')
            if re.search(r'\bdes\b', content, re.IGNORECASE):
                weak_algos.append('des')
            if re.search(r'\bmd5\b', content, re.IGNORECASE):
                weak_algos.append('md5')

            if weak_algos:
                algos_str = ', '.join(weak_algos)
                title = "Weak SSH Algorithms Detected"
                description = f"SSH server supports weak cryptographic algorithms: {algos_str}."

                fid = self.add_finding(
                    host=host_info['name'],
                    ip=host_info['ip'],
                    environment=host_info['environment'],
                    scan_type="SSH Security Check",
                    scan_file=scan_file,
                    port=self.extract_port_from_context(content, len(content)) or "22",
                    service="ssh",
                    title=title,
                    severity="Medium",
                    description=description,
                    raw_evidence=content[:500],
                    cve=None
                )
                if fid:
                    finding_ids.append(fid)

        # Check for password authentication
        if 'ssh-auth-methods' in content.lower():
            if 'password' in content.lower():
                title = "SSH Password Authentication Enabled"
                description = "SSH server allows password authentication, which is susceptible to brute force attacks. Key-based authentication is recommended."

                fid = self.add_finding(
                    host=host_info['name'],
                    ip=host_info['ip'],
                    environment=host_info['environment'],
                    scan_type="SSH Security Check",
                    scan_file=scan_file,
                    port=self.extract_port_from_context(content, len(content)) or "22",
                    service="ssh",
                    title=title,
                    severity="Low",
                    description=description,
                    raw_evidence=content[:500],
                    cve=None
                )
                if fid:
                    finding_ids.append(fid)

        return [fid for fid in finding_ids if fid]

    # =========================================================================
    # Rule 14 — SMB
    # =========================================================================

    def detect_smb_issues(self, content: str, host_info: Dict[str, str], scan_file: str) -> List[str]:
        """
        Rule 14: SMB Security Issues
        - EternalBlue: VULNERABLE in smb-vuln-ms17-010
        - Signing not required: "Message signing enabled but not required"
        """
        finding_ids = []

        # Check for EternalBlue
        if 'smb-vuln-ms17-010' in content.lower():
            if 'VULNERABLE' in content and 'NOT VULNERABLE' not in content:
                title = "SMB EternalBlue Vulnerability (MS17-010)"
                description = "SMB server is vulnerable to EternalBlue exploit (MS17-010), which allows remote code execution."

                fid = self.add_finding(
                    host=host_info['name'],
                    ip=host_info['ip'],
                    environment=host_info['environment'],
                    scan_type="SMB Security Check",
                    scan_file=scan_file,
                    port="445",
                    service="microsoft-ds",
                    title=title,
                    severity="Critical",
                    description=description,
                    raw_evidence=content[:500],
                    cve="CVE-2017-0144"
                )
                if fid:
                    finding_ids.append(fid)

        # Check for signing not required
        if 'smb-security-mode' in content.lower():
            if 'Message signing enabled but not required' in content:
                title = "SMB Signing Not Required"
                description = "SMB message signing is enabled but not required, allowing potential man-in-the-middle attacks."

                fid = self.add_finding(
                    host=host_info['name'],
                    ip=host_info['ip'],
                    environment=host_info['environment'],
                    scan_type="SMB Security Check",
                    scan_file=scan_file,
                    port="445",
                    service="microsoft-ds",
                    title=title,
                    severity="Medium",
                    description=description,
                    raw_evidence=content[:500],
                    cve=None
                )
                if fid:
                    finding_ids.append(fid)

        return [fid for fid in finding_ids if fid]

    # =========================================================================
    # Rule 15 — FTP
    # =========================================================================

    def detect_ftp_issues(self, content: str, host_info: Dict[str, str], scan_file: str) -> List[str]:
        """
        Rule 15: FTP Security Issues
        - Anonymous login: "Anonymous FTP login allowed"
        - Bounce attack: "bounce working"
        """
        finding_ids = []

        # Check for anonymous login
        if 'ftp-anon' in content.lower():
            if 'Anonymous FTP login allowed' in content or 'Anonymous login allowed' in content:
                title = "FTP Anonymous Login Enabled"
                description = "FTP server allows anonymous login, which may expose sensitive files to unauthorized users."

                fid = self.add_finding(
                    host=host_info['name'],
                    ip=host_info['ip'],
                    environment=host_info['environment'],
                    scan_type="FTP Security Check",
                    scan_file=scan_file,
                    port=self.extract_port_from_context(content, len(content)) or "21",
                    service="ftp",
                    title=title,
                    severity="High",
                    description=description,
                    raw_evidence=content[:500],
                    cve=None
                )
                if fid:
                    finding_ids.append(fid)

        # Check for bounce attack
        if 'ftp-bounce' in content.lower():
            if 'bounce working' in content.lower():
                title = "FTP Bounce Attack Possible"
                description = "FTP server may be vulnerable to FTP bounce attacks, which can be used to scan ports or attack other systems."

                fid = self.add_finding(
                    host=host_info['name'],
                    ip=host_info['ip'],
                    environment=host_info['environment'],
                    scan_type="FTP Security Check",
                    scan_file=scan_file,
                    port=self.extract_port_from_context(content, len(content)) or "21",
                    service="ftp",
                    title=title,
                    severity="Medium",
                    description=description,
                    raw_evidence=content[:500],
                    cve=None
                )
                if fid:
                    finding_ids.append(fid)

        return [fid for fid in finding_ids if fid]

    # =========================================================================
    # Rule 16 — MySQL
    # =========================================================================

    def detect_mysql_issues(self, content: str, host_info: Dict[str, str], scan_file: str) -> Optional[str]:
        """
        Rule 16: MySQL Empty Password
        Pattern: "account has empty password" in mysql-empty-password
        """
        if 'mysql-empty-password' not in content.lower():
            return None

        if 'account has empty password' not in content.lower():
            return None

        description = "MySQL database has an account with an empty password, allowing unauthorized access."

        return self.add_finding(
            host=host_info['name'],
            ip=host_info['ip'],
            environment=host_info['environment'],
            scan_type="MySQL Security Check",
            scan_file=scan_file,
            port=self.extract_port_from_context(content, len(content)) or "3306",
            service="mysql",
            title="MySQL Empty Password Account Detected",
            severity="Critical",
            description=description,
            raw_evidence=content[:500],
            cve=None
        )

    # =========================================================================
    # Rule 17 — MSSQL
    # =========================================================================

    def detect_mssql_issues(self, content: str, host_info: Dict[str, str], scan_file: str) -> Optional[str]:
        """
        Rule 17: MSSQL Empty Password
        Pattern: "account has empty password" in ms-sql-empty-password
        """
        if 'ms-sql-empty-password' not in content.lower():
            return None

        if 'account has empty password' not in content.lower():
            return None

        description = "MSSQL database has an account with an empty password, allowing unauthorized access."

        return self.add_finding(
            host=host_info['name'],
            ip=host_info['ip'],
            environment=host_info['environment'],
            scan_type="MSSQL Security Check",
            scan_file=scan_file,
            port=self.extract_port_from_context(content, len(content)) or "1433",
            service="ms-sql-s",
            title="MSSQL Empty Password Account Detected",
            severity="Critical",
            description=description,
            raw_evidence=content[:500],
            cve=None
        )


# ============================================================================
# ScanSummaryReader Class — Track Which Scans Ran Per Host
# ============================================================================

class ScanSummaryReader:
    """Reads scan_summary.json and discovery files to track which scans ran per host"""

    def __init__(self, scan_date: str, base_dir: Path):
        self.scan_date = scan_date
        self.base_dir = base_dir
        self.summary_file = base_dir / "scans" / scan_date / "scan_summary.json"
        self.host_data: Dict[str, Dict[str, Any]] = {}

    def load(self) -> bool:
        """Load scan summary data"""
        if not self.summary_file.exists():
            console.print(f"  [yellow]⚠ Warning:[/yellow] scan_summary.json not found at {self.summary_file}")
            console.print("  Will infer scans from raw files only")
            return False

        try:
            with open(self.summary_file) as f:
                data = json.load(f)

            # Build host data structure
            # Issue 35: Fix key mismatch - scanner.py writes 'targets', not 'hosts'
            if 'targets' in data:
                for host_name, host_info in data['targets'].items():
                    self.host_data[host_name] = {
                        'scans_run': host_info.get('scans_run', []),
                        'open_ports': host_info.get('discovery', {}).get('open_ports', []),
                        'services_found': host_info.get('services_found', [])
                    }
            return True
        except (json.JSONDecodeError, KeyError) as e:
            console.print(f"  [yellow]⚠ Warning:[/yellow] Error reading scan_summary.json: {e}")
            return False

    def get_scans_run(self, host_name: str) -> List[str]:
        """Get list of scan IDs that ran for this host"""
        if host_name in self.host_data:
            return self.host_data[host_name].get('scans_run', [])
        return []

    def get_open_ports(self, host_name: str) -> List[int]:
        """Get list of open ports for this host"""
        if host_name in self.host_data:
            return self.host_data[host_name].get('open_ports', [])
        return []

    def get_services(self, host_name: str) -> List[str]:
        """Get list of services found for this host"""
        if host_name in self.host_data:
            return self.host_data[host_name].get('services_found', [])
        return []

    def load_discovery_file(self, host_name: str) -> Optional[Dict[str, Any]]:
        """Load {name}_discovery.json if it exists"""
        # Issue 11: Fix path - add "scans/" subdirectory
        discovery_file = self.base_dir / "scans" / self.scan_date / f"{host_name}_discovery.json"
        if not discovery_file.exists():
            return None

        try:
            with open(discovery_file) as f:
                return json.load(f)
        except (json.JSONDecodeError, KeyError):
            return None


# ============================================================================
# Parse Scan File Function — Route to Appropriate Detection Rules
# ============================================================================

def parse_scan_file(file_path: Path, detector: FindingDetector, host_info: Dict[str, str],
                    scan_id: str, scan_summary: Optional[ScanSummaryReader] = None) -> List[str]:
    """
    Parse a single scan file and detect findings using appropriate rules
    Returns list of finding IDs created
    """
    # Issue 10: Add encoding='utf-8', errors='replace' to handle special characters
    content = file_path.read_text(encoding='utf-8', errors='replace')
    scan_file = file_path.name
    finding_ids = []

    findings_before = len(detector.findings)

    # Route to appropriate detection rules based on scan type
    if scan_id == 'vuln':
        detector.detect_cve(content, host_info, scan_file)
        detector.detect_jmx_console(content, host_info, scan_file)
    elif scan_id == 'ssl':
        detector.detect_cert_expiry(content, host_info, scan_file)
        detector.detect_weak_dh(content, host_info, scan_file)
        detector.detect_deprecated_tls(content, host_info, scan_file)
    elif scan_id == 'cert':
        detector.detect_cert_expiry(content, host_info, scan_file)
    elif scan_id == 'methods':
        detector.detect_risky_methods(content, host_info, scan_file)
    elif scan_id == 'headers':
        detector.detect_missing_headers(content, host_info, scan_file)
    elif scan_id == 'rdp':
        detector.detect_rdp_vulnerability(content, host_info, scan_file)
    elif scan_id == 'smtp':
        detector.detect_smtp_open_relay(content, host_info, scan_file)
        detector.detect_smtp_starttls(content, host_info, scan_file)
    elif scan_id == 'ssh':
        detector.detect_ssh_issues(content, host_info, scan_file)
    elif scan_id == 'smb':
        detector.detect_smb_issues(content, host_info, scan_file)
    elif scan_id == 'ftp':
        detector.detect_ftp_issues(content, host_info, scan_file)
    elif scan_id == 'mysql':
        detector.detect_mysql_issues(content, host_info, scan_file)
    elif scan_id == 'mssql':
        detector.detect_mssql_issues(content, host_info, scan_file)
    elif scan_id.startswith('unknown_'):
        # Extract port from filename: {name}_unknown_{port}.txt
        port = scan_id.replace('unknown_', '')
        detector.detect_unknown_service(content, host_info, scan_file, port)
    elif scan_id == 'aggressive':
        # Aggressive scan may contain cert info
        detector.detect_cert_expiry(content, host_info, scan_file)
        detector.detect_risky_methods(content, host_info, scan_file)
    elif scan_id == 'discovery':
        # Discovery files don't generate findings directly
        pass
    elif scan_id == 'brute':
        # Brute force scan - no specific detection rule yet
        pass
    # Collect finding IDs created from this file
    for finding in detector.findings[findings_before:]:
        finding_ids.append(finding['id'])

    return finding_ids


# ============================================================================
# Main Function
# ============================================================================

def main():
    """Main entry point for parser"""
    parser = argparse.ArgumentParser(
        description='BSOL Penetration Testing Parser — Detects vulnerabilities from nmap scan output'
    )
    parser.add_argument(
        '--date',
        type=str,
        help='Parse specific date folder (YYYY-MM-DD). Defaults to today.'
    )
    parser.add_argument(
        '--base-dir',
        type=Path,
        default=Path('.'),
        help='Base directory for scans folder (default: current directory)'
    )
    args = parser.parse_args()

    # Issue 34: Validate --date argument format
    if args.date:
        try:
            datetime.strptime(args.date, '%Y-%m-%d')
        except ValueError:
            console.print("[bold red]Error:[/bold red] Invalid date format. Use YYYY-MM-DD")
            sys.exit(1)

    # Load configuration
    config_file = Path('targets.json')
    if not config_file.exists():
        console.print("[bold red]❌ Error:[/bold red] targets.json not found in current directory")
        sys.exit(1)

    try:
        with open(config_file) as f:
            config = json.load(f)
    except json.JSONDecodeError as e:
        console.print(f"[bold red]❌ Error:[/bold red] Invalid JSON in targets.json: {e}")
        sys.exit(1)

    # Determine date
    date_str = args.date or datetime.now().strftime('%Y-%m-%d')
    raw_dir = args.base_dir / "scans" / date_str / "raw"

    if not raw_dir.exists():
        console.print(f"[bold red]❌ Error:[/bold red] Scan folder not found: {raw_dir}")
        sys.exit(1)

    console.print(f"[bold blue]════════════════════════════════════════[/bold blue]")
    console.print(f"[bold blue]  BSOL Parser — Scanning: {date_str}[/bold blue]")
    console.print(f"[bold blue]════════════════════════════════════════[/bold blue]\n")

    # Load scan summary
    scan_summary = ScanSummaryReader(date_str, args.base_dir)
    scan_summary_loaded = scan_summary.load()

    # Initialize detector
    detector = FindingDetector()

    # Track host status
    host_status: Dict[str, Dict[str, Any]] = {}
    for target in config['targets']:
        host_name = target['name']
        # Merge open_ports from scan_summary if available
        loaded_open_ports = []
        if scan_summary_loaded and host_name in scan_summary.host_data:
            loaded_open_ports = [p['port'] if isinstance(p, dict) else p
                                 for p in scan_summary.host_data[host_name].get('open_ports', [])]
            # Flatten: ports are dicts with 'port' key from discovery result
            loaded_open_ports = [p if isinstance(p, int) else p.get('port', 0) for p in loaded_open_ports]

        host_status[host_name] = {
            'ip': target['ip'],
            'environment': target['environment'],
            'open_ports': loaded_open_ports,
            'services_found': [],
            'scans_run': [],
            'scans': {},
            'finding_ids': []
        }

    # Process each scan file
    scan_files = sorted(raw_dir.glob('*.txt'))
    console.print(f"[bold]Processing {len(scan_files)} scan files...[/bold]\n")

    for file_path in scan_files:
        filename = file_path.stem  # e.g., "Test-Host-215_vuln"
        parts = filename.split('_')

        if len(parts) < 2:
            console.print(f"  [yellow]⚠ Skipping:[/yellow] {filename} (invalid format)")
            continue

        host_name = parts[0]
        scan_id = '_'.join(parts[1:])  # Handle unknown_8080 format

        # Find host info from config
        host_config = next((t for t in config['targets'] if t['name'] == host_name), None)
        if not host_config:
            console.print(f"  [yellow]⚠ Skipping:[/yellow] {filename} (host not in targets.json)")
            continue

        host_info = {
            'name': host_name,
            'ip': host_config['ip'],
            'environment': host_config['environment']
        }

        # Initialize host status if needed
        if host_name not in host_status:
            host_status[host_name] = {
                'ip': host_config['ip'],
                'environment': host_config['environment'],
                'open_ports': [],
                'services_found': [],
                'scans_run': [],
                'scans': {},
                'finding_ids': []
            }

        # Track this scan (exclude discovery — it's a phase, not a scan type)
        if scan_id != 'discovery' and scan_id not in host_status[host_name]['scans']:
            host_status[host_name]['scans'][scan_id] = 'clean'

        # Check if this scan actually ran (from scan_summary)
        if scan_summary_loaded:
            scans_run = scan_summary.get_scans_run(host_name)
            if scans_run and scan_id not in scans_run:
                console.print(f"  [yellow]⚠ Skipping:[/yellow] {filename} (scan not in scan_summary)")
                continue

        console.print(f"[dim]Processing:[/dim] {filename}")
        finding_ids = parse_scan_file(file_path, detector, host_info, scan_id, scan_summary)

        # Update host status with findings
        for finding_id in finding_ids:
            host_status[host_name]['finding_ids'].append(finding_id)

            # Find the finding to get severity
            finding = next((f for f in detector.findings if f['id'] == finding_id), None)
            if finding:
                severity = finding['severity']
                if severity in ['Critical', 'High']:
                    host_status[host_name]['scans'][scan_id] = 'finding'
                elif severity in ['Medium', 'Low']:
                    host_status[host_name]['scans'][scan_id] = 'warning'

        # Update scans_run list
        if scan_id not in host_status[host_name]['scans_run']:
            host_status[host_name]['scans_run'].append(scan_id)

    # Calculate summary
    summary = {
        'total_hosts': len(config['targets']),
        'total_findings': len(detector.findings),
        'critical': len([f for f in detector.findings if f['severity'] == 'Critical']),
        'high': len([f for f in detector.findings if f['severity'] == 'High']),
        'medium': len([f for f in detector.findings if f['severity'] == 'Medium']),
        'low': len([f for f in detector.findings if f['severity'] == 'Low']),
        'false_positive': 0
    }

    # Build output
    output = {
        'scan_date': date_str,
        'client': config.get('client', 'Unknown'),
        'generated_at': datetime.now().isoformat(),
        'summary': summary,
        'findings': detector.findings,
        'host_summary': host_status
    }

    # Write output
    output_file = args.base_dir / "scans" / date_str / "findings.json"
    output_file.parent.mkdir(parents=True, exist_ok=True)

    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)

    # Print summary
    console.print(f"\n[bold blue]════════════════════════════════════════[/bold blue]")
    console.print(f"[bold]Summary:[/bold]")
    console.print(f"  Total Hosts: {summary['total_hosts']}")
    console.print(f"  Total Findings: {summary['total_findings']}")
    console.print(f"  [bold red]Critical:[/bold red] {summary['critical']}")
    console.print(f"  [bold red]High:[/bold red]     {summary['high']}")
    console.print(f"  [bold yellow]Medium:[/bold yellow]   {summary['medium']}")
    console.print(f"  [bold green]Low:[/bold green]      {summary['low']}")
    console.print(f"\n[green]✓ findings.json saved to: {output_file}[/green]")


if __name__ == '__main__':
    main()
