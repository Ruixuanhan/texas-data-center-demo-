#!/bin/bash
# Project Radar Local Development Launcher
# Starts both the FastAPI backend and Next.js frontend under one supervisor process

set -e

REPO_DIR="/home/qinxuan/personal_proj/texas-data-center-demo-"
BACKEND_PORT=8000
FRONTEND_PORT=3000
API_UPSTREAM="http://127.0.0.1:${BACKEND_PORT}"

echo "🚀 Project Radar Local Development Launcher"
echo "=========================================="
echo ""

wait_for_port_release() {
	local port="$1"

	for _ in {1..25}; do
		if ! lsof -ti tcp:"$port" >/dev/null 2>&1; then
			return 0
		fi
		sleep 0.2
	done

	echo "   ✗ Port $port is still in use after cleanup."
	exit 1
}

kill_matching_processes() {
	local label="$1"
	local pattern="$2"
	local pids

	pids=$(pgrep -f "$pattern" 2>/dev/null || true)
	if [[ -z "$pids" ]]; then
		return 0
	fi

	echo "   • Stopping $label PID(s): $pids"
	kill $pids 2>/dev/null || true
}

kill_listener() {
	local port="$1"
	local pids

	pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
	if [[ -z "$pids" ]]; then
		return 0
	fi

	echo "   • Reclaiming port $port from PID(s): $pids"
	kill $pids 2>/dev/null || true
	wait_for_port_release "$port"
}

cleanup() {
	if [[ -n "${TAIL_PID:-}" ]]; then
		kill "$TAIL_PID" 2>/dev/null || true
	fi

	if [[ -n "${FRONTEND_PID:-}" ]]; then
		kill -TERM -- "-$FRONTEND_PID" 2>/dev/null || true
	fi

	if [[ -n "${BACKEND_PID:-}" ]]; then
		kill -TERM -- "-$BACKEND_PID" 2>/dev/null || true
	fi

	wait 2>/dev/null || true
	echo ""
	echo "🛑 Services stopped."
}

trap cleanup EXIT INT TERM

echo "🧹 Cleaning up existing dev processes..."
pkill -f streamlit 2>/dev/null || true
kill_matching_processes "backend dev" "uvicorn radar.api:app --port $BACKEND_PORT"
kill_matching_processes "frontend dev" "next dev --port $FRONTEND_PORT"
kill_matching_processes "frontend npm wrapper" "npm run dev -- --port $FRONTEND_PORT"
kill_listener "$BACKEND_PORT"
kill_listener "$FRONTEND_PORT"

# Create log directory
LOG_DIR="${REPO_DIR}/.dev-logs"
mkdir -p "$LOG_DIR"

echo "📝 Logs will be saved to: $LOG_DIR"
echo ""

# Start backend
echo "🔧 Starting FastAPI backend on port $BACKEND_PORT..."
cd "$REPO_DIR"
setsid bash -c "PYTHONPATH=src uv run uvicorn radar.api:app --port $BACKEND_PORT --reload" > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "   ✓ Backend PID: $BACKEND_PID"
echo "   📖 API docs: http://127.0.0.1:$BACKEND_PORT/docs"

sleep 3

# Start frontend
echo ""
echo "🎨 Starting Next.js frontend on port $FRONTEND_PORT..."
cd "$REPO_DIR/web"
setsid bash -c "NEXT_PUBLIC_RADAR_API_URL=$API_UPSTREAM npm run dev -- --port $FRONTEND_PORT" > "$LOG_DIR/frontend.log" 2>&1 &
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
echo "Access points:"
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo "  API docs: http://127.0.0.1:$BACKEND_PORT/docs"
echo ""

# Keep the script running and show logs
tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" &
TAIL_PID=$!

wait
