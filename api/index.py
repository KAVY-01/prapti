"""Entry point for hosting on Vercel (serverless). Locally, run `python app.py` instead.

vercel.json sends every request to this function as /api/index?__p=<original path>.
The small wrapper below puts the original path back, so Flask's routes work unchanged.
"""
import os
import sys
from urllib.parse import parse_qsl, urlencode

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402  (Vercel serves this WSGI app)

_flask_wsgi = app.wsgi_app


def _restore_path(environ, start_response):
    pairs = parse_qsl(environ.get("QUERY_STRING", ""), keep_blank_values=True)
    path = next((v for k, v in pairs if k == "__p"), None)
    if path is not None:
        environ["PATH_INFO"] = "/" + path.lstrip("/")
        environ["QUERY_STRING"] = urlencode([(k, v) for k, v in pairs if k != "__p"])
    return _flask_wsgi(environ, start_response)


app.wsgi_app = _restore_path
