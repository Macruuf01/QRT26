# Qaaraanka Sanadlaha ee Reer Taawle

The site has one shared access password. Anyone with that password can sign in and manage the same contribution records. Data is stored in SQLite on the server. The password is set on the server and is never included in the browser code.

## Run locally

1. Install Node.js 22.9 or later.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env` and set a private `ACCESS_PASSWORD` with at least 8 characters.
4. Run `npm start` and open `http://localhost:3000`.

Keep `.env` and the `data` folder private. Do not publish the password in a public repository.

## Deploy on Render

1. Create a Node.js web service from this repository. Use `npm install` for the build command and `npm start` for the start command.
2. Choose the paid `0.5c-512mb` service plan so the persistent disk can be attached.
3. Add a 1 GB persistent disk mounted at `/var/data`.
4. Set `NODE_ENV=production`, `DATA_FILE=/var/data/qaaraan.sqlite`, and `ACCESS_PASSWORD` in the service's environment variables. Enter the access password directly in Render; never put it in GitHub.
5. Deploy, then share the HTTPS `onrender.com` link and the access password with the people you trust.

Everyone using the shared password can see, add, edit, and delete all contribution records. Change `ACCESS_PASSWORD` in Render to replace the shared password. If two people edit at once, the later save is stopped and the page asks for a refresh to avoid silently overwriting the other person's update.
