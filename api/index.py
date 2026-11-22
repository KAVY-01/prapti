"""Entry point for hosting on Vercel (serverless). Locally, run `python app.py` instead."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402,F401  (Vercel serves this WSGI app)
