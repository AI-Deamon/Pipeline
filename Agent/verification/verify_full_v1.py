import os
from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # 1. Start at Dashboard
        page.goto("http://localhost:3000/dashboard")
        expect(page.get_by_text("Project Dashboard")).to_be_visible()
        page.screenshot(path="verification/full_1_dashboard.png")

        # 2. Create Project
        page.get_by_text("New Project").click()
        page.get_by_label("Project Name").fill("Full Integration Project")
        page.get_by_label("Git Repository URL").fill("https://github.com/full/test.git")
        page.get_by_label("Git Credentials (ID)").fill("full-creds")
        page.get_by_label("Sonar Project Key").fill("full-sonar")
        page.get_by_label("Target IP (for Nmap)").fill("10.0.0.1")
        page.get_by_label("Target URL (for ZAP)").fill("https://full.test")
        page.screenshot(path="verification/full_2_create.png")
        page.get_by_role("button", name="Create Project").click()

        # 3. Control Page
        expect(page.get_by_text("Full Integration Project").first).to_be_visible()
        page.get_by_text("Manage").first.click()
        expect(page.get_by_text("Full Integration Project").first).to_be_visible()
        page.screenshot(path="verification/full_3_control.png")

        # 4. Manual Scan selection
        page.get_by_text("Configure").click()
        expect(page.get_by_text("Manual Scan Selection")).to_be_visible()
        page.get_by_text("Git Checkout").click()
        page.get_by_text("Nmap Scan").click()
        page.screenshot(path="verification/full_4_manual.png")

        # 5. Trigger Manual Scan
        page.get_by_role("button", name="Start Manual Scan").click()
        # Wait for redirect and status
        page.wait_for_timeout(3000)
        page.screenshot(path="verification/full_5_status.png")

        browser.close()

if __name__ == "__main__":
    run()
