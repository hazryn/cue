# Jeden obraz dla całego monorepo — targety dev mają hot reload,
# target prod wypuszcza backend serwujący również statyki frontendu.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

# ----------------------------------------------------------------- dev
FROM deps AS dev-api
WORKDIR /app
EXPOSE 7200
# Migracje i seed jawnie przed startem: `docker compose up` na czystej maszynie
# ma dać grę gotową do zagrania, a nie pustą bazę bez pytań. Seed jest idempotentny.
# Watcher pakietu współdzielonego chodzi obok backendu: bez niego zmiana typu
# w packages/shared nie trafiałaby do skompilowanego dist, a Nest kompilowałby
# się na starych definicjach.
CMD ["sh", "-c", "npm run build -w @cue/shared && npm run migration:run -w @cue/backend && npm run seed -w @cue/backend && (npm run dev -w @cue/shared & npm run dev -w @cue/backend)"]

FROM deps AS dev-web
WORKDIR /app
EXPOSE 7201
CMD ["npm", "run", "dev", "-w", "@cue/frontend", "--", "--host", "0.0.0.0"]

# ---------------------------------------------------------------- build
FROM deps AS build
WORKDIR /app
COPY . .
# Jawnie pusty adres API — w obrazie liczy się .env.production, nie developerskie .env
ENV VITE_API_URL=""
ENV NODE_ENV=production
RUN npm run build -w @cue/shared \
 && npm run build -w @cue/frontend \
 && npm run build -w @cue/backend

# ----------------------------------------------------------------- prod
FROM node:24-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist frontend/dist
EXPOSE 7200
CMD ["node", "backend/dist/main.js"]
