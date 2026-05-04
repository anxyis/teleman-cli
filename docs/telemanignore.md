# Teleman Ignore Files (`.telemanignore`)

Teleman provides support for ignoring specific files and directories during `copy`, `move`, and `sync` operations using a `.telemanignore` file. This works similarly to `.gitignore` files.

## Overview

When running an upload or sync operation, Teleman looks for a `.telemanignore` file in the root of the source directory (or in the parent directory if the source is a single file). Any files or folders matching the patterns defined in this file are completely skipped during the scanning phase and will not be uploaded to your Telegram virtual target.

**Key Characteristics:**
- **Local Scope Only:** Patterns only apply to local source paths during upload operations (`copy`, `move`, `sync`). They do not affect download operations or remote listings.
- **Fast Skipping:** Entire directories can be skipped without scanning their contents, making it extremely efficient.
- **Safety:** Prevents accidental upload of unwanted, temporary, or sensitive files.

## Supported Patterns (v1)

In this version (v1), the following pattern types are supported:

### 1. Folder Exclusion
To ignore an entire directory and all of its contents, append a trailing slash `/` to the folder name.
```text
node_modules/
.git/
build/
```

### 2. Extension Match
To ignore files by their extension, prefix the extension with `*.`.
```text
*.log
*.tmp
*.bak
```

### 3. Exact File Match
To ignore a specific file by name, just provide the exact filename.
```text
secret.txt
config.local.yaml
.DS_Store
```

### 4. Basic Negation (Override)
You can negate an ignore rule by prefixing a pattern with `!`. This tells Teleman to **include** a file even if a previous rule ignored it.
- Patterns are processed in top-down order. The **last matching rule wins**.
- Negation only works on exact paths or extensions, similar to standard ignore rules.

```text
# Ignore all logs
*.log

# Except this specific log file
!important.log
```

### Comments and Blank Lines
Empty lines and lines starting with `#` are considered comments and are ignored by the parser.

## Example `.telemanignore` File

```text
# Exclude build and dependency directories
node_modules/
vendor/
dist/

# Exclude log and temp files
*.log
*.tmp

# Exclude sensitive secrets
credentials.json
.env
```

## Behavior Details

During `teleman copy`, `teleman move`, or `teleman sync`:
1. Teleman loads the `.telemanignore` file from the source directory.
2. While scanning the local files, it checks the relative path of each file and folder against the ignore patterns.
3. If a directory matches an ignore pattern, Teleman aborts traversal for that branch entirely.
4. If a file matches, it is skipped and neither hashed nor uploaded.
