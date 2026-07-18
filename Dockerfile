FROM node:22-alpine AS build
RUN apk add --no-cache git
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: postinstall runs scripts/vendor.mjs, which populates
# www/vendor/ for the old zero-build app — not needed here since Vite
# bundles vue/dexie directly, and scripts/ isn't copied in yet anyway.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
