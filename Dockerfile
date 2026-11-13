FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./backend/

RUN cd backend && npm ci --omit=dev

COPY backend ./backend

COPY frontend ./frontend

ENV PORT=5001

ENV DATA_FILE=/app/backend/data/users.json

EXPOSE 5001

CMD ["node", "backend/server.js"]
