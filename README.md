# Family Location Site

Arabic website for relatives to submit a house location without names, phone numbers, emails, accounts, or login.

## Run locally

```bash
npm start
```

Open:

- Submit page: `http://localhost:3000`
- Admin page: `http://localhost:3000/admin`

## Deploy

This project is ready for a Node hosting service such as Render or Railway.

Important: the current version stores submissions in `data/submissions.json`. On many free hosting plans, files can reset when the server restarts. For real public use, connect a database before relying on it long-term.
