"""Entry point for the web server: `uvicorn thanhca.main:app`."""

from .app import create_app

app = create_app()
