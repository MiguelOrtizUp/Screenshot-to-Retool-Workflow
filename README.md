# Screenshot to Retool Workflow

Capture full-page screenshots from the active tab and send them directly into a Retool Workflow you control.

## How Categories Work
Categories let you save multiple Retool Workflow destinations so you can route captures to different workflows without retyping URLs or keys each time.

- **Name**: A friendly label for the workflow destination (e.g., "Bug Triage", "QA Review", "Client Feedback").
- **Endpoint**: The base URL of the Retool Workflow you want to call.
- **API Key**: The workflow API key Retool provides for that workflow.

When you click **Capture + Send**, the extension sends the screenshot to the currently selected category. You can add, edit, delete, and switch categories in the **Manage** section. Recent sends are shown in the history list.

<img width="640" height="400" alt="Screenshot 2026-01-14 162515 (3)" src="https://github.com/user-attachments/assets/208cadd0-4652-4ead-ae28-1cb47ff24959" />

## How to Find or Generate the Retool Workflow API Key
Retool Workflows can be called via HTTP using a workflow-specific API key.

1) Open Retool and navigate to **Workflows**.
2) Open the workflow you want to receive screenshots.
3) Click **Deploy** (top right) if it is not already deployed.
4) Go to the workflow’s **Trigger** settings (HTTP trigger).
5) Copy the **Workflow URL** and the **API key** shown there.

<img width="1280" height="800" alt="Screenshot 2026-01-14 161819 (2)" src="https://github.com/user-attachments/assets/be225ef7-52de-4f77-9bd4-0ab4af737cd7" />

In the extension:
- Paste the **Workflow URL** into the **Endpoint** field.
- Paste the **API key** into the **API key** field.

Note: The extension stores these values locally in your browser using Chrome’s storage API.

## Hotkey Functionality
The default hotkey is **Ctrl+Shift+S**.

- The hotkey triggers a capture using the **Hotkey category** selected in the popup.
- You can change the hotkey from Chrome’s Extensions shortcut settings:
  - Go to `chrome://extensions/shortcuts`
  - Find **Screenshot to Retool Workflow**
  - Set your preferred shortcut

The hotkey only captures the **active tab** at the time you press it.

## Data Sent to Retool
Each capture sends:
- Full-page screenshot (PNG)
- Active tab URL and title
- Timestamp
- Optional context text entered in the popup

## Example on how to use the data in a workflow: 

Once the extension sends a capture, the data is available in your workflow's startTrigger. If you are using an Email or SMTP block to send the screenshot, follow these steps:

1. Identify the Incoming Data
The extension sends a JSON payload structured like this:

screenshotBase64: The raw base64 image string.
url: The URL of the page captured.
title: The title of the page.
context: Any text you typed into the extension popup.

2. Configure the Attachment
In a Retool Email block, click into the Attachment field (use the fx mode) and paste the following code. This snippet converts the raw string into a properly formatted file attachment, using the page title as the filename:

{{
  [{
    "base64Data": startTrigger.data.screenshotBase64,
    "name": (startTrigger.data.title || 'screenshot').replace(/[^a-z0-9]/gi, '_') + ".png",
    "type": "image/png",
    "sizeBytes": Math.floor((startTrigger.data.screenshotBase64.length * 3) / 4) - 
                 (startTrigger.data.screenshotBase64.endsWith('==') ? 2 : 
                  startTrigger.data.screenshotBase64.endsWith('=') ? 1 : 0)
  }]
}}

3. Formatting the Email Body
You can also use the metadata to provide context in the email body:

New Screenshot Captured

Source: {{ startTrigger.data.url }} Notes: {{ startTrigger.data.context || 'No notes provided.' }}

## Store Listing Description (Suggested)
Screenshot to Retool Workflow captures full-page screenshots from your active tab and sends them directly into your Retool Workflows. Configure one or more Categories (each with its own workflow endpoint and API key), select the destination, and send with a single click. Use the hotkey for fast capture to a preset workflow. This extension requests access to all sites so it can capture whichever page you are viewing at the time of capture.
