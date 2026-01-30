# Screenshot & File to Retool Workflow

Capture screenshots or upload files from your browser and send them directly into a Retool Workflow you control. Perfect for bug reports, feedback collection, document processing, and more.

## Features

- **Screenshot Capture**: Capture visible area or full-page screenshots
- **File Upload**: Upload any file (images, documents, archives) up to 10MB
- **Text-Only Messages**: Send messages without attachments
- **Multiple Categories**: Save multiple workflow destinations
- **Hotkey Support**: Quick capture with Ctrl+Shift+S
- **Context/Messages**: Add context or messages with each submission
- **History Tracking**: View recent sends

## How Categories Work
Categories let you save multiple Retool Workflow destinations so you can route captures, files, or messages to different workflows without retyping URLs or keys each time.

- **Name**: A friendly label for the workflow destination (e.g., "Bug Triage", "QA Review", "Client Feedback").
- **Endpoint**: The base URL of the Retool Workflow you want to call.
- **API Key**: The workflow API key Retool provides for that workflow.
- **Text Only**: Check this if the category should only send messages without attachments.

### Category Types

**Standard Categories** (Text Only unchecked):
- Support screenshot capture (visible area or full-page)
- Support file uploads
- Show screenshot mode toggle and action buttons

**Text-Only Categories** (Text Only checked):
- Only show a "Send Message" button
- Send messages without any file or screenshot attachment
- Useful for status updates, notes, or text-based workflows

<img width="640" height="400" alt="Screenshot 2026-01-14 162515 (3)" src="https://github.com/user-attachments/assets/208cadd0-4652-4ead-ae28-1cb47ff24959" />

## How to Use

### Taking Screenshots
1. Select a standard category (not text-only)
2. Choose screenshot mode:
   - **Visible area**: Captures only what's currently visible on screen (default, faster)
   - **Full page**: Captures the entire page by scrolling and stitching
3. Optionally add context in the text area
4. Click **Capture** to take and send the screenshot

### Uploading Files
1. Select a standard category (not text-only)
2. Click **Upload File** and select a file from your device
3. Supported file types: images (jpg, png, gif, webp, svg), documents (pdf, txt, csv, docx, xlsx), archives (zip)
4. Maximum file size: 10MB
5. After selection, the filename appears and you can add context
6. Click **Send File** to upload

### Sending Text-Only Messages
1. Select a text-only category
2. Enter your message in the context area
3. Click **Send Message** to send without any attachment

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

- The hotkey triggers a screenshot capture using the **Hotkey category** selected in the popup
- Uses the current screenshot mode setting (visible area or full-page)
- You can change the hotkey from Chrome’s Extensions shortcut settings:
  - Go to `chrome://extensions/shortcuts`
  - Find **Screenshot to Retool Workflow**
  - Set your preferred shortcut

The hotkey only captures the **active tab** at the time you press it.

## Data Sent to Retool

### For Screenshots:
```json
{
  "categoryId": "uuid",
  "context": "user-entered text",
  "url": "tab URL",
  "title": "tab title",
  "capturedAt": "ISO timestamp",
  "file": {
    "base64Data": "base64-encoded JPEG",
    "name": "screenshot.jpg",
    "type": "image/jpeg",
    "sizeBytes": 123456
  }
}
```

### For File Uploads:
```json
{
  "categoryId": "uuid",
  "context": "user-entered text",
  "title": "tab title",
  "capturedAt": "ISO timestamp",
  "file": {
    "base64Data": "base64-encoded file data",
    "name": "filename.ext",
    "type": "file MIME type",
    "sizeBytes": 123456
  }
}
```

### For Text-Only Messages:
```json
{
  "categoryId": "uuid",
  "url": "tab URL",
  "title": "tab title",
  "capturedAt": "ISO timestamp",
  "message": "user message"
}
```

**Note**: Screenshots are automatically compressed to JPEG format at 85% quality for ~70% file size reduction compared to PNG.

## Example: Using the Data in a Retool Workflow

Once the extension sends data, it's available in your workflow's `startTrigger`. Here's how to work with different submission types:

### 1. Screenshots and File Uploads

For screenshots or file uploads, the data arrives with a nested `file` object:

```javascript
{
  "categoryId": "uuid",
  "context": "user text",
  "url": "page URL",
  "title": "page title",
  "capturedAt": "ISO timestamp",
  "file": {
    "base64Data": "base64-encoded data",
    "name": "filename.ext",
    "type": "mime type",
    "sizeBytes": 123456
  }
}
```

**To use in a Retool Email block attachment:**

In the Attachment field (fx mode), the file is already in the correct format:

```javascript
{{ [startTrigger.data.file] }}
```

**Email body example:**

```
New Submission Received

File: {{ startTrigger.data.file.name }}
Size: {{ (startTrigger.data.file.sizeBytes / 1024).toFixed(2) }} KB
Source: {{ startTrigger.data.url || 'Direct upload' }}
Context: {{ startTrigger.data.context || 'No context provided' }}
Captured: {{ startTrigger.data.capturedAt }}
```

### 2. Text-Only Messages

For text-only submissions:

```javascript
{
  "categoryId": "uuid",
  "url": "page URL",
  "title": "page title",
  "capturedAt": "ISO timestamp",
  "message": "user message"
}
```

**Email body example:**

```
New Message Received

From: {{ startTrigger.data.title }}
URL: {{ startTrigger.data.url }}
Message: {{ startTrigger.data.message }}
Sent: {{ startTrigger.data.capturedAt }}
```

## Store Listing Description (Suggested)
Screenshot & File to Retool Workflow captures screenshots or uploads files from your browser and sends them directly into your Retool Workflows. Configure one or more Categories (each with its own workflow endpoint and API key), select the destination, and send with a single click. Supports visible-area or full-page screenshots, file uploads up to 10MB, and text-only messages. Use the hotkey for fast screenshot capture to a preset workflow. This extension requests access to all sites so it can capture whichever page you are viewing at the time of capture.
