from __future__ import annotations

import zipfile
from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api")

MODELS_DIR = Path(__file__).parent.parent.parent / "models"


@router.post("/models/upload")
async def upload_model(files: List[UploadFile] = File(...)):
    """上传 Live2D 模型文件（zip 压缩包或多个散文件）"""
    if not files:
        raise HTTPException(status_code=400, detail="未选择文件")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    model_name: str = ""

    # 若含 zip 文件，以 zip 方式处理
    zip_file = next((f for f in files if f.filename and f.filename.lower().endswith(".zip")), None)
    if zip_file:
        tmp = MODELS_DIR / (zip_file.filename or "model.zip")
        content = await zip_file.read()
        tmp.write_bytes(content)
        with zipfile.ZipFile(tmp, "r") as zf:
            model_name = Path(zip_file.filename or "model").stem
            target = MODELS_DIR / model_name
            target.mkdir(exist_ok=True)
            # 若 zip 内只有一个根目录且与模型同名，直接提取内容避免双层嵌套
            names = zf.namelist()
            roots = {n.split("/")[0] for n in names if n}
            if len(roots) == 1:
                root = next(iter(roots))
                prefix = root + "/"
                for member in zf.infolist():
                    rel = member.filename[len(prefix):] if member.filename.startswith(prefix) else member.filename
                    if not rel:
                        continue
                    dest = target / rel
                    if member.filename.endswith("/"):
                        dest.mkdir(parents=True, exist_ok=True)
                    else:
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        dest.write_bytes(zf.read(member.filename))
            else:
                zf.extractall(target)
        tmp.unlink()
    else:
        # 多文件散传
        # 从 .model3.json 推断模型名
        model3_file = next(
            (f for f in files if f.filename and ".model3.json" in f.filename), None
        )
        if model3_file and model3_file.filename:
            model_name = Path(model3_file.filename).name.replace(".model3.json", "")
        elif files[0].filename:
            model_name = Path(files[0].filename).stem
        else:
            model_name = "unnamed_model"

        target = MODELS_DIR / model_name
        target.mkdir(exist_ok=True)

        for upload in files:
            if not upload.filename:
                continue
            dest = target / Path(upload.filename).name
            dest.write_bytes(await upload.read())

    return {"model_name": model_name, "path": str(MODELS_DIR / model_name)}


@router.get("/models")
async def list_models():
    """列出已上传的所有模型目录"""
    MODELS_DIR.mkdir(exist_ok=True)
    return {"models": [d.name for d in sorted(MODELS_DIR.iterdir()) if d.is_dir()]}


@router.get("/models/list")
async def list_model_files(name: str):
    """列出指定模型目录内的所有文件"""
    model_dir = MODELS_DIR / name
    if not model_dir.exists() or not model_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"模型 '{name}' 不存在")
    files = [str(f.relative_to(model_dir)) for f in sorted(model_dir.rglob("*")) if f.is_file()]
    return files
