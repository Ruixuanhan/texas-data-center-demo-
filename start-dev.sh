#!/bin/bash
# Project Radar Local Development Launcher
# Starts both the FastAPI backend and Next.js frontend

set -e

REPO_DIR="/home/qinxuan/personal_proj/texas-data-center-demo-"
BACKEND_PORT=8000
FRONTEND_PORT=3000
API_UPSTREAM="http://127.0.0.1:${BACKEND_PORT}"

echo "🚀 Project Radar Local Development Launcher"
echo "=========================================="
echo ""

# Kill any existing streamlit processes
echo "🧹 Cleaning up old Streamlit processes..."
pkill -f streamlit 2>/dev/null || true
sleep 1

# Create log directory
LOG_DIR="${REPO_DIR}/.dev-logs"
mkdir -p "$LOG_DIR"

echo "📝 Logs will be saved to: $LOG_DIR"
echo ""

# Start backend
echo "🔧 Starting FastAPI backend on port $BACKEND_PORT..."
cd "$REPO_DIR"
nohup bash -c "PYTHONPATH=src uv run uvicorn radar.api:app --port $BACKEND_PORT --reload" > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "   ✓ Backend PID: $BACKEND_PID"
echo "   📖 API docs: http://127.0.0.1:$BACKEND_PORT/docs"

sleep 3

# Start frontend
echo ""
echo "🎨 Starting Next.js frontend on port $FRONTEND_PORT..."
cd "$REPO_DIR/web"
nohup bash -c "RADAR_API_UPSTREAM=$API_UPSTREAM npm run dev -- --port $FRONTEND_PORT" > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "   ✓ Frontend PID: $FRONTEND_PID"
echo "   🌐 App: http://localhost:$FRONTEND_PORT"

echo ""
echo "=========================================="
echo "✅ Both services started!"
echo ""
echo "Monitoring logs (Ctrl+C to exit):"
echo "  Backend:  tail -f $LOG_DIR/backend.log"
echo "  Frontend: tail -f $LOG_DIR/frontend.log"
echo ""
echo "Kill all processes:"
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "Access points:"
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo "  API docs: http://127.0.0.1:$BACKEND_PORT/docs"
echo ""

# Keep the script running and show logs
tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" &
TAIL_PID=$!

# Handle cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID $TAIL_PID 2>/dev/null; echo ''; echo '🛑 Services stopped.'" EXIT

wait
