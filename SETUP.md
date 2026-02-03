# Debate Arena - Complete Setup Guide

## Prerequisites

1. **Node.js** (v18 or later) - [Download](https://nodejs.org/)
2. **pnpm** (package manager) - `npm install -g pnpm`
3. **MySQL** (v8.0 or later) - [Download](https://dev.mysql.com/downloads/mysql/)

---

## Quick Start

### 1. Install Dependencies

```bash
cd /Users/rishi/Desktop/Manus/GitHub/manushackathon
pnpm install
```

### 2. Set Up MySQL Database

#### Option A: Using Homebrew (macOS)

```bash
# Install MySQL
brew install mysql

# Start MySQL service
brew services start mysql

# Secure installation (set root password)
mysql_secure_installation

# Login to MySQL
mysql -u root -p
```

#### Option B: Using Docker (Recommended for local dev)

```bash
# Run MySQL in Docker
docker run --name debate-arena-db \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -e MYSQL_DATABASE=debate_arena \
  -e MYSQL_USER=debate_user \
  -e MYSQL_PASSWORD=debate_password \
  -p 3306:3306 \
  -d mysql:8.0

# Wait a few seconds for MySQL to initialize
sleep 10
```

### 3. Create Database and User

```bash
# Connect to MySQL (use your root password)
mysql -u root -p
```

Run these SQL commands:

```sql
-- Create the database
CREATE DATABASE IF NOT EXISTS debate_arena;

-- Create a dedicated user (recommended)
CREATE USER IF NOT EXISTS 'debate_user'@'localhost' IDENTIFIED BY 'your_secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON debate_arena.* TO 'debate_user'@'localhost';
FLUSH PRIVILEGES;

-- Verify
SHOW DATABASES;
exit;
```

### 4. Configure Environment Variables

```bash
# Copy the example env file
cp .env.example .env
```

Edit `.env` with your settings:

```dotenv
# Database connection
DATABASE_URL=mysql://debate_user:your_secure_password@localhost:3306/debate_arena

# Generate a secure JWT secret
JWT_SECRET=$(openssl rand -hex 32)

# For local development (bypasses external OAuth)
AUTH_MODE=local

# Server port
PORT=3000
```

**Generate JWT Secret:**

```bash
openssl rand -hex 32
# Copy the output to JWT_SECRET in .env
```

### 5. Run Database Migrations

```bash
# Generate and apply migrations
pnpm db:push
```

This creates all the required tables:

- `users` - User accounts
- `debate_rooms` - Debate session rooms
- `debate_participants` - Room participants
- `debate_motions` - Debate topics
- `debate_speeches` - Speech transcripts
- `points_of_information` - POIs during debates
- `argument_nodes` - Argument mindmap
- `debate_feedback` - AI feedback
- `transcript_segments` - Live transcript
- `rule_violations` - Rule tracking

### 6. Start the Development Server

```bash
pnpm dev
```

The app will be available at: **http://localhost:3000**

---

## API Keys & External Services

### Required

| Service        | Environment Variable | Description                      |
| -------------- | -------------------- | -------------------------------- |
| MySQL Database | `DATABASE_URL`       | Your MySQL connection string     |
| JWT Secret     | `JWT_SECRET`         | Random secret for session tokens |

### Optional (for full features)

| Service         | Environment Variable                               | Description                          |
| --------------- | -------------------------------------------------- | ------------------------------------ |
| Forge API (LLM) | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | AI topic generation, speech analysis |
| Google Maps     | Uses Forge API proxy                               | Map visualization features           |

---

## Authentication Setup

### Local Development Mode (Recommended)

The app uses a custom OAuth system. For local development, you have two options:

#### Option 1: Local Auth Bypass (Easiest)

The app now includes a local development authentication bypass. When `AUTH_MODE=local` is set, you can login without external OAuth.

#### Option 2: Skip Authentication During Development

For testing, the API includes an auth bypass for development. Unauthenticated requests will work with limited functionality.

---

## Database Setup Script (Complete)

Save this as `setup-database.sh` and run it:

```bash
#!/bin/bash

# Configuration
DB_NAME="debate_arena"
DB_USER="debate_user"
DB_PASS="your_secure_password"
MYSQL_ROOT_PASS="your_root_password"

echo "Setting up Debate Arena database..."

# Create database and user
mysql -u root -p"$MYSQL_ROOT_PASS" << EOF
CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';
GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
EOF

echo "Database setup complete!"
echo ""
echo "Add this to your .env file:"
echo "DATABASE_URL=mysql://$DB_USER:$DB_PASS@localhost:3306/$DB_NAME"
```

---

## Troubleshooting

### "Can't connect to MySQL server"

1. Check MySQL is running:

   ```bash
   brew services list  # macOS
   # or
   docker ps  # Docker
   ```

2. Verify credentials in `.env`

3. Test connection:
   ```bash
   mysql -u debate_user -p debate_arena
   ```

### "Port 3000 already in use"

```bash
# Find and kill the process
lsof -i :3000
kill -9 <PID>
```

### Migration Errors

```bash
# Reset migrations (WARNING: deletes all data)
rm -rf drizzle/*.sql
pnpm db:push
```

---

## Project Scripts

| Command        | Description              |
| -------------- | ------------------------ |
| `pnpm dev`     | Start development server |
| `pnpm build`   | Build for production     |
| `pnpm start`   | Start production server  |
| `pnpm db:push` | Run database migrations  |
| `pnpm test`    | Run tests                |
| `pnpm check`   | TypeScript type checking |

---

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React Client  │────▶│  Express Server │────▶│     MySQL       │
│   (Vite + tRPC) │     │  (tRPC + OAuth) │     │   (Drizzle ORM) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌─────────────────┐
                        │   Forge API     │
                        │  (LLM + Maps)   │
                        └─────────────────┘
```

---

## Next Steps

1. Visit http://localhost:3000
2. Create or join a debate room
3. Select a topic and start debating!

For production deployment, you'll need to:

1. Set up a proper MySQL database (e.g., PlanetScale, AWS RDS)
2. Configure a reverse proxy (nginx)
3. Set proper CORS and security headers
4. Use environment-specific OAuth credentials
