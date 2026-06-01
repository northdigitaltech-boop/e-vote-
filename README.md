# E Vote — GBLA H-4 Roundu (Railway deploy)

Node.js + Express + MySQL pre-polling app. Express serves the frontend (index.html) and the /api routes.

## Deploy on Railway
1. Push this folder to GitHub.
2. Railway → New Project → Deploy from GitHub repo → select the repo.
3. Add a MySQL database: New → Database → Add MySQL.
4. In the app service → Variables, add:
   DB_HOST=${{MySQL.MYSQLHOST}}
   DB_PORT=${{MySQL.MYSQLPORT}}
   DB_USER=${{MySQL.MYSQLUSER}}
   DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
   DB_NAME=${{MySQL.MYSQLDATABASE}}
   JWT_SECRET=<a long random string>
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=<your admin password>
   NODE_ENV=production
   (Do NOT set PORT — Railway provides it.)
5. Import database/hostinger_import.sql into the MySQL service (Data/Query console).
6. App service → Settings → Networking → Generate Domain. Open it.

Admin login is created automatically on first start from ADMIN_USERNAME / ADMIN_PASSWORD.
