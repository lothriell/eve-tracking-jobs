#!/bin/bash
#
# safe-pull.sh - Safely pull updates for EVE ESI App
# Protects .env file and provides rollback capabilities
#
# Usage: ./safe-pull.sh [--auto|--dry-run|--help]
#

set -e

# Configuration
APP_DIR="${APP_DIR:-$HOME/docker/eve_esi_app}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/eve_esi_app}"
REMOTE="origin"
BRANCH="${BRANCH:-main}"
ENV_FILE=".env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
AUTO_MODE=false
DRY_RUN=false

for arg in "$@"; do
    case $arg in
        --auto)
            AUTO_MODE=true
            ;;
        --dry-run)
            DRY_RUN=true
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --auto      Run without prompts (auto-rebuild containers)"
            echo "  --dry-run   Show what would happen without making changes"
            echo "  --help      Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  APP_DIR     App directory (default: ~/docker/eve_esi_app)"
            echo "  BACKUP_DIR  Backup directory (default: ~/backups/eve_esi_app)"
            echo "  BRANCH      Git branch to pull (default: main)"
            exit 0
            ;;
    esac
done

# Helper functions
print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

print_step() {
    echo -e "${GREEN}▶ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ WARNING: $1${NC}"
}

print_error() {
    echo -e "${RED}✖ ERROR: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✔ $1${NC}"
}

confirm() {
    if [ "$AUTO_MODE" = true ]; then
        return 0
    fi
    read -p "$1 [y/N] " response
    case "$response" in
        [yY][eE][sS]|[yY]) 
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Main script starts here
print_header "EVE ESI App - Safe Pull Script"

# Check if we're in the right directory
if [ ! -d "$APP_DIR" ]; then
    print_error "App directory not found: $APP_DIR"
    exit 1
fi

cd "$APP_DIR"
print_step "Working in: $APP_DIR"

# Verify Git repository
if [ ! -d ".git" ]; then
    print_error "Not a Git repository. Please initialize Git first."
    echo "Run: git init && git remote add origin https://github.com/lothriell/eve-tracking-jobs.git"
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# ═══════════════════════════════════════════════════════════════
# Step 1: Backup .env
# ═══════════════════════════════════════════════════════════════
print_header "Step 1: Backup .env File"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ENV_BACKUP="$BACKUP_DIR/.env.pre-pull.$TIMESTAMP"

if [ -f "$ENV_FILE" ]; then
    if [ "$DRY_RUN" = true ]; then
        print_step "[DRY-RUN] Would backup .env to: $ENV_BACKUP"
    else
        cp "$ENV_FILE" "$ENV_BACKUP"
        print_success "Backed up .env to: $ENV_BACKUP"
    fi
    
    # Also create a quick-access symlink to latest backup
    if [ "$DRY_RUN" = false ]; then
        ln -sf "$ENV_BACKUP" "$BACKUP_DIR/.env.latest"
    fi
else
    print_warning ".env file not found - nothing to backup"
fi

# ═══════════════════════════════════════════════════════════════
# Step 2: Check for Updates
# ═══════════════════════════════════════════════════════════════
print_header "Step 2: Check for Updates"

print_step "Fetching from $REMOTE..."
if [ "$DRY_RUN" = true ]; then
    print_step "[DRY-RUN] Would fetch from $REMOTE"
else
    git fetch "$REMOTE"
fi

# Count new commits
NEW_COMMITS=$(git rev-list HEAD.."$REMOTE/$BRANCH" --count 2>/dev/null || echo "0")

if [ "$NEW_COMMITS" -eq 0 ]; then
    print_success "Already up to date! No new commits."
    if [ "$DRY_RUN" = false ] && [ -f "$ENV_BACKUP" ]; then
        # Clean up unnecessary backup
        rm -f "$ENV_BACKUP"
        rm -f "$BACKUP_DIR/.env.latest"
        print_step "Removed unnecessary backup"
    fi
    exit 0
fi

print_step "Found $NEW_COMMITS new commit(s):"
echo ""
git log HEAD.."$REMOTE/$BRANCH" --oneline --color
echo ""

# Show changed files
print_step "Files that will change:"
git diff --name-only HEAD "$REMOTE/$BRANCH"
echo ""

# Check if .env would be affected
if git diff --name-only HEAD "$REMOTE/$BRANCH" | grep -q "^\.env$"; then
    print_warning ".env IS in the changed files!"
    print_warning "Your local .env will be preserved from backup."
fi

