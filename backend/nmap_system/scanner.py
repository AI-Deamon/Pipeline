#!/usr/bin/env python3
"""
BSOL Automated Penetration Testing Scanner — Parallel Two-Pool Design

Phase 1 (Discovery): Fast port scans run in parallel across all hosts
Phase 2 (Mandatory): Always run against every host, queued immediately
Phase 3 (Service-driven): Queued after discovery completes per host

Pool 1 — Discovery: Up to `parallel_discovery_workers` (default 4)
Pool 2 — Scans:      Up to `parallel_workers` (default 6)

Scans are prioritised so light scans complete before heavy ones block them.

Output:
- scans/{date}/raw/{name}_discovery.txt and {name}_discovery.json
- scans/{date}/raw/{name}_{scan_id}.txt for each scan
- scans/{date}/raw/{name}_unknown_{port}.txt for unknown services
- scans/{date}/scan_summary.json with detailed per-target status
- scans/{date}/scanner.log for logging
"""

import json
import subprocess
import sys
import time
import shutil
import logging
import argparse
import re
import ipaddress
import threading
import heapq
from concurrent.futures import ThreadPoolExecutor, as_completed
import concurrent.futures
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Callable
from rich.console import Console
from rich.live import Live
from rich.table import Table
from rich.panel import Panel

console = Console()

# Phase 2: Mandatory scans - always run against every host
MANDATORY_SCANS = [
    {"id": "ssl", "name": "SSL Cipher Enumeration", "command": "nmap -sV --script ssl-enum-ciphers {ip}"},
    {"id": "vuln", "name": "Vulnerability and Exploit Scan", "command": "nmap -Pn --script vuln,exploit {ip}"},
    {"id": "slowloris", "name": "HTTP Slowloris Check", "command": "nmap --max-parallelism 750 -Pn --script http-slowloris {ip}"},
    {"id": "aggressive", "name": "Aggressive Scan", "command": "nmap -T4 -A -v {ip}"},
]

# Aggressive scans - require explicit allow_aggressive flag
AGGRESSIVE_SCANS = [
    {"id": "brute", "name": "Brute Force Test", "command": "nmap -Pn --script brute {ip}"},
    {"id": "dos", "name": "DoS Vulnerability Scan", "command": "nmap --script dos -Pn {ip}"},
]

# Phase 3: Service-driven scans
SERVICE_SCAN_MAP = {
    "cert": {
        "triggers": ["ssl", "443", "8443", "8181"],
        "name": "Certificate Expiry Check",
        "command": "nmap -p {ports} --script ssl-cert {ip}"
    },
    "headers": {
        "triggers": ["ssl", "443", "8443", "80"],
        "name": "HTTP Security Headers Check",
        "command": "nmap -p {ports} --script http-security-headers {ip}"
    },
    "methods": {
        "triggers": ["ssl", "443", "80", "8443"],
        "name": "HTTP Methods Check",
        "command": "nmap -p {ports} --script http-methods {ip}"
    },
    "rdp": {
        "triggers": ["ms-wbt-server", "3389"],
        "name": "RDP Vulnerability Check",
        "command": "nmap -p 3389 --script rdp-vuln-ms12-020,rdp-enum-encryption {ip}"
    },
    "smtp": {
        "triggers": ["smtp", "25"],
        "name": "SMTP Security Check",
        "command": "nmap -p 25 --script smtp-open-relay,smtp-starttls {ip}"
    },
    "ssh": {
        "triggers": ["ssh", "22"],
        "name": "SSH Security Check",
        "command": "nmap -p 22 --script ssh-auth-methods,ssh2-enum-algos {ip}"
    },
    "mssql": {
        "triggers": ["ms-sql", "1433"],
        "name": "MSSQL Security Check",
        "command": "nmap -p 1433 --script ms-sql-info,ms-sql-empty-password {ip}"
    },
    "mysql": {
        "triggers": ["mysql", "3306"],
        "name": "MySQL Security Check",
        "command": "nmap -p 3306 --script mysql-info,mysql-empty-password {ip}"
    },
    "ftp": {
        "triggers": ["ftp", "21"],
        "name": "FTP Security Check",
        "command": "nmap -p 21 --script ftp-anon,ftp-bounce {ip}"
    },
    "smb": {
        "triggers": ["smb", "445"],
        "name": "SMB Vulnerability Check",
        "command": "nmap -p 445 --script smb-vuln-ms17-010,smb-security-mode {ip}"
    },
}

# Scan priority — lower number = higher priority
SCAN_PRIORITIES = {
    "ssl":        1,  # Fast, 30s-2min
    "cert":       1,
    "headers":    1,
    "methods":    1,
    "rdp":        1,
    "smtp":       1,
    "ssh":        1,
    "ftp":        1,
    "smb":        1,
    "mysql":      1,
    "mssql":      1,
    "aggressive": 2,  # Medium, 2-10min
    "slowloris":  2,
    "vuln":       3,  # Slow, 10-40min — start early but don't block
    "brute":      4,  # Potentially very slow and disruptive
    "dos":        4,
}


