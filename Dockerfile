FROM alpine/git AS gitinfo
WORKDIR /repo
COPY .git ./.git
RUN git rev-parse --short HEAD > /commit.txt

FROM nginx:alpine
COPY ./www /usr/share/nginx/html
COPY --from=gitinfo /commit.txt /tmp/commit.txt
RUN echo "export const COMMIT_HASH = '$(cat /tmp/commit.txt)';" > /usr/share/nginx/html/commit.js \
    && rm /tmp/commit.txt
EXPOSE 80
