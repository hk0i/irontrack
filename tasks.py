from invoke import task


@task
def run(c):
    """Run the dev server (npm run dev)."""
    c.run("npm run dev", pty=True)


@task
def build(c):
    """Build the production bundle (npm run build)."""
    c.run("npm run build", pty=True)


@task
def preview(c):
    """Preview the production build (npm run preview)."""
    c.run("npm run preview", pty=True)
