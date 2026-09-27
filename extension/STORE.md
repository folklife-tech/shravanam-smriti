# Chrome Web Store listing

Copy these into the Chrome Web Store developer dashboard when publishing. Replace `<site-url>` with your GitHub Pages address (for example `https://<owner>.github.io/<repo>/`).

## Store listing

- **Name:** Shravanam Smriti Attendance
- **Summary** (max 132 characters): Counts who attends your Google Meet sessions and saves it to your own Shravanam Smriti dashboard. No third-party servers.
- **Category:** Tools
- **Language:** English
- **Description:**

  > Shravanam Smriti Attendance keeps track of who attends your Google Meet study sessions, and for how long.
  >
  > While you're in a call, it reads participants' names from Meet's People list every few seconds. When the meeting ends, it saves the attendance to your organisation's own Shravanam Smriti dashboard, where admins see streaks, attendance trends and who might need a call.
  >
  > - Works in the background: join your call as usual.
  > - Saves automatically when the meeting ends, or asks which course a new meeting belongs to.
  > - Shows a live count in the toolbar popup, so you can check it's working.
  > - Download the attendance as a CSV at any time.
  > - Private by design: attendance stays in your browser until it's saved to your own database. Nothing is sent to the developers or anyone else.
  >
  > For administrators of a Shravanam Smriti deployment. You need an admin account to save attendance.

- **Privacy policy URL:** `<site-url>privacy.html`
- **Homepage URL:** `<site-url>`
- **Icon:** `icons/icon-128.png`
- **Screenshots** (1280x800 or 640x400, at least one): the popup while recording, and the dashboard in the web app. The store requires your own screenshots; take them from a real call or the local demo (`make dev`, then a test meeting).

## Privacy practices tab

**Single purpose:**
> Record which participants attend the user's Google Meet calls and for how long, and save that attendance to the user's own Shravanam Smriti database.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Keeps the attendance of the current and recent meetings, the sign-in session and the user's settings in the browser until they are saved. |
| `alarms` | Checks once a minute whether a meeting has ended (the tab was closed or the user left), and retries saving if the network was down. |
| `identity` | Opens the Google sign-in window so the admin can sign in to their Shravanam Smriti account. |
| `notifications` | Tells the user when a meeting's attendance was saved, or when a meeting needs their input (choose a course, sign in, resolve a duplicate). |
| Host `https://meet.google.com/*` | Reads participant names from the Google Meet page while the user is in a call. This is the extension's core function. |
| Host `https://<project-ref>.supabase.co/*` | Sends the finished attendance to the user's own Shravanam Smriti database. |

**Remote code:** No, the extension doesn't use remote code. All code is in the package.

**Data usage:** tick these data types:
- **Personally identifiable information:** participants' display names, as shown in Meet.
- **Authentication information:** the sign-in session for the user's Shravanam Smriti account.
- **User activity:** meeting codes and when participants were present.

Then certify all three statements:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Distribution

- **Visibility:** *Unlisted* (only people with the link can install it). If all admins use one Google Workspace domain, *Private* restricts it to that domain.
- **Regions:** all regions, or only where your admins are.

## After the first upload

The store assigns the extension a permanent ID. Google sign-in in the extension then needs one setting in Supabase:

1. Copy the item ID from the developer dashboard (32 letters, for example `abcdefghijklmnopabcdefghijklmnop`).
2. In Supabase, go to **Authentication → URL Configuration → Redirect URLs** and add `https://<item-id>.chromiumapp.org/`.

Nothing changes in Google Cloud Console. Google redirects to Supabase, and Supabase redirects to the extension.
