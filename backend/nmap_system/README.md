# BSOL Penetration Testing System

Automated penetration testing pipeline for running nmap-based security scans, detecting vulnerabilities, and generating professional reports.

## Quick Start

```bash
# Activate virtual environment
source .venv/bin/activate

# 1. Edit targets.json to configure your targets
# 2. Run the scanner
python3 scanner.py

# 3. Parse results
python3 parser.py

# 4. (Optional) Run AI validation - requires Ollama running
python3 ai_agent.py

# 5. Generate reports
python3 reporter.py
```

## Components

| File | Description |
|------|-------------|
| `targets.json` | Configuration file with client info and target list |
| `scanner.py` | Runs all 11 nmap scan types against targets |
| `parser.py` | Parses raw output and detects vulnerabilities |
| `ai_agent.py` | Optional AI validation via local Ollama |
| `reporter.py` | Generates PDF and HTML reports |

## The 11 Scan Types

1. SSL Cipher Enumeration
2. Brute Force Test
3. DoS Vulnerability Scan
4. Vulnerability & Exploit Scan
5. HTTP Slowloris Check
6. Aggressive Scan
7. Certificate Expiry Check
8. RDP Vulnerability Check
9. HTTP Security Headers Check
10. HTTP Methods Check
11. SMTP Security Check

## Output Structure

```
scans/
└── YYYY-MM-DD/
    ├── raw/              # Raw nmap output files
    ├── findings.json     # Detected vulnerabilities
    ├── scan_summary.json # Scanner execution summary
    ├── scanner.log       # Scanner log file
    └── reports/          # Generated PDF and HTML reports
```

## CLI Options

### scanner.py
```bash
python3 scanner.py --date 2026-03-25    # Use specific date
python3 scanner.py --target Prod-Audit  # Scan single target
python3 scanner.py --scan ssl           # Run single scan type
```

### parser.py
```bash
python3 parser.py --date 2026-03-25     # Parse specific date
```

### reporter.py
```bash
python3 reporter.py --date 2026-03-25   # Generate for specific date
python3 reporter.py --pdf-only          # PDF only
python3 reporter.py --html-only         # HTML only
```

### ai_agent.py
```bash
python3 ai_agent.py --date 2026-03-25   # Process specific date
# Requires ai_agent: true in targets.json and Ollama running
```

## Dependencies

```bash
pip3 install rich reportlab requests
```

Or use the included virtual environment:
```bash
python3 -m venv .venv
.venv/bin/pip install rich reportlab requests
```

## Requirements

- Python 3.9+
- nmap installed on system
- Ollama running locally (for AI agent only)

## License

Confidential — BSOL Systems Pvt Ltd
