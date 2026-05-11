from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:3000/projects/create")

        # Verify labels
        expect(page.get_by_label("Project Name")).to_be_visible()
        expect(page.get_by_label("Git Repository URL")).to_be_visible()
        expect(page.get_by_label("Git Credentials (ID)")).to_be_visible()

        page.screenshot(path="verification/create_project_labels.png")
        print("Labels verified!")
        browser.close()

if __name__ == "__main__":
    run()
