# Install Tidemark on your phone

This guide assumes you've never used Android Studio. Follow the steps in order; each one says what
you should see when it worked. Plan for about 45 minutes the first time, most of it waiting for
downloads. Updates later take about 5 minutes.

You need:

- A computer (Windows, macOS or Linux) with Android Studio installed, about 15 GB of free disk
  space, and an internet connection.
- An Android phone running Android 10 or newer, and a USB cable that carries data (some cheap
  cables only charge).

---

## 1. Update Android Studio

Tidemark uses current Android tools, so an older Android Studio will refuse to open it.

1. Open Android Studio.
2. On the welcome screen, click the gear icon at the bottom left (or the **⋮** menu), then **Check
   for Updates**. On macOS it's under **Android Studio ▸ Check for Updates**. On Windows/Linux, if a
   project is open: **Help ▸ Check for Updates**.
3. Install any update it offers and restart Android Studio.

If it says you're up to date but step 3 later fails with *"This project uses a newer Android Gradle
Plugin"*, download the latest version from <https://developer.android.com/studio> and install it
over the old one.

**First launch only:** if Android Studio shows a setup wizard, choose **Standard**, accept the
licences (click each item on the left, then **Accept**), and let it download the Android SDK.

## 2. Download the code

The easiest way doesn't need git:

1. Open this link in your browser. It downloads a ZIP of the branch with Tidemark in it:
   <https://github.com/yak1s/Othello/archive/refs/heads/claude/android-app-setup-guide-ngexeu.zip>
2. Unzip it somewhere simple, such as `Documents/Tidemark-code` (on Windows: right-click ▸
   **Extract All**).
3. Inside the unzipped folder there is a folder called **`tidemark`**. That's the Android project.

(If you prefer git: `git clone -b claude/android-app-setup-guide-ngexeu https://github.com/yak1s/Othello.git`.)

## 3. Open the project

1. In Android Studio: **File ▸ Open…** (on the welcome screen: **Open**).
2. Select the **`tidemark`** folder itself, not the folder above it, and click **Open**.
3. If it asks whether to trust the project, click **Trust Project**.
4. Wait. The bottom-right corner shows *"Gradle sync"* and a progress bar. The first sync
   downloads a lot and can take 5–15 minutes. Don't click anything in the meantime.

**It worked when** the progress bar is gone and the left panel (switch it to **Android** view at
the top of that panel) shows `app` and `core`.

**If a yellow or red bar appears:**

- *"Missing SDK platform"*, *"Install missing platform(s) and sync project"*, or *"Failed to find
  target with hash string 'android-37'"*: click the blue **Install** link it offers and accept.
  Or open **Tools ▸ SDK Manager**, tick the newest **Android** version (API 37) under **SDK
  Platforms**, click **Apply**, then **File ▸ Sync Project with Gradle Files**.
- *"Gradle JDK"* / *"Unsupported Java"*: open **Settings** (macOS: **Android Studio ▸ Settings**)
  ▸ **Build, Execution, Deployment ▸ Build Tools ▸ Gradle** and set **Gradle JDK** to **jbr-21**
  (the one bundled with Android Studio). Click **OK**, then sync again.
- *"AGP upgrade available"* or *"Project update recommended"*: ignore it. Don't upgrade.
- Anything that mentions the network: check your connection and click **Try Again**.

## 4. Get your phone ready (one time)

1. On the phone, open **Settings ▸ About phone** and tap **Build number** seven times. It says
   *"You are now a developer"*. (On some phones Build number is under **Software information**.)
2. Go back to **Settings ▸ System ▸ Developer options** (on Samsung: **Settings ▸ Developer
   options**) and turn on **USB debugging**.
3. Plug the phone into the computer. If the phone asks what the USB connection is for, choose
   **File transfer**.
4. The phone asks **"Allow USB debugging?"**: tick **Always allow from this computer** and tap
   **Allow**.

**It worked when** your phone's name appears in the device dropdown in Android Studio's top
toolbar (next to the green ▶ button).

On Windows, if the phone never appears, you may need your phone maker's USB driver (search
"<your phone brand> USB driver"), then unplug and replug.

## 5. Build and install

