from playwright.sync_api import sync_playwright
import time

def verify(page):
    page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
    page.on("pageerror", lambda err: print(f"Browser error: {err}"))

    print("Navigating to AutoSyncer...")
    page.goto("http://localhost:5173/autosyncer")

    # Force Modern Theme
    print("Setting Modern Theme...")
    page.evaluate("localStorage.setItem('theme', 'modern')")
    page.reload()

    # Set Mobile Viewport
    page.set_viewport_size({"width": 390, "height": 844})

    # Wait for either Vital Signs (CPU) or Title
    print("Waiting for UI to load...")
    try:
        # Wait for something that definitely exists
        page.wait_for_selector("input[placeholder='Search folders...']", timeout=5000)
        print("Search bar found.")
    except:
        print("Search bar NOT found.")
        page.screenshot(path="verification_debug.png")

    # Wait for stats
    try:
        page.wait_for_selector("text=CPU", timeout=5000)
        print("Vital Signs (CPU) found.")
    except:
        print("Vital Signs NOT found (Stats might be null or API failing).")
        # Check if we can see the buttons at least

    # Take screenshot
    print("Taking screenshot...")
    page.screenshot(path="verification_mobile.png")
    print("Screenshot saved to verification_mobile.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            verify(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