# ===========================================================================
# ScanJob dataclass
# ===========================================================================

@dataclass(order=True)
class ScanJob:
    """A single scan task for the parallel executor."""
    priority: int
    scan_id: str = field(compare=False)
    target_name: str = field(compare=False)
    scan_name: str = field(compare=False)
    command: str = field(compare=False)
    output_file: Path = field(compare=False)
    scan_type_label: str = field(compare=False)
    target_ip: str = field(compare=False, default="")
    target_env: str = field(compare=False, default="")


# ===========================================================================
# Core scan functions (unchanged logic, called from worker threads)
# ===========================================================================

def validate_config(config: Dict[str, Any]) -> None:
    """Validate targets.json structure"""
    required_fields = ['client', 'month', 'targets']
    for field_name in required_fields:
        if field_name not in config:
            raise ValueError(f"Missing required field in targets.json: {field_name}")

    valid_environments = ['Production', 'UAT', 'Test']
    for target in config['targets']:
        for field_name in ['ip', 'name', 'environment']:
            if field_name not in target:
                raise ValueError(f"Target missing field '{field_name}': {target}")

        try:
            ipaddress.ip_address(target['ip'])
        except ValueError:
            raise ValueError(f"Invalid IP address format: {target['ip']}")

        if target['environment'] not in valid_environments:
            raise ValueError(f"Invalid environment for {target['name']}: {target['environment']}")


def check_nmap_installed() -> None:
    """Check if nmap is installed and accessible"""
    if not shutil.which('nmap'):
        console.print("[bold red]❌ Error:[/bold red] nmap is not installed.")
        console.print("Install with: sudo apt install nmap")
        sys.exit(1)


def get_scan_header(scan_name: str, target: Dict[str, str], command: str,
                    date_str: str, time_str: str) -> str:
    """Generate the metadata header for scan output files"""
    return f"""================================================================================
SCAN: {scan_name}
TARGET: {target['name']}
IP: {target['ip']}
ENVIRONMENT: {target['environment']}
DATE: {date_str}
TIME: {time_str}
COMMAND: {command}
================================================================================

"""


def parse_discovery_output(raw_output: str) -> List[Dict[str, Any]]:
    """Parse nmap discovery output to extract open ports, services, and versions."""
    open_ports = []
    port_pattern = re.compile(
        r'^(\d+)/(\w+)\s+open\s+(\S+)(?:\s+(.*))?$',
        re.MULTILINE
    )

    for match in port_pattern.finditer(raw_output):
        port_num = int(match.group(1))
        protocol = match.group(2)
        service = match.group(3)
        version = match.group(4).strip() if match.group(4) else ""

        if service in ['open', 'closed', 'filtered']:
            continue

        open_ports.append({
            "port": port_num,
            "protocol": protocol,
            "service": service,
            "version": version
        })

    return open_ports


def run_discovery_scan(target: Dict[str, str], output_dir: Path,
                       logger: logging.Logger, dry_run: bool = False) -> Dict[str, Any]:
    """
    Phase 1: Run fast discovery scan and parse open ports.
    Returns dict with open_ports, unknown_ports.
    """
    ip = target['ip']
    name = target['name']
    command = f"nmap -T4 -F --open {ip}"
    date_str = datetime.now().strftime('%Y-%m-%d')
    time_str = datetime.now().strftime('%H:%M:%S')

    txt_file = output_dir / f"{name}_discovery.txt"
    json_file = output_dir / f"{name}_discovery.json"

    if dry_run:
        status = "EXISTS" if txt_file.exists() else "PENDING"
        console.print(f"  [cyan]Discovery scan...[/cyan] [{status}]")
        return {"status": status, "dry_run": True, "open_ports": [], "unknown_ports": []}

    # Resume check
    if txt_file.exists() and json_file.exists():
        logger.info(f"Discovery already exists for {name}, loading from cache")
        with open(json_file) as f:
            return json.load(f)

    logger.info(f"Starting discovery scan for {name} ({ip})")

    try:
        command_list = command.split()
        result = subprocess.run(
            command_list,
            capture_output=True,
            text=True,
            timeout=3600
        )

        raw_output = result.stdout
        if result.stderr:
            raw_output += f"\n--- STDERR ---\n{result.stderr}"

        header = get_scan_header("Discovery Scan", target, command, date_str, time_str)
        full_output = header + raw_output
        txt_file.parent.mkdir(parents=True, exist_ok=True)
        txt_file.write_text(full_output)

        open_ports = parse_discovery_output(raw_output)
        unknown_ports = [p['port'] for p in open_ports if not p['service'] or p['service'] == 'unknown']

        discovery_result = {
            "host": name,
            "ip": ip,
            "environment": target['environment'],
            "open_ports": open_ports,
            "unknown_ports": unknown_ports
        }

        with open(json_file, 'w') as f:
            json.dump(discovery_result, f, indent=2)

        logger.info(f"Discovery complete for {name}: {len(open_ports)} open ports")
        return discovery_result

    except subprocess.TimeoutExpired:
        txt_file.write_text("ERROR: Scan timed out after 1 hour\n")
        logger.error(f"Discovery scan TIMEOUT for {name}")
        return {"open_ports": [], "unknown_ports": [], "error": "timeout"}
    except Exception as e:
        logger.error(f"Discovery scan ERROR for {name}: {e}")
        return {"open_ports": [], "unknown_ports": [], "error": str(e)}


