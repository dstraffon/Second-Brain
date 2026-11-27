# Setting up Google Calendar

The Calendar tile reads your Google Calendar straight from the browser. Google needs to know which website is asking, so you create a free Google Cloud project and an OAuth client once (about 15 minutes), then paste its client ID into the app. Nothing here costs money, and the app only ever gets read-only access.

You do this once. The client ID syncs to your other devices with everything else; each device then taps **Connect Google Calendar** once.

## 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in with the Google account whose calendar you want to see. Accept the terms if asked.
2. Click the project picker at the top (it may say **Select a project**), then **New project**.
3. Name it `second-brain`, leave Location as is, and click **Create**. When it's done, make sure the picker at the top shows `second-brain`.

## 2. Turn on the Google Calendar API

1. Open [the Google Calendar API page](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) (or search "Google Calendar API" in the top search bar).
2. Click **Enable**.

## 3. Set up the sign-in screen

1. Open **Google Auth Platform** ([direct link](https://console.cloud.google.com/auth/overview)) and click **Get started**.
2. **App information:** App name `Second Brain`, user support email: your address. Next.
3. **Audience:** choose **External**. Next.
4. **Contact information:** your address. Next, tick the agreement, **Create**.
5. In the left menu, open **Audience**. Leave Publishing status on **Testing**. Under **Test users**, click **Add users**, add your own Gmail address, and **Save**. Only addresses listed here can sign in, which is what you want for a personal app, and it means Google never needs to review it.
6. In the left menu, open **Data Access**, click **Add or remove scopes**, filter for `calendar.readonly`, tick **.../auth/calendar.readonly** ("See and download any calendar you can access using your Google Calendar"), click **Update**, then **Save**.

## 4. Create the OAuth client

1. In the left menu, open **Clients** and click **Create client**.
2. Application type: **Web application**. Name: `Second Brain`.
3. Under **Authorized JavaScript origins**, click **Add URI** and enter exactly:
   `https://dstraffon.github.io`
   (no path and no slash at the end; Google wants the site's origin, not the `/Second-Brain/` page). If you also run the app locally, add `http://localhost:5173` too.
4. Leave **Authorized redirect URIs** empty and click **Create**.
5. Copy the **Client ID**. It looks like `1234567890-abc123def456.apps.googleusercontent.com`. You don't need the client secret; the app never uses it.

## 5. Connect the app

1. Open Second Brain. On the **Calendar** tile (or **Settings → Google Calendar**), paste the client ID and click **Save**.
2. Click **Connect Google Calendar**. A Google window opens.
3. Pick your account. Google shows **"Google hasn't verified this app"** because it's in testing mode: click **Continue**. (That warning is about your own project; it's expected.)
4. Tick the box to allow seeing your calendars and click **Continue**. Today's events appear on the tile.

On each other device (your phone, say), open the app and tap **Connect Google Calendar** once.

## Day to day

- The tile shows today and tomorrow; click **Calendar** for the next seven days, and the calendar chips there to hide or show individual calendars.
- Google's browser sign-in lasts an hour and there's no server to renew it quietly, so after that the tile keeps showing the events it last fetched and the refresh button turns into **↻ Refresh**. One tap renews it, with no consent screen after the first time. If the browser blocks the Google window, allow popups for the site.
- To stop, use **Settings → Google Calendar → Disconnect this device**. To remove access completely, open [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and remove Second Brain.

## Troubleshooting

- **"Error 400: redirect_uri_mismatch" or "origin_mismatch"**: the origin in step 4.3 doesn't match. It must be exactly `https://dstraffon.github.io`. Changes can take a few minutes to apply.
- **"Access blocked: Second Brain has not completed the Google verification process"**: the address you signed in with isn't a test user (step 3.5).
- **"The Google Calendar API isn't turned on"**: do step 2 for the same project the client ID came from.

## For a build with the ID baked in

Instead of pasting, the ID can come from the build: add a repository variable `GOOGLE_CLIENT_ID` (GitHub → Settings → Secrets and variables → Actions → Variables). An ID pasted in the app takes priority. A client ID isn't a secret; it only works from the origins you authorized.
