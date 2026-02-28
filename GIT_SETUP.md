# Git Setup & Collaboration Guide

This guide covers how to set up Git for collaboration, push to a remote repository, and work with team members on the EVE ESI application.

## Prerequisites

- Git installed on your system
- Access to a Git hosting service (GitHub, GitLab, or Bitbucket)
- SSH key or personal access token configured (for push access)

## Setting Up Remote Repository

### Step 1: Create a Repository on GitHub/GitLab/Bitbucket

1. Go to your preferred Git hosting service
2. Create a new repository (e.g., `eve-esi-app`)
3. **Important**: Do NOT initialize with README, .gitignore, or license (the project already has these)
4. Copy the repository URL (SSH or HTTPS)

### Step 2: Add Remote Origin

```bash
cd /path/to/eve_esi_app
git remote add origin <your-repository-url>

# Examples:
# GitHub SSH: git remote add origin git@github.com:username/eve-esi-app.git
# GitHub HTTPS: git remote add origin https://github.com/username/eve-esi-app.git
# GitLab: git remote add origin git@gitlab.com:username/eve-esi-app.git
```

### Step 3: Push to Remote

```bash
# Push all branches
git push -u origin master

# Or push the current branch
git push -u origin $(git branch --show-current)
```

## Cloning on Another Machine

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd eve-esi-app
```

### Step 2: Set Up Environment

```bash
# Copy the environment template
cp .env.example .env

# Edit .env with your EVE Online API credentials
# See README.md for detailed setup instructions
```

### Step 3: Install Dependencies (if developing locally)

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### Step 4: Run with Docker

```bash
docker-compose up --build
```

## Branch Strategy

### Recommended Workflow

We recommend using **Git Flow** or a simplified feature branch workflow:

```
master/main     - Production-ready code
├── develop     - Integration branch for features
│   ├── feature/feature-name    - New features
│   ├── bugfix/bug-description  - Bug fixes
│   └── hotfix/critical-fix     - Urgent production fixes
```

### Creating a Feature Branch

```bash
# Create and switch to a new feature branch
git checkout -b feature/your-feature-name

# Make changes, commit frequently
git add .
git commit -m "feat: Add new feature description"

# Push your branch
git push -u origin feature/your-feature-name
```

### Merging Features

1. Push your feature branch
2. Create a Pull Request/Merge Request on your Git hosting service
3. Request code review from team members
4. Merge after approval

## Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
feat: Add new feature
fix: Fix a bug
docs: Documentation changes
style: Code style changes (formatting, etc.)
refactor: Code refactoring
test: Adding or modifying tests
chore: Maintenance tasks
```

Examples:
```bash
git commit -m "feat: Add multiple character support"
git commit -m "fix: Resolve OAuth callback error"
git commit -m "docs: Update README with new features"
```

## Collaboration Workflow

### Daily Development

```bash
# Start your day by pulling latest changes
git checkout master
git pull origin master

# Create/switch to your feature branch
git checkout -b feature/my-new-feature

# Make changes and commit
git add .
git commit -m "feat: Description of changes"

# Push regularly
git push origin feature/my-new-feature
```

### Handling Merge Conflicts

```bash
# Update your branch with latest master
git checkout master
git pull origin master
git checkout feature/my-feature
git merge master

# Resolve conflicts in your editor
# Then commit the resolution
git add .
git commit -m "chore: Merge master and resolve conflicts"
```

## Useful Git Commands

```bash
# Check status
git status

# View commit history
git log --oneline -10

# View changes
git diff

# Stash changes temporarily
git stash
git stash pop

# Undo last commit (keep changes)
git reset --soft HEAD~1

# View remote repositories
git remote -v
```

## Security Reminders

⚠️ **IMPORTANT**: See [SECURITY.md](SECURITY.md) for security guidelines.

- **Never commit** the `.env` file
- **Never share** EVE API credentials in commits or messages
- **Always verify** `.gitignore` excludes sensitive files before pushing

## Troubleshooting

### "Permission denied" when pushing

- Ensure your SSH key is added to your Git account
- Or use a personal access token with HTTPS

### ".env not found" after cloning

- Copy `.env.example` to `.env` and configure credentials
- See README.md for detailed EVE API setup

### "Merge conflicts" when pulling

- Pull the latest changes first
- Resolve conflicts in your editor
- Commit the resolved files

## Additional Resources

- [Git Documentation](https://git-scm.com/doc)
- [GitHub Flow Guide](https://docs.github.com/en/get-started/quickstart/github-flow)
- [Conventional Commits](https://www.conventionalcommits.org/)
