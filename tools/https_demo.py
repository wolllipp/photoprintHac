"""HTTPS для демо на телефоне: Safari даёт микрофон и распознавание речи (голос в ассистенте) только по https.

Один адрес https://<ip>:8443 отдаёт страницы design/ и пересылает запросы:
  /api/... → сервер приложения (http://127.0.0.1:8000)
  /ai/...  → ассистент (http://127.0.0.1:8001), ответы потоком (SSE) не буферизуются
Сертификат самоподписанный (создаётся рядом, в tools/.cert, в git не попадает): на телефоне один раз
«Показать подробности → Посетить веб-сайт».

Запуск:  uv run --no-project --with fastapi --with uvicorn --with httpx --with cryptography python tools/https_demo.py 172.20.10.4
Ассистент на телефоне:
  https://<ip>:8443/assistant/?api=https://<ip>:8443/ai&data=https://<ip>:8443/api/insight/data
"""
import datetime
import ipaddress
import sys
from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask

ROOT = Path(__file__).resolve().parents[1]
CERT_DIR = Path(__file__).resolve().parent / ".cert"
UPSTREAM = {"api": "http://127.0.0.1:8000", "ai": "http://127.0.0.1:8001"}
PASS = {"authorization", "content-type", "x-role", "idempotency-key", "accept"}


def make_cert(ip: str) -> tuple[Path, Path]:
    """Самоподписанный сертификат на этот IP и localhost (на год)."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    CERT_DIR.mkdir(exist_ok=True)
    key_path, cert_path = CERT_DIR / f"{ip}.key", CERT_DIR / f"{ip}.crt"
    if key_path.exists() and cert_path.exists():
        return cert_path, key_path
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "picPac demo")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=365))
            .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address(ip)), x509.DNSName("localhost")]),
                           critical=False)
            .sign(key, hashes.SHA256()))
    key_path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                                           serialization.NoEncryption()))
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    return cert_path, key_path


app = FastAPI()
client = httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=10.0))


@app.api_route("/{target}/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy(target: str, path: str, request: Request):
    if target not in UPSTREAM:
        # не прокси — статические страницы
        return await static(request)
    url = f"{UPSTREAM[target]}/{path}"
    headers = {k: v for k, v in request.headers.items() if k.lower() in PASS}
    req = client.build_request(request.method, url, params=request.query_params, headers=headers,
                               content=await request.body())
    resp = await client.send(req, stream=True)
    keep = {k: v for k, v in resp.headers.items() if k.lower() in {"content-type", "cache-control", "content-disposition"}}
    # поток закрываем, когда ответ ушёл целиком
    return StreamingResponse(resp.aiter_raw(), status_code=resp.status_code, headers=keep, background=BackgroundTask(resp.aclose))


files = StaticFiles(directory=ROOT / "design", html=True)


async def static(request: Request):
    return await files.get_response(request.url.path.lstrip("/"), request.scope)


app.mount("/", files, name="design")

if __name__ == "__main__":
    ip = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    cert, key = make_cert(ip)
    print(f"Ассистент на телефоне: https://{ip}:8443/assistant/?api=https://{ip}:8443/ai&data=https://{ip}:8443/api/insight/data")
    uvicorn.run(app, host="0.0.0.0", port=8443, ssl_certfile=str(cert), ssl_keyfile=str(key))
