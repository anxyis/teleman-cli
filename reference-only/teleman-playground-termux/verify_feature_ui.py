from playwright.sync_api import sync_playwright
import time
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to home
        try:
            page.goto("http://localhost:3000/autosyncer")

            # Wait for content to load
            page.wait_for_selector("text=Auto-Syncer", timeout=10000)

            # Check if Presets button exists (horizontal toolbar)
            presets_btn = page.get_by_role("button", name="Presets")
            if presets_btn.is_visible():
                print("Presets button is visible.")
            else:
                print("Presets button not visible.")

            # Check if VitalSignsHeader is visible (CPU/RAM)
            # It might take a moment for stats to load
            time.sleep(2)
            if page.locator("text=CPU").first.is_visible():
                print("CPU stats visible.")

            # Take screenshot
            os.makedirs("/home/jules/verification", exist_ok=True)
            page.screenshot(path="/home/jules/verification/verification.png")
            print("Screenshot saved to /home/jules/verification/verification.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
