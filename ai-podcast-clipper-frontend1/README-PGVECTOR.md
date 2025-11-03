# Enabling pgvector Extension

The `vector` type requires the pgvector extension to be enabled in your PostgreSQL database.

## Option 1: Using the Script (Recommended)

1. Install dependencies:
```bash
npm install
```

2. Run the enable script:
```bash
npm run db:enable-pgvector
```

3. Then push your schema:
```bash
npm run db:push
```

## Option 2: Manual SQL

If the script doesn't work (e.g., permission issues), run this SQL directly in your database:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

You can do this via:
- **Prisma Studio**: Not available for raw SQL
- **pgAdmin**: Connect and run the SQL
- **psql**: `psql -d your_database -c "CREATE EXTENSION IF NOT EXISTS vector;"`
- **Your database provider's console** (e.g., Neon, Supabase, etc.)

## Option 3: Using Prisma Migrate

If you're using migrations, you can create a migration file:

1. Create a new migration:
```bash
npx prisma migrate dev --name enable_pgvector --create-only
```

2. Edit the migration SQL file to add:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

3. Apply the migration:
```bash
npx prisma migrate dev
```

## Troubleshooting

### Permission Denied
If you get a permission error, you need to:
1. Connect as a database superuser
2. Or ask your database admin to enable the extension
3. Or use your database provider's console (Neon, Supabase, etc. usually allow this)

### Extension Not Found
If PostgreSQL says the extension doesn't exist:
- **Neon**: pgvector is pre-installed, just needs to be enabled
- **Supabase**: pgvector is available, enable it via SQL editor
- **Self-hosted**: You may need to install pgvector first: `apt-get install postgresql-XX-pgvector`

## After Enabling

Once pgvector is enabled, you can:
1. Run `npm run db:push` to apply the schema
2. Or create a migration with `npx prisma migrate dev`