# ═══════════════════════════════════════════════════════════════
# Step 3: Pull Updates
# ═══════════════════════════════════════════════════════════════
print_header "Step 3: Pull Updates"

if [ "$DRY_RUN" = true ]; then
    print_step "[DRY-RUN] Would pull from $REMOTE/$BRANCH"
else
    if ! confirm "Proceed with pull?"; then
        print_warning "Pull cancelled by user"
        exit 0
    fi
    
    print_step "Pulling updates..."
    if git pull "$REMOTE" "$BRANCH"; then
        print_success "Pull completed successfully"
    else
        print_error "Pull failed! You may have merge conflicts."
        echo ""
        echo "To resolve:"
        echo "  1. Check status: git status"
        echo "  2. Resolve conflicts manually"
        echo "  3. Complete merge: git add . && git commit"
        echo ""
        echo "To abort and restore:"
        echo "  git merge --abort"
        echo "  cp $ENV_BACKUP .env"
        exit 1
    fi
fi

# ═══════════════════════════════════════════════════════════════
# Step 4: Verify .env
# ═══════════════════════════════════════════════════════════════
print_header "Step 4: Verify .env File"

if [ "$DRY_RUN" = true ]; then
    print_step "[DRY-RUN] Would verify .env file"
else
    if [ -f "$ENV_FILE" ]; then
        # Compare with backup
        if [ -f "$ENV_BACKUP" ]; then
            if diff -q "$ENV_FILE" "$ENV_BACKUP" > /dev/null 2>&1; then
                print_success ".env is unchanged (identical to backup)"
            else
                print_warning ".env has changed! Checking if it needs restoration..."
                
                # Check if .env was overwritten (became different from our backup)
                if confirm "Your .env appears to have changed. Restore from backup?"; then
                    cp "$ENV_BACKUP" "$ENV_FILE"
                    print_success "Restored .env from backup"
                else
                    print_step "Keeping modified .env (backup available at: $ENV_BACKUP)"
                fi
            fi
        fi
    else
        print_warning ".env file is missing! Restoring from backup..."
        if [ -f "$ENV_BACKUP" ]; then
            cp "$ENV_BACKUP" "$ENV_FILE"
            print_success "Restored .env from backup"
        else
            print_error "No backup available to restore!"
        fi
    fi
fi

# ═══════════════════════════════════════════════════════════════
# Step 5: Rebuild Docker Containers
# ═══════════════════════════════════════════════════════════════
print_header "Step 5: Rebuild Docker Containers"

# Check if docker-compose or docker compose exists
if command -v docker &> /dev/null; then
    # Check for compose file
    if [ -f "docker-compose.yml" ] || [ -f "docker-compose.yaml" ] || [ -f "compose.yml" ] || [ -f "compose.yaml" ]; then
        
        if [ "$DRY_RUN" = true ]; then
            print_step "[DRY-RUN] Would rebuild Docker containers"
        else
            if [ "$AUTO_MODE" = true ] || confirm "Rebuild and restart Docker containers?"; then
                print_step "Stopping containers..."
                docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
                
                print_step "Building containers..."
                docker compose build --no-cache 2>/dev/null || docker-compose build --no-cache 2>/dev/null
                
                print_step "Starting containers..."
                docker compose up -d 2>/dev/null || docker-compose up -d 2>/dev/null
                
                print_success "Containers rebuilt and started"
                
                # Show container status
                echo ""
                print_step "Container status:"
                docker compose ps 2>/dev/null || docker-compose ps 2>/dev/null
            else
                print_step "Skipping container rebuild"
                echo "Run manually: docker compose down && docker compose up -d --build"
            fi
        fi
    else
        print_warning "No docker-compose file found"
    fi
else
    print_warning "Docker not found - skipping container rebuild"
fi

# ═══════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════
print_header "Summary"

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}This was a dry run - no changes were made${NC}"
    echo ""
fi

echo "✔ Commits pulled: $NEW_COMMITS"
echo "✔ .env backup: $ENV_BACKUP"
echo ""
echo "Changed files:"
git diff --name-only HEAD~"$NEW_COMMITS" HEAD 2>/dev/null || echo "(unable to determine)"
echo ""

if [ "$DRY_RUN" = false ]; then
    print_step "Verify the app is working correctly!"
    echo ""
    echo "Useful commands:"
    echo "  View logs:     docker compose logs -f"
    echo "  Check status:  docker compose ps"
    echo "  Rollback:      git reset --hard HEAD~$NEW_COMMITS && cp $ENV_BACKUP .env"
fi

print_success "Done!"
