"""Run the FormMitra API server.

    uv run main.py            # http://127.0.0.1:8000

The frontend proxies /api here during development, so start this first, then
`cd frontend && npm run dev`.
"""

import uvicorn


def main():
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()
