"""
AI-Powered Finding Validation
Refactored from backend/nmap_system/ai_agent.py (365 lines)
"""
import json
import asyncio
from typing import Optional, List
import httpx

from app.services.reporting.parsers.base import SecurityFinding


class AIValidator:
    """Validate findings using local Ollama model"""

    def __init__(self, ollama_url: str = "http://localhost:11434"):
        self.ollama_url = ollama_url
        self.model = "mistral"  # Default model

    async def validate_finding(self, finding: SecurityFinding) -> bool:
        """
        Use Ollama to validate if finding is real.
        Returns True if confirmed, False if false positive.
        """
        prompt = f"""
Analyze this security finding and determine if it's a real vulnerability or false positive.

Title: {finding.title}
Severity: {finding.severity}
Description: {finding.description}
Host: {finding.host or 'N/A'}
Port: {finding.port or 'N/A'}

Respond with only 'true' or 'false'.
"""

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False
                    }
                )

                if response.status_code == 200:
                    result = response.json().get("response", "").strip().lower()
                    return result == "true"
        except Exception:
            pass

        return True  # Default to confirmed if AI fails

    async def generate_recommendation(self, finding: SecurityFinding) -> str:
        """Generate AI-powered fix recommendation"""
        prompt = f"""
Provide a concise fix recommendation for this security finding:

Title: {finding.title}
Severity: {finding.severity}
Description: {finding.description}

Keep it under 100 words.
"""

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False
                    }
                )

                if response.status_code == 200:
                    return response.json().get("response", "").strip()
        except Exception:
            pass

        return finding.recommendation or "See security documentation"
