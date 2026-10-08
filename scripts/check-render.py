"""Read-only Render access check; never print API keys or raw responses."""
import json
import os
import ssl
import sys
import urllib.error
import urllib.request

key = os.environ.get("RENDER_API_KEY")
if not key:
    print("Render access missing: enter RENDER_API_KEY in secure environment settings.")
    sys.exit(2)

request = urllib.request.Request(
    "https://api.render.com/v1/owners?limit=20",
    headers={"Authorization": "Bearer " + key, "Accept": "application/json"},
)
try:
    context = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE"))
    with urllib.request.urlopen(request, context=context, timeout=20) as response:
        owners = json.load(response)
    if not isinstance(owners, list):
        print("Render response format needs investigation.")
        sys.exit(1)
    print("Render API access verified; available owners:", len(owners))
except urllib.error.HTTPError as error:
    print("Render API rejected access; HTTP", error.code)
    sys.exit(1)
except (urllib.error.URLError, TimeoutError):
    print("Render API is unreachable; check network settings and proxy binding.")
    sys.exit(1)
