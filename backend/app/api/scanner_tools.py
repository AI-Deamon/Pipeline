from pathlib import Path
from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import Response

from app.core.config import settings

router = APIRouter(prefix="/api/v1/scanner", tags=["scanner"])

NM_SYSTEM_DIR = Path(__file__).resolve().parent.parent.parent / "nmap_system"


def verify_callback_token(x_callback_token: str = Header(...)) -> None:
    if x_callback_token != settings.CALLBACK_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid callback token")


@router.get("/scanner.py")
def get_scanner_script(x_callback_token: str = Header(..., alias="X-Callback-Token")):
    verify_callback_token(x_callback_token)
    path = NM_SYSTEM_DIR / "scanner.py"
    if not path.exists():
        raise HTTPException(status_code=404, detail="scanner.py not found")
    return Response(content=path.read_text(), media_type="text/x-python")


@router.get("/parser.py")
def get_parser_script(x_callback_token: str = Header(..., alias="X-Callback-Token")):
    verify_callback_token(x_callback_token)
    path = NM_SYSTEM_DIR / "parser.py"
    if not path.exists():
        raise HTTPException(status_code=404, detail="parser.py not found")
    return Response(content=path.read_text(), media_type="text/x-python")