1. Choose the fast version of the app: open **View ▸ Tool Windows ▸ Build Variants**. In the
   panel that appears, change **app** from `debug` to **`release`**. (The release version runs
   much more smoothly. It's signed automatically so it installs straight away.)
2. In the top toolbar, make sure **app** is selected on the left and your phone on the right.
3. Click the green **▶ Run** button.
4. The first build takes 3–10 minutes. The **Build** panel at the bottom shows progress.

**It worked when** Tidemark opens on your phone by itself. It's now installed like any other app;
you can unplug the phone.

**If the build fails**, the **Build** panel shows red text. Common fixes:

- *"INSTALL_FAILED_UPDATE_INCOMPATIBLE"* or *"signatures do not match"*: an older Tidemark built
  on another computer is installed. Uninstall Tidemark from the phone and click ▶ again.
- *"Device unauthorized"*: unplug, replug, and accept the "Allow USB debugging?" prompt on the phone.
- Anything else: **Build ▸ Clean Project**, then ▶ again. If it still fails, copy the first red
  error line and ask me.

## 6. First run on the phone

1. Tidemark shows one welcome screen. Tap **Start**.
2. Add your first watch: in Chrome (or the Amazon app, or any shop's app) open a product, tap
   **Share**, and choose **Tidemark**. The price appears in about a second; tap **Track it**.
3. Tidemark asks for permission to send notifications. Tap **Allow**. It can't tell you about a
   drop without it.
4. After your second watch it explains battery settings once. Tap **Allow** so Android lets it
   check in the background.

### Make background checks reliable (important)

Android saves battery by stopping apps in the background. Tidemark checks politely and uses very
little battery, but it has to be allowed to run:

- **Settings ▸ Apps ▸ Tidemark ▸ Battery ▸ Unrestricted** (on some phones: **App battery usage ▸
  Unrestricted**, or **Battery optimisation ▸ Don't optimise**).
- **Samsung**: also **Settings ▸ Battery ▸ Background usage limits** and make sure Tidemark isn't
  in *Sleeping apps* or *Deep sleeping apps*.
- **Xiaomi, OnePlus, Oppo, Vivo, Huawei**: also turn on **Autostart** for Tidemark. See
  <https://dontkillmyapp.com> for your exact model.

## 7. Add the widgets

1. On your home screen, touch and hold an empty space, then tap **Widgets**.
2. Scroll to **Tidemark** (or search for it). There are four:
   - **Board**: 3 to 8 watches on one aligned column of numbers (4×2 up to 4×4).
   - **Single**: one watch with a big number and a small chart (2×2).
   - **Stock light**: one yes/no watch, readable across the room (2×1).
   - **Fare strip**: the cheapest date for a flight, with a 7-day bar chart (4×2).
3. Drag the one you want onto the home screen and let go.
4. Tidemark's widget setup opens, with a live preview at the exact size you placed. Pick the
   watches (for Board, drag the handles to reorder), then tap **Save**.
5. To resize, touch and hold the widget, then drag its edges. To change what it shows, touch and
   hold ▸ **Reconfigure** (or the pencil icon, depending on your launcher).

Widgets update right after each check while the screen is on. They never check anything by
themselves, so they don't cost battery. If a watch you pinned is checked rarely, the setup screen
says so and offers a one-tap fix.

**Quick settings tile** (optional): swipe down twice from the top of the screen, tap the pencil
(edit) icon, and drag **Tidemark alerts** into your tiles. It shows how many alerts you haven't
read.

## 8. Updating Tidemark later

When new code is available:

1. Download the ZIP again (step 2) and unzip it over the old folder, or `git pull` if you used git.
2. Open it in Android Studio (**File ▸ Open**, or **File ▸ Recent Projects**), wait for the sync.
3. Plug in the phone and click ▶ **Run**. Keep the same build variant as last time.

Your watches, history and widgets are kept. Build on the same computer each time: the phone only
accepts updates signed with the same key, and Android Studio keeps that key on your computer.

## Plan B: install without Android Studio

Every push to the branch builds the app on GitHub automatically.

1. Sign in to GitHub and open <https://github.com/yak1s/Othello/actions/workflows/tidemark-android.yml>.
2. Click the newest run with a green tick, scroll to **Artifacts**, and download
   **tidemark-debug-apk**.
3. Unzip it and copy the `.apk` file to your phone (USB, Google Drive, or email it to yourself).
4. On the phone, tap the file and allow **Install unknown apps** for the app you opened it from.

This is the debug version: it works, but scrolling is less smooth than the release build from
step 5, and it installs as a separate app called Tidemark alongside it.

## Optional: sign with your own key

The release build is signed with Android Studio's debug key so that it installs without any
setup. If you want your own permanent key (for example, to build on more than one computer):

1. **Build ▸ Generate Signed App Bundle or APK… ▸ APK ▸ Next ▸ Create new…**, save the keystore
   file inside the `tidemark` folder (for example `tidemark/my-release-key.jks`), and remember the
   passwords.
2. Create a file `tidemark/keystore.properties` containing:

   ```
   storeFile=my-release-key.jks
   storePassword=YOUR_STORE_PASSWORD
   keyAlias=YOUR_KEY_ALIAS
   keyPassword=YOUR_KEY_PASSWORD
   ```

3. Uninstall the old Tidemark from the phone once (the key changed), then ▶ **Run** with the
   `release` variant.

Both files are ignored by git, so they're never uploaded. Back them up: without them you can't
update the app without uninstalling it first.
