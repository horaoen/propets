# Deployment Notes

This directory is reserved for deployment-related artifacts (for example, future SQL init scripts and release helper files).

Health check convention for Task 1:
- Backend endpoint: `GET /health` on port `8080`, returns JSON containing `{"status":"ok"}`.
- Frontend endpoint: `GET /health` on port `80`, returns plain text `ok`.
