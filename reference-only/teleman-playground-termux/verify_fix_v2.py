from playwright.sync_api import sync_playwright
import time
import json

def verify(page):
    # Mock Stats so VitalSignsHeader renders
    def handle_stats(route):
        print("Mocking /api/stats")
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"cpu": 25, "ram": 40, "disk": {"free": 100, "total": 200, "usagePercent": 50}})
        )

    page.route("**/api/stats", handle_stats)
    page.route("**/api/folders", lambda r: r.fulfill(json=[]))
    page.route("**/api/groups", lambda r: r.fulfill(json=[]))
    page.route("**/api/presets", lambda r: r.fulfill(json=[]))
    page.route("**/api/job/current", lambda r: r.fulfill(json={"status": "idle"}))
    page.route("**/api/registry/stats", lambda r: r.fulfill(json={}))

    print("Navigating to AutoSyncer...")
    page.goto("http://localhost:5173/autosyncer")

    # Force Modern Theme
    print("Setting Modern Theme...")
    page.evaluate("localStorage.setItem('app-theme', 'modern')")
    page.reload()

    # Set Mobile Viewport
    page.set_viewport_size({"width": 390, "height": 844})

    # Wait for Vital Signs (CPU)
    print("Waiting for Vital Signs...")
    try:
        page.wait_for_selector("text=CPU", timeout=5000)
        print("Vital Signs (CPU) found.")
    except:
        print("Vital Signs NOT found (Mock might have failed).")

    # Wait for layout
    time.sleep(1)

    # Take screenshot
    print("Taking screenshot...")
    page.screenshot(path="verification_mobile_v2.png")
    print("Screenshot saved to verification_mobile_v2.png")

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
