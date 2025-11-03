# Fixing Prisma Permission Error on Windows

## Error
```
EPERM: operation not permitted, rename 'query_engine-windows.dll.node.tmp' -> 'query_engine-windows.dll.node'
```

## Cause
The Prisma query engine DLL file is locked by another process (dev server, IDE, or another Node process).

## Solutions (try in order):

### Solution 1: Close All Node Processes
1. **Close your dev server** (Ctrl+C in terminal running `npm run dev`)
2. **Close any other Node processes**
3. Run: `npm run postinstall` or `npx prisma generate`

### Solution 2: Close IDE/Editor
1. **Close VS Code/Cursor** completely
2. **Run Prisma generate** from a regular command prompt (not in IDE terminal)
3. Reopen your IDE

### Solution 3: Delete .prisma Folder
1. Close all Node processes
2. Delete the `.prisma` folder:
   ```bash
   rmdir /s /q node_modules\.prisma
   ```
3. Run: `npx prisma generate`

### Solution 4: Kill Node Processes
1. Open Task Manager (Ctrl+Shift+Esc)
2. End all `node.exe` processes
3. Run: `npx prisma generate`

### Solution 5: Run as Administrator
1. Close all Node processes
2. Right-click Command Prompt → "Run as administrator"
3. Navigate to your project
4. Run: `npx prisma generate`

### Solution 6: Manual Cleanup
```bash
# Stop all Node processes first
taskkill /F /IM node.exe

# Delete Prisma cache
rmdir /s /q node_modules\.prisma
rmdir /s /q node_modules\@prisma\client

# Regenerate
npx prisma generate
```

### Solution 7: Skip Postinstall (Temporary)
If you need to install packages without generating Prisma:

1. Temporarily modify `package.json`:
   ```json
   "postinstall": "echo 'Skipping prisma generate'"
   ```

2. Install packages:
   ```bash
   npm install
   ```

3. Later, when everything is closed, manually run:
   ```bash
   npx prisma generate
   ```

## Prevention
- Always close dev servers before running `npm install`
- Don't run Prisma commands while dev server is running
- Close IDE when regenerating Prisma client

