# Infrastructure Architecture Diagrams

This document provides a comprehensive view of the platform's infrastructure, trust boundaries, and data flows.

## 1. High-Level Infrastructure (Executive View)

The platform follows a strict hierarchical communication pattern to ensure separation of concerns.

```
┌────────────┐
│   Users    │
└─────┬──────┘
      │ HTTPS
┌─────▼──────┐
│   Web UI   │  (React Static App / Nginx)
└─────┬──────┘
      │ REST (/api/v1)
┌─────▼────────────┐
│   Backend API    │  ← SOURCE OF TRUTH (FastAPI)
└─────┬────────────┘
      │ Trigger (Job Payload)
┌─────▼───────────┐
│     Jenkins     │  ← ORCHESTRATOR (Controller)
└─────┬───────────┘
      │ Agent Exec
┌─────▼───────────┐
│  Kali Agent     │  ← EXECUTION PLANE (Isolated VM)
└─────┬───────────┘
      │ Artifacts
┌─────▼───────────┐
│ Artifact Store  │  ← Normalized Results
└─────────────────┘
```

## 2. Trust Boundaries (Security View)

Isolation is enforced at every layer to prevent lateral movement and unauthorized access.

```
────────────── TRUST BOUNDARY ──────────────

[ User Zone ]
   |
   |  (No access to tools or agents)
   ▼
[ UI Zone ]
   |
   |  REST only (No raw secrets)
   ▼
[ Backend Zone ]   ← Authority Boundary
   |
   |  Deterministic job triggering
   ▼
[ Jenkins Zone ]
   |
   |  Restricted agent communication
   ▼
[ Kali Agent Zone ]  ← Isolated Execution
```

## 3. Network Topology

- **Public Subnet**: Load Balancer, Web UI.
- **Private Subnet**: Backend API, PostgreSQL Database.
- **Restricted Subnet**: Jenkins Controller.
- **Isolated Subnet**: Kali Linux Execution Agents (No Inbound allowed).

## 4. End-to-End Data Flow (Automated Scan)

1. **User**: Triggers scan via UI.
2. **UI**: POST `/api/v1/scans`.
3. **Backend**: Validates intent, generates `scan_id`, triggers Jenkins.
4. **Jenkins**: Orchestrates pipeline, selects eligible stages via discovery.
5. **Kali Agent**: Executes toolset, generates raw artifacts.
6. **Jenkins**: Normalizes results to standard JSON.
7. **Backend**: Receives callback, stores results, updates state.
8. **UI**: Polls `/api/v1/scans/{id}/results` and renders progress.

## 5. Responsibility Matrix

| Component | Primary Responsibility |
|-----------|------------------------|
| UI | Capturing user intent and visualizing normalized results. |
| Backend | Validating metadata, tracking state, and auditing actions. |
| Jenkins | Managing stage order, timeouts, and result normalization. |
| Kali Agent | Black-box execution of security tools. |
| Artifact Store | Long-term storage of security reports and logs. |
