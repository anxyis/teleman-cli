# Troubleshooting Guide

This guide contains solutions for common errors and issues encountered when using Teleman CLI.

---

## 1. Target Validation Failures {#target-validation-failures}

### ❌ Error: `target validation failed: chat validation failed: Bad Request: chat not found`

This error occurs when the Telegram Bot API is unable to find or access the chat ID configured for a specific target alias (e.g., your `UsefulApps` target).

#### Potential Causes & Solutions

##### 1. The Bot has not been added to the Chat/Group/Channel
* **Why it happens:** Telegram's API forbids bots from querying, reading, or writing to any chat they are not actively a member of.
* **How to fix:**
  1. Open your Telegram client.
  2. Open the group, channel, or forum topic you mapped to your target alias.
  3. Go to the chat details and **Add Members**.
  4. Search for your Bot (associated with the token you provided during `teleman config`) and add it to the chat.
  5. If the target is a channel, you must add the Bot as an **Administrator** with at least the **Post Messages** permission.
  6. If the target is a group/supergroup, ensure the bot has permission to **Send Messages**.

##### 2. The User target hasn't started the Bot
* **Why it happens:** If the target is of type `user`, Telegram prevents bots from sending unsolicited messages to protect users from spam.
* **How to fix:**
  * The target user must search for your bot on Telegram and send a `/start` message to authorize communication.

##### 3. Incorrect Chat ID Format
* **Why it happens:** Supergroups, channels, and forum groups always have negative chat IDs, usually starting with `-100` (e.g., `-1002479836957`). If the `-100` prefix is missing or if the ID is mistyped, Telegram will return `chat not found`.
* **How to fix:**
  * Run `teleman config` and select `e)dit targets` to modify the chat ID.
  * *Tip: You can retrieve the exact Chat ID by forwarding a message from the target chat to a helper bot like `@ShowJsonBot` or `@RawDataBot`.*

##### 4. Self-Hosted / Local Bot API Server Issues
* **Why it happens:** You are using a local API server (e.g., `http://192.168.0.7:8181`). If the local API server has not synchronized with Telegram's backend or if the bot token is wrong, it may fail to resolve the chat ID.
* **How to fix:**
  * Verify that the local API server has external network access.
  * Ensure the bot token is correct and belongs to the bot you've invited to the chat.
