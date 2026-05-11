from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Create project
        page.goto("http://localhost:3000/projects/create")
        page.get_by_label("Project Name").fill("Control Test")
        page.get_by_label("Git Repository URL").fill("http://git.com")
        page.get_by_label("Git Credentials (ID)").fill("creds")
        page.get_by_label("Sonar Project Key").fill("sonar")
        page.get_by_role("button", name="Create Project").click()

        # 2. Go to control page
        expect(page.get_by_text("Control Test")).to_be_visible()
        page.get_by_role("link", name="Manage").click()

        # 3. Verify control page content
        expect(page.get_by_role("heading", name="Control Test")).to_be_visible()
        expect(page.get_by_role("button", name="Run Now")).to_be_visible()

        page.screenshot(path="verification/control_v1.png")
        print("Project Control Page verified!")
        browser.close()

if __name__ == "__main__":
    run()
