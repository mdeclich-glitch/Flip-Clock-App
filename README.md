<div align="center">

# ⏰ Flip Clock App

**A retro flip clock that keeps you focused.**
Fullscreen lock, Pomodoro, 20-20-20 eye breaks, music controls and a Windows screensaver, all in one app.

![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white)
![Built with](https://img.shields.io/badge/built%20with-Electron-47848F?logo=electron&logoColor=white)
![Spotify](https://img.shields.io/badge/Spotify-supported-1DB954?logo=spotify&logoColor=white)

<img width="2360" height="1588" alt="Flip Clock Main Interface" src="https://github.com/user-attachments/assets/e86026ee-de65-4489-a3da-e3708f9a8b5f" />

</div>

---

## ✨ Features

| | |
|---|---|
| 🕰️ **Retro flip clock** | Smooth flip animation, 12/24-hour format and a choice of case themes (dark, wood, aluminium, white, navy, red, orange, green). |
| 🔒 **Strict fullscreen focus** | Fullscreen locks your workspace until you type out a randomly generated challenge text. |
| ⏳ **Exit delay lockout** | Closing the app, even with `Alt + F4`, triggers a mandatory **15-second countdown**. |
| 🍅 **Productivity suite** | Pomodoro timer, standard timers and alarms, plus the **20-20-20 rule** to rest your eyes. |
| 🪟 **Mini clock** | A small always-on-top, click-through window that shows the clock or any running timer. |
| 🎵 **Music integrations** | Spotify and Pear Desktop (YouTube Music) controls right on the clock. |
| 🎓 **University browser** | A built-in browser window for university websites, available in front of the fullscreen lock. Currently supports **UniMiB** (`unimib.it`). |
| 🖥️ **Windows screensaver** | Turn your idle screen into a flip clock, with pixel-shift protection against OLED burn-in. Only **blue** and **black** themes are available, to protect your screen from burn-in. |
| 🔄 **Auto-updates** | Interface and app updates are downloaded in the background. |

---

## 🚀 Quick Start

1. Download the latest installer from the [**Releases**](../../releases) page.
2. Run it and launch **Flip Clock**.
3. Press `F` or use the fullscreen button to start a focus session.

---

## 👁️ The 20-20-20 Rule

Long hours in front of a screen strain your eyes. The **20-20-20 timer** automates the well-known rule: *every 20 minutes, look at something 20 feet (about 6 meters) away for 20 seconds.*

1. Click the **eye** button in the toolbar to switch the timer to 20-20-20 mode.
2. **Work (20 min):** the countdown runs while you work.
3. **Look away (20 sec):** a *"Look away"* screen brings the clock to the front with a 20-second countdown and a soft beep. Focus on something far away: when it ends, the next work block starts on its own. You can also skip it.
4. **Break (5 min):** after 3 work blocks (one hour of screen time) an alert asks you to start a 5-minute break, so you can stand up and move. When the break ends, confirm to start working again.

It also works in fullscreen mode.

---

## 🎵 Music Integrations Setup

<details>
<summary><b>🟢 Spotify</b></summary>

To connect your Spotify account:
1. Open the app settings menu.
2. Enter the developer **Client ID**. It is provided personally by the author: contact me to get yours.
3. Authenticate to grant playback control.

</details>

<details>
<summary><b>🍐 Pear Desktop (YouTube Music)</b></summary>

To control playback from Pear Desktop:
1. Open your Pear Desktop app settings.
2. Enable the **API Server** toggle.
3. The Flip Clock App will automatically detect and control playback via the local API interface.

</details>

---

## 🎓 University Browser

Flip Clock includes a dedicated browser window for university websites (e-learning, course pages…), so you can study without leaving the focus environment: it stays in front of the fullscreen lock, and closing it brings you back to the clock.

- **Supported today:** **UniMiB** (`unimib.it` and its subdomains). The window can only navigate within these domains.
- **Other universities:** additional domains can be added on request in future versions. Open an [issue](../../issues) to ask.
- Your login stays saved between sessions.
- It works together with the mini clock, which stays on top of the page.

---

## 🖥️ Installing the Windows Screensaver

The app installer generates a screensaver file (`.scr`) directly in the application installation directory.

<p align="center">
  <img width="430" alt="Screensaver Settings" src="https://github.com/user-attachments/assets/56424a73-3ce8-4cc3-8571-e830e8f4b080" />
</p>

1. Press `Win + R`, type `%LOCALAPPDATA%\Programs`, and press `Enter`.
2. Open the **`flip-clock-app`** folder.
3. Locate the `.scr` file inside the directory.
4. Right-click the `.scr` file and select **Install**.
5. Choose **Flip Clock** from the Windows Screensaver dropdown menu and click **Apply**.

> 🔵 **Themes:** the screensaver supports only **blue** and **black** themes. This is intentional: it protects OLED and other screens from burn-in.
>
> 💡 You can customize time formats and options directly from the application settings screen.

---

## 🛡️ Anti-Distraction Mechanisms

- **Challenge Unlock:** Entering fullscreen mode locks down the workspace. You must correctly type out the randomly generated challenge text to exit.
- **15-Second Exit Timer:** Shutting down the application triggers a 15-second countdown banner before closing, discouraging compulsive app closing during work sessions.

---

## 💻 Tech Stack

- **Framework/Platform:** Electron / Desktop Web Technologies
- **Integrations:** Spotify Web API, Pear Desktop Local API Server
- **Platform Support:** Windows

---

<div align="center">

If you like the project, leave a ⭐ on the repository!

</div>
