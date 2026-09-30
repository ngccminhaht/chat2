FROM node:22-bookworm-slim AS build

WORKDIR /repo

COPY frontend/package.json ./frontend/package.json
COPY frontend/ ./frontend/

# Build the embeddable widget from source into frontend/public before Next.js.
COPY widget/package.json ./widget/package.json
COPY widget/ ./widget/
RUN cd widget && npm install && npm run build

RUN cd frontend && npm install --legacy-peer-deps

# NEXT_PUBLIC_* values are embedded into the browser bundle at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api
ARG NEXT_PUBLIC_WS_URL=http://localhost:3000
ARG NEXT_PUBLIC_KEYCLOAK_URL
ARG NEXT_PUBLIC_KEYCLOAK_REALM
ARG NEXT_PUBLIC_KEYCLOAK_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV NEXT_PUBLIC_KEYCLOAK_URL=${NEXT_PUBLIC_KEYCLOAK_URL}
ENV NEXT_PUBLIC_KEYCLOAK_REALM=${NEXT_PUBLIC_KEYCLOAK_REALM}
ENV NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=${NEXT_PUBLIC_KEYCLOAK_CLIENT_ID}

RUN cd frontend && npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
WORKDIR /app

COPY --from=build --chown=node:node /repo/frontend/package.json ./package.json
COPY --from=build --chown=node:node /repo/frontend/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/frontend/.next ./.next
COPY --from=build --chown=node:node /repo/frontend/public ./public
COPY --from=build --chown=node:node /repo/frontend/next.config.js ./next.config.js
COPY --from=build --chown=node:node /repo/frontend/i18n ./i18n
COPY --from=build --chown=node:node /repo/frontend/messages ./messages

USER node
EXPOSE 8315
CMD ["npm", "run", "start"]
