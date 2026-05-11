from playwright.sync_api import sync_playwright, expect
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:5173/dashboard")

        # Wait for any data to load
        time.sleep(2)

        # Find search input and type
        search_input = page.get_by_placeholder("Search projects...")
        expect(search_input).to_be_visible()

        search_input.fill("Alpha")
        time.sleep(1)

        page.screenshot(path="verification/search_active.png")
        print("Search screenshot captured!")

        # Clear search
        clear_button = page.get_by_label("Clear search")
        expect(clear_button).to_be_visible()
        clear_button.click()

        time.sleep(1)
        page.screenshot(path="verification/search_cleared.png")
        print("Clear search screenshot captured!")

        browser.close()

if __name__ == "__main__":
    run()
