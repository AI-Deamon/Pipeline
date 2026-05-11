from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))
        page.on("pageerror", lambda err: print(f"BROWSER ERROR: {err.message}"))

        page.goto("http://localhost:3000/dashboard")
        page.wait_for_timeout(5000)
        page.screenshot(path="verification/dashboard_debug.png")
        browser.close()

if __name__ == "__main__":
    run()
