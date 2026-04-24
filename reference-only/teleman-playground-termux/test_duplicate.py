
import requests
import json
import time

API_BASE = "http://localhost:3000/api"

def test_duplicate_logic():
    print("Testing Duplicate Logic...")

    # 1. Create a preset (dependency)
    preset_res = requests.post(f"{API_BASE}/presets", json={"name": "TestPreset", "rules": {}})
    if preset_res.status_code != 200:
        print("Failed to create preset", preset_res.text)
        return
    preset_id = preset_res.json()["id"]

    # 2. Create Folder A
    folder_a = {
        "name": "Folder A",
        "sourcePath": "/tmp/test_a",
        "targetChatId": "123456",
        "presetId": preset_id
    }
    res_a = requests.post(f"{API_BASE}/folders", json=folder_a)
    if res_a.status_code != 200:
         print("Failed to create folder A", res_a.text)
         return
    id_a = res_a.json()["id"]
    print(f"Created Folder A: {id_a}")

    # 3. Create Folder B
    folder_b = {
        "name": "Folder B",
        "sourcePath": "/tmp/test_b",
        "targetChatId": "123456",
        "presetId": preset_id
    }
    res_b = requests.post(f"{API_BASE}/folders", json=folder_b)
    id_b = res_b.json()["id"]
    print(f"Created Folder B: {id_b}")

    # 4. Try to update A with same values (Self-Update) - SHOULD SUCCEED
    print("Attempting Self-Update on A...")
    try:
        # Note: server.ts endpoint for PUT is /api/folders/:id and calls autoSyncer.updateFolder(id, body...)
        # We need to match the expected body in server.ts
        update_body = folder_a # Same values
        # server.ts expects: name, sourcePath, targetChatId, presetId, targetTopicId

        res_update_self = requests.put(f"{API_BASE}/folders/{id_a}", json=update_body)
        if res_update_self.status_code == 200:
            print("✅ Self-update passed!")
        else:
            print(f"❌ Self-update failed: {res_update_self.status_code} {res_update_self.text}")
    except Exception as e:
        print(f"❌ Self-update exception: {e}")

    # 5. Try to update A to match B (Duplicate) - SHOULD FAIL
    print("Attempting Duplicate Update (A -> B)...")
    try:
        duplicate_body = folder_b
        res_update_dup = requests.put(f"{API_BASE}/folders/{id_a}", json=duplicate_body)
        if res_update_dup.status_code == 409 and "Duplicate" in res_update_dup.text:
             print("✅ Duplicate detection passed (correctly rejected)!")
        else:
             print(f"❌ Duplicate detection failed. Status: {res_update_dup.status_code}, Text: {res_update_dup.text}")

    except Exception as e:
        print(f"Exception: {e}")

    # Cleanup
    requests.delete(f"{API_BASE}/folders/{id_a}")
    requests.delete(f"{API_BASE}/folders/{id_b}")

if __name__ == "__main__":
    test_duplicate_logic()
