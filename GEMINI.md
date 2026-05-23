# GEMINI.md - Master Context Guide (Pipeline / Antigravity Kit)

This document serves as the primary instructional context for Gemini when working in this repository. It synthesizes the information from `AGENTS.md`, `QWEN.md`, and the core codebase documentation.

---

## 🏗️ Project Overview

**Pipeline / Antigravity Kit** is a high-performance **DevSecOps Control Plane** and **AI Agent Capability Expansion Toolkit**. It is designed to automate software development, security auditing, and CI/CD pipeline management.

### System Components:
1.  **Frontend**: React 19 + TypeScript + Vite dashboard (`Agent/src/`).
2.  **Backend**: FastAPI + Python 3.8+ control plane (`Agent/backend/`).
3.  **Agents (Antigravity Kit)**: A modular layer of 20 specialist agents and 36 skills (`Agent/.agent/`).
4.  **CI/CD**: Jenkins-based security scanning pipelines (Root `Jenkinsfile`).

---

## 🛠️ Tech Stack & Commands

| Component | Technology | Key Commands (from `Agent/` directory) |
| :--- | :--- | :--- |
| **Frontend** | React 19, TS, Vite, Tailwind v4 | `pnpm dev`, `pnpm build`, `pnpm test` |
| **Backend** | FastAPI, PostgreSQL, Celery, Redis | `python run.py dev`, `pytest` |
| **Agent Kit** | Custom Python logic | `python .agent/scripts/checklist.py .` |
| **Infrastructure** | Docker, Jenkins | `python run.py staging`, `python run.py down` |

---

## 📁 Key Directories & Documentation

- `Agent/.agent/`: Core agent logic, rules, and skills. **Refer to `Agent/.agent/ARCHITECTURE.md` for details.**
- `Agent/docs/`: Technical deep-dives, policies, and architecture diagrams.
- `AGENTS.md`: **Crucial** detailed coding standards for TypeScript and Python. **Refer to this for import/naming conventions.**
- `QWEN.md`: Alternative context guide with additional Jenkins and environment profile details.
- `Agent/STARTUP_GUIDE.md`: Step-by-step instructions for environment setup.

---

## 📜 Core Development Workflow

1.  **Environment Setup**: Launch the full environment using `./start-dev.sh` (Linux) or `start-dev.bat` (Windows).
2.  **Specialist Delegation**: Identify the correct agent for your task in `Agent/.agent/agents/` (e.g., `security-auditor` for scans).
3.  **Socratic Discovery**: Use the `/brainstorm` workflow (or `brainstorming` skill) before starting complex tasks.
4.  **Strict Verification**: Run `python .agent/scripts/checklist.py .` after every significant change. **A task is NOT complete until all core checks pass.**
5.  **Environment-Specific Actions**: Use `run.py` to target `dev`, `test`, or `staging` environments accurately.

---

## 🎯 Important Rules (Hierarchy)

1.  **Security First**: Never expose or commit secrets. Adhere to `Agent/docs/SECRETS_POLICY.md`.
2.  **Clean Code**: Follow `@[skills/clean-code]` and `AGENTS.md` standards.
3.  **Type Safety**: TypeScript `any` is strictly prohibited. Python type hints are mandatory.
4.  **No Direct Commits**: Do not stage or commit changes unless explicitly directed.

---

## 📝 Roadmap & Active Tasks
- [ ] UI/UX overhaul as per `Agent/conductor/ui-ux-improvement-plan.md`.
- [ ] Enhanced Jenkins pipeline integration for production-grade security scanning.
- [ ] Expansion of the "Antigravity Kit" skill library.
