// Overwritten at deploy time with the short hash of the commit being
// deployed — see .github/workflows/deploy-pages.yml and the Dockerfile's
// GIT_COMMIT build arg. Left as 'dev' for local dev / any checkout that
// hasn't gone through either deploy path, so it's obvious when the commit
// display isn't meaningful.
export const COMMIT_HASH = 'dev';
