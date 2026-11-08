# ⏰ Flip Clock App

A feature-rich desktop application combining an aesthetic retro flip clock display with strict productivity tools, music player integrations, and a custom Windows screensaver.

---

## ✨ Features

- **Retro Flip Clock:** Smooth animated display with customizable time formats.
- **Strict Fullscreen Focus:** Fullscreen mode locks your environment until you complete a textual challenge.
- **Exit Delay Lockout:** Prevents quick exits or distractions — closing the app enforces a mandatory **15-second delay** (even via `Alt + F4`).
- **Productivity Suite:**
  - **Pomodoro Timer:** Work/break intervals tailored for deep focus.
  - **Standard Timers & Alarms:** Flexible countdowns and scheduled alerts.
- **Music Integrations:**
  - **Spotify:** Streamlined playback controls.
  - **Pear Desktop:** Seamless support for the YouTube Music desktop client.
- **Windows Screensaver (.scr):** Convert your desktop display into an idle flip clock.

---

## 🎵 Music Integrations Setup

### 🟢 Spotify Integration
To connect your Spotify account:
1. Open the app settings menu.
2. Enter the developer **Client ID** provided for this application.
3. Authenticate to grant playback control.

### 🍐 Pear Desktop (YouTube Music)
To control playback from Pear Desktop:
1. Open your Pear Desktop app settings.
2. Enable the **API Server** toggle.
3. The Flip Clock App will automatically detect and control playback via the local API interface.

---

## 🖥️ Installing the Windows Screensaver

The app installer generates a screensaver file (`.scr`) directly in the application installation directory.

1. Press `Win + R`, type `%LOCALAPPDATA%\Programs`, and press `Enter`.
2. Open the **`flip-clock-app`** folder.
3. Locate the `.scr` file inside the directory.
4. Right-click the `.scr` file and select **Install**.
5. Choose **Flip Clock** from the Windows Screensaver dropdown menu and click **Apply**.

> **Note:** You can customize time formats and options directly from the application settings screen.

---

## ⚙️ Anti-Distraction Mechanisms

- **Challenge Unlock:** Entering fullscreen mode locks down the workspace. You must correctly type out the randomly generated challenge text to exit.
- **15-Second Exit Timer:** Shutting down the application triggers a 15-second countdown banner before closing, discouraging compulsive app closing during work sessions.

---

## 💻 Tech Stack

- **Framework/Platform:** Electron / Desktop Web Technologies
- **Integrations:** Spotify Web API, Pear Desktop Local API Server
- **Platform Support:** Windows

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.