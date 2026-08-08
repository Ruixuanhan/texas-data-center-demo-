#!/bin/bash
# Project Radar Environment Verification Script
# Checks if all dependencies are installed and ready

echo "🔍 Project Radar Local Environment Verification"
echo "==============================================="
echo ""

REPO_DIR="/home/qinxuan/personal_proj/texas-data-center-demo-"
cd "$REPO_DIR"

PASS="✅"
WARN="⚠️ "
FAIL="❌"

# Check uv
echo "Checking package managers..."
if command -v uv &> /dev/null; then
    UV_VERSION=$(uv --version)
    echo "$PASS uv: $UV_VERSION"
else
    echo "$FAIL uv not found"
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo "$PASS npm: $NPM_VERSION"
else
    echo "$FAIL npm not found (required for frontend)"
fi

# Check Python via uv
echo ""
echo "Checking Python environment..."
PYTHON_VERSION=$(uv run python --version 2>&1)
if [[ $PYTHON_VERSION == *"3.11"* ]] || [[ $PYTHON_VERSION == *"3.12"* ]]; then
    echo "$PASS Python: $PYTHON_VERSION (via uv)"
else
    echo "$WARN Python: $PYTHON_VERSION (expecting 3.11+)"
fi

# Check Python dependencies
echo ""
echo "Checking Python dependencies..."
MISSING_DEPS=0

for pkg in fastapi uvicorn pandas sqlalchemy requests; do
    if uv run python -c "import $pkg" 2>/dev/null; then
        echo "$PASS $pkg"
    else
        echo "$FAIL $pkg (missing)"
        MISSING_DEPS=$((MISSING_DEPS + 1))
    fi
done

if [ $MISSING_DEPS -gt 0 ]; then
    echo ""
    echo "⚠️  Some Python dependencies are missing."
    echo "   Run: uv sync"
fi

# Check Node dependencies
echo ""
echo "Checking Node.js dependencies..."
cd "$REPO_DIR/web"

if [ -d "node_modules" ]; then
    echo "$PASS node_modules directory exists"
    
    # Check key packages
    for pkg in next react maplibre-gl deck.gl; do
        if [ -d "node_modules/$pkg" ]; then
            echo "$PASS $pkg"
        else
            echo "$FAIL $pkg (missing)"
        fi
    done
else
    echo "$WARN node_modules not found"
    echo "   Run: cd web && npm install"
fi

# Check database
cd "$REPO_DIR"
echo ""
echo "Checking data layer..."
if [ -f "data/project_radar.sqlite3" ]; then
    SIZE=$(du -h data/project_radar.sqlite3 | cut -f1)
    echo "$PASS Database: data/project_radar.sqlite3 ($SIZE)"
else
    echo "$WARN Database not found (will be created on first run)"
fi

# Check API file
echo ""
echo "Checking API implementation..."
if grep -q "app = FastAPI" src/radar/api.py 2>/dev/null; then
    echo "$PASS src/radar/api.py (FastAPI app found)"
else
    echo "$FAIL src/radar/api.py (invalid or missing)"
fi

# Check Next.js config
echo ""
echo "Checking frontend configuration..."
if [ -f "web/next.config.ts" ]; then
    echo "$PASS web/next.config.ts"
else
    echo "$FAIL web/next.config.ts (missing)"
fi

# Port availability
echo ""
echo "Checking port availability..."
for port in 8000 3000; do
    if netstat -tuln 2>/dev/null | grep -q ":$port " || ss -tuln 2>/dev/null | grep -q ":$port "; then
        echo "$WARN Port $port is in use"
    else
        echo "$PASS Port $port is available"
    fi
done

# Summary
echo ""
echo "==============================================="
echo "✅ Environment check complete!"
echo ""
echo "Next steps:"
echo "  1. Run: cd $REPO_DIR"
echo "  2. Start services: ./start-dev.sh"
echo "  3. Visit: http://localhost:3000"
echo ""
