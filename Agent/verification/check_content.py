from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:3000/projects/create")
        page.wait_for_load_state("networkidle")
        print(page.content())
        page.screenshot(path="verification/create_debug.png")
        browser.close()

if __name__ == "__main__":
    run()
