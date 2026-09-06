export default function Privacy({ onContact }: { onContact: () => void }) {
  return (
    <main className="privacy-page">
      <h1>Privacy</h1>
      <p>
        This unofficial The Long Dark companion is operated by henhau. This page
        describes the data the app uses.
      </p>
      <h2>Private runs and accounts</h2>
      <p>
        Guest runs stay in this browser. Signed-in runs, notes, drawings, loot
        selections and saved map views are stored in the app’s database and
        cached on your device. They are available through your account, not
        published to other users. Account data includes your username and a
        password hash; no email address is required. Authentication also records
        session identifiers, expiry, and browser or network information.
      </p>
      <h2>Recovery and deletion</h2>
      <p>
        Your recovery code is shown once. Only a keyed hash is stored. Using the
        code replaces it and signs out existing sessions. In the account menu
        you can replace your code or delete your account using your password.
        Deletion removes the account, private runs, recovery hash, sessions,
        submitted account reports and account chat content from the live
        database. Account caches on this browser are cleared. Clear browser
        storage on other devices to remove their local copies. Guest runs are
        separate and can be removed by clearing this site’s browser storage.
      </p>
      <h2>Public chat and moderation</h2>
      <p>
        Chat messages, usernames and reactions are public. Guests receive an
        anonymous name linked to a browser cookie. Messages and their reactions
        and reports are automatically deleted after 48 hours. Account deletion
        removes your account’s chat messages sooner. Pseudonymous chat
        identities, guest/account links and moderation restrictions may remain
        to enforce bans and prevent abuse; deleting an account does not lift a
        restriction.
      </p>
      <h2>Site activity and reports</h2>
      <p>
        Basic activity counts help henhau understand which pages and maps people
        use. A visit cookie groups activity for 30 minutes of inactivity. Events
        include the page, region, device category and referring domain, and are
        retained for up to 90 days. These event records do not include private
        notes, full referring URLs or IP addresses. Authentication and abuse
        prevention are separate: chat rate limits use keyed hashes of network
        addresses, and hosting logs may record requests. Issue and feature
        reports are visible to henhau and include the content and optional reply
        address you submit. Reports remain until removed or, for reports
        attached to an account, until account deletion.
      </p>
      <h2>Cookies and local storage</h2>
      <p>
        The app uses cookies for sign-in, anonymous chat and visit counting.
        Browser storage holds runs, pending saves, recovery copies of
        conflicting run edits, and display preferences. Fonts and map assets are
        served with the app. This version does not load advertising or
        third-party analytics scripts.
      </p>
      <h2>Questions or data requests</h2>
      <p>
        You can ask henhau about your data, request a correction or request
        deletion through the site’s issue form. Include a reply address if you
        want a response; never send your password or recovery code.
      </p>
      <button className="text-button" onClick={onContact}>
        Contact henhau
      </button>
    </main>
  );
}