def handle_unknown_services(target: Dict[str, str], discovery_result: Dict[str, Any],
                           output_dir: Path, logger: logging.Logger,
                           dry_run: bool = False) -> List[int]:
    """Create files for unknown services found during discovery."""
    unknown_ports = discovery_result.get('unknown_ports', [])
    created_files = []

    if not unknown_ports:
        return created_files

    discovery_file = output_dir / f"{target['name']}_discovery.txt"
    raw_lines = []
    if discovery_file.exists():
        raw_lines = discovery_file.read_text().split('\n')

    for port in unknown_ports:
        unknown_file = output_dir / f"{target['name']}_unknown_{port}.txt"

        if dry_run:
            status = "EXISTS" if unknown_file.exists() else "PENDING"
            console.print(f"  [yellow]Unknown port {port}: [{status}][/yellow]")
            continue

        if unknown_file.exists():
            logger.info(f"Unknown service file exists for {target['name']} port {port}")
            created_files.append(port)
            continue

        raw_line = ""
        for line in raw_lines:
            if f"{port}/" in line and "open" in line:
                raw_line = line
                break

        content = f"""UNKNOWN SERVICE DETECTED
Port: {port}
Raw nmap output: {raw_line}
"""
        unknown_file.write_text(content)
        created_files.append(port)
        logger.info(f"Created unknown service file for {target['name']} port {port}")
        console.print(f"  [yellow]⚠ Unknown service on port {port}[/yellow]")

    return created_files


def execute_single_scan(job: ScanJob, logger: logging.Logger) -> Dict[str, Any]:
    """
    Execute one scan job. Thread-safe: writes its own unique output file.
    Returns a result dict for the summary tracker.
    """
    command_str = job.command
    target_name = job.target_name
    scan_name = job.scan_name
    output_file = job.output_file
    date_str = datetime.now().strftime('%Y-%m-%d')
    time_str = datetime.now().strftime('%H:%M:%S')
    start_time = time.time()

    try:
        command_list = command_str.split()
        result = subprocess.run(
            command_list,
            capture_output=True,
            text=True,
            timeout=3600
        )

        duration = int(time.time() - start_time)

        # Build output with header
        header = get_scan_header(scan_name, {
            "name": job.target_name,
            "ip": job.target_ip,
            "environment": job.target_env,
        }, command_str, date_str, time_str)
        output_content = header + (result.stdout or "")
        if result.stderr:
            output_content += f"\n--- STDERR ---\n{result.stderr}"

        output_file.parent.mkdir(parents=True, exist_ok=True)
        output_file.write_text(output_content)

        success = result.returncode == 0
        logger.info(f"Scan {job.scan_id} on {target_name}: {'success' if success else 'failed'} ({duration}s)")

        return {
            "scan_id": job.scan_id,
            "success": success,
            "duration": duration,
            "status": "done" if success else "failed"
        }

    except subprocess.TimeoutExpired:
        output_file.write_text("ERROR: Scan timed out after 1 hour\n")
        logger.error(f"Scan {job.scan_id} on {target_name}: TIMEOUT")
        return {"scan_id": job.scan_id, "success": False, "duration": 3600, "status": "timeout"}
    except Exception as e:
        output_file.write_text(f"ERROR: {str(e)}\n")
        logger.error(f"Scan {job.scan_id} on {target_name}: {str(e)}")
        return {"scan_id": job.scan_id, "success": False, "duration": 0, "status": "error", "error": str(e)}


