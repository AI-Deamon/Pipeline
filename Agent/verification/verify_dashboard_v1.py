from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:3000/dashboard")

        # Verify dashboard heading
        expect(page.get_by_role("heading", name="Project Dashboard")).to_be_visible()

        page.screenshot(path="verification/dashboard_v1.png")
        print("Dashboard verified!")
        browser.close()

if __name__ == "__main__":
    run()