def determine_service_scans(discovery_result: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Determine which service-driven scans to run based on discovery results."""
    open_ports = discovery_result.get('open_ports', [])
    services_to_scan = {}

    found_services = set()
    found_ports = set()

    for port_info in open_ports:
        service = port_info.get('service', '').lower()
        port_num = str(port_info.get('port', ''))

        if service:
            found_services.add(service)
        if port_num:
            found_ports.add(port_num)

    for scan_id, scan_info in SERVICE_SCAN_MAP.items():
        triggers = scan_info.get('triggers', [])
        matched = False
        matched_ports = []

        for trigger in triggers:
            if trigger in found_services:
                matched = True
            if trigger in found_ports:
                matched = True
                for port_info in open_ports:
                    port_str = str(port_info['port'])
                    service_str = port_info.get('service', '').lower()
                    if port_str == trigger:
                        matched_ports.append(port_str)
                    elif service_str == trigger and port_str not in matched_ports:
                        matched_ports.append(port_str)

        if matched:
            matched_ports = list(dict.fromkeys(matched_ports))

            if not matched_ports:
                matched_ports = [t for t in triggers if t.isdigit()]

            scan_data = scan_info.copy()
            scan_data['ports'] = ','.join(matched_ports) if matched_ports else triggers[0]
            services_to_scan[scan_id] = scan_data

    return services_to_scan


# ===========================================================================
# Job builders — return lists of ScanJob, don't execute
# ===========================================================================

def build_mandatory_jobs(target: Dict[str, str], output_dir: Path,
                         scan_filter: Optional[str] = None) -> List[ScanJob]:
    """Return list of ScanJob for mandatory scans. Does not execute."""
    jobs = []
    allow_aggressive = target.get('allow_aggressive', False)

    for scan in MANDATORY_SCANS:
        scan_id = scan['id']
        if scan_filter and scan_id != scan_filter:
            continue
        output_file = output_dir / f"{target['name']}_{scan_id}.txt"
        priority = SCAN_PRIORITIES.get(scan_id, 5)
        jobs.append(ScanJob(
            priority=priority,
            scan_id=scan_id,
            target_name=target['name'],
            target_ip=target['ip'],
            target_env=target['environment'],
            scan_name=scan['name'],
            command=scan['command'].format(ip=target['ip']),
            output_file=output_file,
            scan_type_label="mandatory"
        ))

    if allow_aggressive:
        for scan in AGGRESSIVE_SCANS:
            scan_id = scan['id']
            if scan_filter and scan_id != scan_filter:
                continue
            output_file = output_dir / f"{target['name']}_{scan_id}.txt"
            priority = SCAN_PRIORITIES.get(scan_id, 5)
            jobs.append(ScanJob(
                priority=priority,
                scan_id=scan_id,
                target_name=target['name'],
                scan_name=scan['name'],
                command=scan['command'].format(ip=target['ip']),
                output_file=output_file,
                scan_type_label="aggressive"
            ))
    else:
        # Add skip entries for aggressive scans
        for scan in AGGRESSIVE_SCANS:
            scan_id = scan['id']
            if scan_filter and scan_id != scan_filter:
                continue
            jobs.append(ScanJob(
                priority=99,
                scan_id=scan_id,
                target_name=target['name'],
                target_ip=target['ip'],
                target_env=target['environment'],
                scan_name=scan['name'],
                command="",
                output_file=None,
                scan_type_label="aggressive_skip"
            ))

    return jobs


def build_service_jobs(discovery_result: Dict[str, Any], target: Dict[str, str],
                       output_dir: Path, scan_filter: Optional[str] = None) -> List[ScanJob]:
    """Return list of ScanJob for service-driven scans. Does not execute."""
    jobs = []
    scans_to_run = determine_service_scans(discovery_result)

    for scan_id, scan_info in scans_to_run.items():
        if scan_filter and scan_id != scan_filter:
            continue

        ports = scan_info.get('ports', '')
        command = scan_info['command'].format(ip=target['ip'], ports=ports)
        output_file = output_dir / f"{target['name']}_{scan_id}.txt"
        priority = SCAN_PRIORITIES.get(scan_id, 5)

        jobs.append(ScanJob(
            priority=priority,
            scan_id=scan_id,
            target_name=target['name'],
            target_ip=target['ip'],
            target_env=target['environment'],
            scan_name=scan_info['name'],
            command=command,
            output_file=output_file,
            scan_type_label="service"
        ))

    return jobs


# ===========================================================================
# Parallel executor with Rich Live progress table
# ===========================================================================

class ScanProgress:
    """Thread-safe progress tracker for the live status table."""

    def __init__(self):
        self._lock = threading.Lock()
        self._tasks: Dict[str, Dict[str, Any]] = {}  # key = "host:scan_id"

    def register(self, key: str, host: str, scan_name: str, scan_id: str):
        with self._lock:
            self._tasks[key] = {
                "host": host,
                "scan_name": scan_name,
                "scan_id": scan_id,
                "status": "QUEUED",
                "duration": "—",
                "start_time": None
            }

    def start(self, key: str):
        with self._lock:
            if key in self._tasks:
                self._tasks[key]["status"] = "RUNNING"
                self._tasks[key]["start_time"] = time.time()

    def complete(self, key: str, success: bool, duration: int):
        with self._lock:
            if key in self._tasks:
                mins = duration // 60
                secs = duration % 60
                self._tasks[key]["duration"] = f"{mins}m {secs}s"
                self._tasks[key]["status"] = "DONE ✓" if success else f"{'TIMEOUT' if duration >= 3600 else 'FAILED ✗'}"

    def skip(self, key: str, reason: str):
        with self._lock:
            if key in self._tasks:
                self._tasks[key]["status"] = f"SKIPPED ({reason})"

    def running_count(self) -> int:
        with self._lock:
            return sum(1 for t in self._tasks.values() if t["status"] == "RUNNING")

    def done_count(self) -> int:
        with self._lock:
            return sum(1 for t in self._tasks.values() if t["status"].startswith("DONE"))

    def failed_count(self) -> int:
        with self._lock:
            return sum(1 for t in self._tasks.values() if "FAILED" in t["status"] or "TIMEOUT" in t["status"])

    def queued_count(self) -> int:
        with self._lock:
            return sum(1 for t in self._tasks.values() if t["status"] == "QUEUED")

    def get_tasks(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._tasks.values())

    def get_running_durations(self) -> Dict[str, str]:
        """Get formatted durations for currently running tasks."""
        with self._lock:
            result = {}
            for key, task in self._tasks.items():
                if task["status"] == "RUNNING" and task.get("start_time"):
                    elapsed = int(time.time() - task["start_time"])
                    mins = elapsed // 60
                    secs = elapsed % 60
                    result[key] = f"{mins}m {secs}s"
            return result


def build_progress_table(progress: ScanProgress, total_jobs: int) -> Table:
    """Build a Rich Table showing current scan progress."""
    table = Table(
        title=f"[bold]BSOL Scanner[/bold] — {progress.running_count()} running, "
              f"{progress.done_count()} done, {progress.failed_count()} failed, "
              f"{progress.queued_count()} queued / {total_jobs} total",
        show_header=True,
        header_style="bold blue",
    )
    table.add_column("Host", style="cyan", width=18)
    table.add_column("Scan", style="white", width=28)
    table.add_column("Status", style="bold", width=22)
    table.add_column("Duration", style="yellow", width=12)

    tasks = progress.get_tasks()
    running_durations = progress.get_running_durations()

    # Sort: running first, then queued, then done/skipped
    def sort_key(t):
        if t["status"] == "RUNNING":
            return (0, t["host"])
        elif t["status"] == "QUEUED":
            return (1, t["host"])
        else:
            return (2, t["host"])

    tasks.sort(key=sort_key)

    for task in tasks:
        key = f"{task['host']}:{task['scan_id']}"
        duration = running_durations.get(key, task["duration"])
        status = task["status"]

        # Color code status
        if "RUNNING" in status:
            status_style = "[bold green]"
        elif "DONE" in status:
            status_style = "[dim]"
        elif "FAILED" in status or "TIMEOUT" in status:
            status_style = "[bold red]"
        elif "SKIPPED" in status:
            status_style = "[dim yellow]"
        else:
            status_style = "[dim]"

        table.add_row(
            task["host"],
            task["scan_name"],
            f"{status_style}{status}[/]",
            duration
        )

    return table


def run_parallel_executor(jobs: List[ScanJob], progress: ScanProgress,
                          workers: int, logger: logging.Logger,
                          skip_existing: bool = True,
                          live_display = None) -> Dict[str, List[str]]:
    """
    Execute a list of ScanJob in parallel using ThreadPoolExecutor.
    Updates the progress tracker in real-time. Caller should wrap this
    in a Rich Live() for display.

    Returns dict with scans_run, scans_skipped, scans_failed lists.
    """
    result = {"scans_run": [], "scans_skipped": [], "scans_failed": [], "skip_reasons": {}}

    # Filter out skip jobs and already-existing files
    executable_jobs = []
    for job in jobs:
        key = f"{job.target_name}:{job.scan_id}"

        if job.scan_type_label == "aggressive_skip":
            result["scans_skipped"].append(job.scan_id)
            result["skip_reasons"][job.scan_id] = "aggressive scans not allowed"
            continue

        if skip_existing and job.output_file and job.output_file.exists():
            result["scans_skipped"].append(job.scan_id)
            result["skip_reasons"][job.scan_id] = "already exists"
            continue

        executable_jobs.append(job)

    # Sort by priority (heapq — lowest number first)
    heapq.heapify(executable_jobs)

    if not executable_jobs:
        return result

    total_jobs = len(executable_jobs)
    # Register all executable jobs with progress
    for job in executable_jobs:
        key = f"{job.target_name}:{job.scan_id}"
        progress.register(key, job.target_name, job.scan_name, job.scan_id)

    # Execute with thread pool
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {}
        job_map = {}  # future -> job key

        while executable_jobs or futures:
            # Fill available worker slots
            while executable_jobs and len(futures) < workers:
                job = heapq.heappop(executable_jobs)
                key = f"{job.target_name}:{job.scan_id}"
                progress.start(key)
                future = executor.submit(execute_single_scan, job, logger)
                futures[future] = job
                job_map[future] = key

            if not futures:
                break

            # Use wait with timeout so progress table updates continuously
            done, _ = concurrent.futures.wait(futures, return_when=concurrent.futures.FIRST_COMPLETED, timeout=1.0)

            for future in done:
                job = futures.pop(future)
                key = job_map.pop(future)
                try:
                    scan_result = future.result()
                    if scan_result["success"]:
                        result["scans_run"].append(job.scan_id)
                        progress.complete(key, True, scan_result["duration"])
                    else:
                        result["scans_failed"].append(job.scan_id)
                        result["skip_reasons"][job.scan_id] = scan_result.get("status", "unknown")
                        progress.complete(key, False, scan_result["duration"])
                except Exception as e:
                    result["scans_failed"].append(job.scan_id)
                    result["skip_reasons"][job.scan_id] = str(e)
                    progress.complete(key, False, 0)

            # Update the live display on every iteration (running durations change each second)
            if live_display is not None:
                live_display.update(build_progress_table(progress, len(jobs)))

    return result


# ===========================================================================
# Main orchestrator
# ===========================================================================

def run_scanner(config: Dict[str, Any], date_str: str, target_filter: Optional[str] = None,
               scan_filter: Optional[str] = None, phase: str = "all",
               dry_run: bool = False) -> None:
    """
    Parallel two-pool scanner orchestrator.

    Pool 1 (Discovery): Runs all discovery scans in parallel
    Pool 2 (Scans): Runs all mandatory + service scans in parallel with priority
    """
    base_dir = Path(f"scans/{date_str}")
    raw_dir = base_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    # Setup logging
    log_file = base_dir / "scanner.log"
    logging.basicConfig(
        filename=log_file,
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        filemode='a',
        force=True
    )
    logger = logging.getLogger(__name__)

    # Parallel config
    num_workers = min(config.get('parallel_workers', 6), 10)
    num_discovery_workers = min(config.get('parallel_discovery_workers', 4), 8)

    # Handle dry-run mode
    if dry_run:
        console.print("\n[yellow]╔════════════════════════════════════════╗[/yellow]")
        console.print("[yellow]║   DRY RUN — no scans will execute      ║[/yellow]")
        console.print("[yellow]╚════════════════════════════════════════╝[/yellow]\n")

    # Print header
    if not dry_run:
        console.print(Panel.fit(
            f"[bold blue]BSOL Automated Penetration Testing Scanner[/bold blue]\n"
            f"Client: {config['client']}\n"
            f"Date: {date_str}\n"
            f"Phase: {phase} | Workers: {num_workers} scans, {num_discovery_workers} discovery",
            border_style="blue"
        ))

    # Filter targets
    targets = config['targets']
    if target_filter:
        targets = [t for t in targets if t['name'] == target_filter]
        if not targets:
            console.print(f"[bold red]Error:[/bold red] Target '{target_filter}' not found")
            sys.exit(1)

    # Thread-safe summary tracker
    summary_lock = threading.Lock()
    scan_summary = {
        "date": date_str,
        "client": config['client'],
        "targets": {}
    }

    total_targets = len(targets)
    progress = ScanProgress()

    # ===========================================================================
    # DRY-RUN MODE
    # ===========================================================================
    if dry_run:
        for target_idx, target in enumerate(targets, 1):
            console.print(f"\n[bold cyan][{target_idx}/{total_targets}] Target: {target['name']} ({target['ip']}) — {target['environment']}[/bold cyan]")
            console.print(f"  [cyan]Discovery scan...[/cyan] [PENDING]")

            for scan in MANDATORY_SCANS:
                if scan_filter and scan['id'] != scan_filter:
                    continue
                output_file = raw_dir / f"{target['name']}_{scan['id']}.txt"
                status = "EXISTS" if output_file.exists() else "PENDING"
                console.print(f"  Would run: {scan['name']} [{status}]")

            allow_aggressive = target.get('allow_aggressive', False)
            if allow_aggressive:
                for scan in AGGRESSIVE_SCANS:
                    if scan_filter and scan['id'] != scan_filter:
                        continue
                    output_file = raw_dir / f"{target['name']}_{scan['id']}.txt"
                    status = "EXISTS" if output_file.exists() else "PENDING"
                    console.print(f"  Would run: {scan['name']} [{status}]")
            else:
                for scan in AGGRESSIVE_SCANS:
                    if scan_filter and scan['id'] != scan_filter:
                        continue
                    console.print(f"  Skipped: {scan['name']} [aggressive not allowed]")

            console.print(f"  [yellow]Service scans: (depends on discovery results)[/yellow]")
            for scan_id, scan_info in SERVICE_SCAN_MAP.items():
                if scan_filter and scan_id != scan_filter:
                    continue
                output_file = raw_dir / f"{target['name']}_{scan_id}.txt"
                status = "EXISTS" if output_file.exists() else "PENDING"
                console.print(f"    {scan_info['name']}... [{status}]")

        console.print(f"\n[yellow]Dry run complete. No files modified.[/yellow]")
        return

    # ===========================================================================
    # PHASE: DISCOVERY (only)
    # ===========================================================================
    if phase == "discovery":
        console.print(f"\n[bold cyan]Running discovery on {total_targets} targets...[/bold cyan]\n")

        with ThreadPoolExecutor(max_workers=num_discovery_workers) as executor:
            futures = {}
            for target in targets:
                future = executor.submit(run_discovery_scan, target, raw_dir, logger, False)
                futures[future] = target

            for future in as_completed(futures):
                target = futures[future]
                try:
                    result = future.result()
                    open_ports = result.get("open_ports", [])
                    console.print(f"  [green]✓[/green] {target['name']}: {len(open_ports)} open ports")

                    handle_unknown_services(target, result, raw_dir, logger, False)
                except Exception as e:
                    console.print(f"  [red]✗ {target['name']}: {e}[/red]")

        console.print(f"\n[bold green]✅ Discovery complete.[/bold green]")
        return

    # ===========================================================================
    # FULL SCAN or phase=all — Two-pool parallel execution
    # ===========================================================================

    # Phase 1: Run all discovery scans in parallel
    discovery_results = {}
    console.print(f"\n[bold cyan]Phase 1: Discovery — {total_targets} targets[/bold cyan]")

    with Live(build_progress_table(progress, 0), refresh_per_second=2, console=console) as live:
        with ThreadPoolExecutor(max_workers=num_discovery_workers) as executor:
            futures = {}
            for target in targets:
                future = executor.submit(run_discovery_scan, target, raw_dir, logger, False)
                futures[future] = target

            for future in as_completed(futures):
                target = futures[future]
                try:
                    result = future.result()
                    discovery_results[target['name']] = result
                    open_ports = result.get("open_ports", [])
                    console.print(f"  [green]✓[/green] {target['name']}: {len(open_ports)} open ports")
                    live.update(build_progress_table(progress, 0))
                except Exception as e:
                    console.print(f"  [red]✗ {target['name']}: {e}[/red]")
                    discovery_results[target['name']] = {"open_ports": [], "unknown_ports": [], "error": str(e)}

        # Handle unknown services for all targets
        for target in targets:
            result = discovery_results.get(target['name'], {"open_ports": [], "unknown_ports": []})
            handle_unknown_services(target, result, raw_dir, logger, False)

    # Phase 2 + 3: Build ALL scan jobs, execute in parallel with priority
    console.print(f"\n[bold cyan]Phase 2+3: Building scan jobs for {total_targets} targets...[/bold cyan]")

    all_jobs: List[ScanJob] = []
    target_summaries = {}

    for target in targets:
        target_summary = {
            "ip": target['ip'],
            "environment": target['environment'],
            "discovery": {
                "open_ports": discovery_results.get(target['name'], {}).get("open_ports", []),
                "unknown_ports": discovery_results.get(target['name'], {}).get("unknown_ports", [])
            },
            "scans_run": [],
            "scans_skipped": [],
            "scans_failed": [],
            "skip_reasons": {},
            "scans": {}  # For risk dashboard
        }
        target_summaries[target['name']] = target_summary

        # Build mandatory + aggressive jobs
        mandatory_jobs = build_mandatory_jobs(target, raw_dir, scan_filter)
        all_jobs.extend(mandatory_jobs)

        # Build service jobs (discovery already complete)
        disc_result = discovery_results.get(target['name'], {"open_ports": []})
        service_jobs = build_service_jobs(disc_result, target, raw_dir, scan_filter)
        all_jobs.extend(service_jobs)

    # Execute all scan jobs in parallel with priority
    total_jobs = len(all_jobs)

    # Register all jobs with progress tracker
    for job in all_jobs:
        key = f"{job.target_name}:{job.scan_id}"
        if job.scan_type_label == "aggressive_skip":
            progress.skip(key, "aggressive not allowed")
        elif job.output_file and job.output_file.exists():
            progress.skip(key, "exists")
        else:
            progress.register(key, job.target_name, job.scan_name, job.scan_id)

    # Count how many will actually execute
    runnable_jobs = sum(1 for job in all_jobs
                       if job.scan_type_label != "aggressive_skip"
                       and not (job.output_file and job.output_file.exists()))

    console.print(f"  [bold]{runnable_jobs}/{len(all_jobs)} jobs will execute, {num_workers} workers, priority-ordered[/bold]\n")

    # Run parallel executor with live progress table
    try:
        with Live(build_progress_table(progress, len(all_jobs)),
                  refresh_per_second=1, console=console,
                  transient=False) as live:
            result = run_parallel_executor(all_jobs, progress, num_workers, logger,
                                           live_display=live)
            # Final table refresh
            live.update(build_progress_table(progress, len(all_jobs)))
    except KeyboardInterrupt:
        console.print("\n[yellow]⚠ Scan interrupted — cancelling remaining jobs...[/yellow]")
        result = {"scans_run": [], "scans_skipped": [], "scans_failed": [], "skip_reasons": {}}

    # Build per-target summary from results
    # We need to track which scans ran/failed per target
    # The executor returns flat lists — we need to distribute them back to targets
    # Re-scan the all_jobs list to know which jobs were for which target
    target_scan_map: Dict[str, List[str]] = {}  # target_name -> list of scan_ids
    for job in all_jobs:
        if job.scan_type_label == "aggressive_skip":
            continue
        target_scan_map.setdefault(job.target_name, []).append(job.scan_id)

    # Process results per target
    for target_name, scan_ids in target_scan_map.items():
        ts = target_summaries.get(target_name)
        if not ts:
            continue

        for scan_id in scan_ids:
            if scan_id in result.get("scans_run", []):
                ts["scans_run"].append(scan_id)
                ts["scans"][scan_id] = "clean"  # Will be updated by parser
            elif scan_id in result.get("scans_skipped", []):
                reason = result["skip_reasons"].get(scan_id, "already exists")
                if "aggressive" in reason:
                    pass  # Don't add to scans dict — didn't run
                else:
                    ts["scans_skipped"].append(scan_id)
                ts["skip_reasons"][scan_id] = reason
            elif scan_id in result.get("scans_failed", []):
                ts["scans_failed"].append(scan_id)
                reason = result["skip_reasons"].get(scan_id, "scan failed")
                ts["scans"][scan_id] = None  # Mark as failed in dashboard
                ts["skip_reasons"][scan_id] = reason

    # Write scan summary
    with summary_lock:
        scan_summary["targets"] = target_summaries
        summary_file = base_dir / "scan_summary.json"
        with open(summary_file, 'w') as f:
            json.dump(scan_summary, f, indent=2)

    console.print(f"\n[bold green]✅ All scans complete. Output saved to: {base_dir}/[/bold green]")
    logger.info(f"All scans complete. Summary saved to {summary_file}")


def main():
    """Main entry point with CLI argument parsing"""
    parser = argparse.ArgumentParser(
        description='BSOL Automated Penetration Testing Scanner',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 scanner.py                          # Run all phases on all targets (parallel)
  python3 scanner.py --phase discovery        # Run only discovery phase
  python3 scanner.py --target Prod-Audit      # Scan only one target
  python3 scanner.py --scan ssl               # Run only ssl scan
  python3 scanner.py --date 2026-03-24        # Use specific date folder
  python3 scanner.py --dry-run                # Show what would run
        """
    )

    parser.add_argument('--date', type=str, help='Use specific date folder (YYYY-MM-DD)')
    parser.add_argument('--target', type=str, help='Scan only one target by name')
    parser.add_argument('--scan', type=str, help='Run only one specific scan ID')
    parser.add_argument('--dry-run', action='store_true', help='Print what would run without executing')
    parser.add_argument('--phase', type=str, choices=['discovery', 'all'], default='all',
                        help='Which phase(s) to run (default: all)')

    args = parser.parse_args()

    check_nmap_installed()

    # Load targets.json
    config_file = Path('targets.json')
    if not config_file.exists():
        config_file = Path('../targets.json')

    if not config_file.exists():
        console.print("[bold red]❌ Error:[/bold red] targets.json not found.")
        console.print("Expected location: pentest_system/targets.json or current directory")
        sys.exit(1)

    try:
        with open(config_file) as f:
            config = json.load(f)
        validate_config(config)
    except json.JSONDecodeError as e:
        console.print(f"[bold red]❌ Error:[/bold red] Invalid JSON: {e}")
        sys.exit(1)
    except ValueError as e:
        console.print(f"[bold red]❌ Error:[/bold red] {e}")
        sys.exit(1)

    date_str = args.date or datetime.now().strftime('%Y-%m-%d')

    if args.date:
        try:
            datetime.strptime(args.date, '%Y-%m-%d')
        except ValueError:
            console.print("[bold red]Error:[/bold red] Invalid date format. Use YYYY-MM-DD")
            sys.exit(1)

    log_file = Path(f"scans/{date_str}/scanner.log")
    try:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        logging.basicConfig(
            filename=log_file,
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            filemode='a'
        )
    except Exception:
        pass

    try:
        run_scanner(
            config, date_str,
            target_filter=args.target,
            scan_filter=args.scan,
            phase=args.phase,
            dry_run=args.dry_run
        )
    except KeyboardInterrupt:
        console.print("\n[yellow]Scan interrupted by user[/yellow]")
        sys.exit(1)
    except Exception as e:
        console.print(f"[bold red]❌ Error:[/bold red] {e}")
        logging.exception("Unhandled exception")
        sys.exit(1)


if __name__ == '__main__':
    main()
